import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { basename, dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import { CORS_HEADERS, sendJson } from './http'

const __dirname = dirname(fileURLToPath(import.meta.url))
export const UPLOADS_DIR = join(__dirname, 'uploads')
mkdirSync(UPLOADS_DIR, { recursive: true })

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

const CONTENT_TYPE_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

const EXT_TO_CONTENT_TYPE: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
}

async function readBody(req: IncomingMessage, maxBytes: number): Promise<Buffer> {
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of req) {
    total += (chunk as Buffer).length
    if (total > maxBytes) throw new Error('PAYLOAD_TOO_LARGE')
    chunks.push(chunk as Buffer)
  }
  return Buffer.concat(chunks)
}

/** The filename's stem without its extension — used to derive `<stem>-small.webp`/`<stem>-thumb.webp` companion filenames. */
function stemOf(filename: string): string {
  const ext = extname(filename)
  return ext ? filename.slice(0, -ext.length) : filename
}

/**
 * Saves the uploaded original, then generates two compressed WebP
 * companions alongside it (`-small` for mobile/slow-connection viewers,
 * `-thumb` for small-image contexts like the Image Library grid) — see
 * "Responsive image variants" in the sync-server plan. A compression
 * failure (e.g. a corrupt image) still leaves the original saved and
 * usable, just without the smaller variants.
 */
export async function handleUpload(req: IncomingMessage, res: ServerResponse, host: string) {
  const contentType = req.headers['content-type'] ?? ''
  const ext = CONTENT_TYPE_TO_EXT[contentType]
  if (!ext) {
    sendJson(res, 415, { error: 'Unsupported content type — expected an image/* upload' })
    return
  }

  let buffer: Buffer
  try {
    buffer = await readBody(req, MAX_UPLOAD_BYTES)
  } catch {
    sendJson(res, 413, { error: 'File too large (10MB limit)' })
    return
  }

  const id = randomUUID()
  const filename = `${id}.${ext}`
  writeFileSync(join(UPLOADS_DIR, filename), buffer)

  try {
    const small = await sharp(buffer).resize({ width: 800, withoutEnlargement: true }).webp({ quality: 70 }).toBuffer()
    writeFileSync(join(UPLOADS_DIR, `${id}-small.webp`), small)
    const thumb = await sharp(buffer).resize({ width: 240, withoutEnlargement: true }).webp({ quality: 50 }).toBuffer()
    writeFileSync(join(UPLOADS_DIR, `${id}-thumb.webp`), thumb)
  } catch (error) {
    console.error('[uploads] compression failed, original still saved:', error)
  }

  console.log(`[uploads] saved ${filename} (${buffer.length} bytes)`)
  sendJson(res, 201, { url: `http://${host}/uploads/${filename}` })
}

/** Serves the original, or (with `?size=small|thumb`) its compressed companion if one exists — falls back to the original if the requested variant is missing. */
export function handleServeUpload(res: ServerResponse, requestedFilename: string, size: string | null) {
  const safeName = basename(requestedFilename)
  let targetName = safeName

  if (size === 'small' || size === 'thumb') {
    const variantName = `${stemOf(safeName)}-${size}.webp`
    if (existsSync(join(UPLOADS_DIR, variantName))) targetName = variantName
  }

  const filePath = join(UPLOADS_DIR, targetName)
  if (!filePath.startsWith(UPLOADS_DIR) || !existsSync(filePath)) {
    sendJson(res, 404, { error: 'Not found' })
    return
  }

  const ext = extname(targetName).slice(1)
  res.writeHead(200, {
    'Content-Type': EXT_TO_CONTENT_TYPE[ext] ?? 'application/octet-stream',
    // Safe because every filename is unique-per-upload and never mutated in
    // place — a replace always creates a new file and deletes the old.
    'Cache-Control': 'public, max-age=31536000, immutable',
    ...CORS_HEADERS,
  })
  res.end(readFileSync(filePath))
}

/** Removes the original and both its `-small`/`-thumb` companions, if present. Idempotent — always succeeds even if nothing existed. */
export function handleDeleteUpload(res: ServerResponse, requestedFilename: string) {
  const safeName = basename(requestedFilename)
  const stem = stemOf(safeName)

  for (const name of [safeName, `${stem}-small.webp`, `${stem}-thumb.webp`]) {
    const filePath = join(UPLOADS_DIR, name)
    if (existsSync(filePath)) unlinkSync(filePath)
  }

  res.writeHead(204, CORS_HEADERS)
  res.end()
}

export interface UploadListEntry {
  filename: string
  url: string
  thumbUrl: string
  sizeBytes: number
  uploadedAt: string
}

/** Lists every original upload (excluding `-small`/`-thumb` companions, so each upload appears once), newest first. */
export function listUploads(host: string): UploadListEntry[] {
  const files = readdirSync(UPLOADS_DIR).filter((name) => !name.endsWith('-small.webp') && !name.endsWith('-thumb.webp') && name !== '.gitkeep')

  return files
    .map((filename) => {
      const stats = statSync(join(UPLOADS_DIR, filename))
      return {
        filename,
        url: `http://${host}/uploads/${filename}`,
        thumbUrl: `http://${host}/uploads/${filename}?size=thumb`,
        sizeBytes: stats.size,
        uploadedAt: stats.mtime.toISOString(),
      }
    })
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))
}
