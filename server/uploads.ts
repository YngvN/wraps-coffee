import { existsSync, mkdirSync, readdirSync, readFileSync, statfsSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { basename, dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import { mirrorFile } from './backup'
import { CORS_HEADERS, readJsonBody, sendJson } from './http'

const __dirname = dirname(fileURLToPath(import.meta.url))
export const UPLOADS_DIR = join(__dirname, 'uploads')
mkdirSync(UPLOADS_DIR, { recursive: true })

// Staging area for a video upload's raw source while it's being transcoded
// (see server/videoUploads.ts) — defined here, not there, so this file (the
// shared upload primitive both uploads.ts and videoUploads.ts build on)
// never has to import from the video-specific module and create a cycle.
export const VIDEO_PENDING_DIR = join(UPLOADS_DIR, '.pending')
mkdirSync(VIDEO_PENDING_DIR, { recursive: true })

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
  mp4: 'video/mp4',
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
 * Saves the uploaded original, then generates three compressed WebP
 * companions alongside it (`-small` for mobile/slow-connection viewers,
 * `-thumb` for small-image contexts like the Image Library grid, `-blur`
 * pre-blurred and downsized for a pane's own blurred backdrop — see
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
  const originalPath = join(UPLOADS_DIR, filename)
  writeFileSync(originalPath, buffer)
  mirrorFile(originalPath)

  try {
    const small = await sharp(buffer).resize({ width: 800, withoutEnlargement: true }).webp({ quality: 70 }).toBuffer()
    const smallPath = join(UPLOADS_DIR, `${id}-small.webp`)
    writeFileSync(smallPath, small)
    mirrorFile(smallPath)
    const thumb = await sharp(buffer).resize({ width: 240, withoutEnlargement: true }).webp({ quality: 50 }).toBuffer()
    const thumbPath = join(UPLOADS_DIR, `${id}-thumb.webp`)
    writeFileSync(thumbPath, thumb)
    mirrorFile(thumbPath)
    // Downsized before blurring — blurred content has no fine detail to lose,
    // so this is both a faster sharp pass and a much smaller file than
    // blurring the full-resolution original live in the browser every frame.
    const blurred = await sharp(buffer).resize({ width: 480, withoutEnlargement: true }).blur(20).webp({ quality: 60 }).toBuffer()
    const blurPath = join(UPLOADS_DIR, `${id}-blur.webp`)
    writeFileSync(blurPath, blurred)
    mirrorFile(blurPath)
  } catch (error) {
    console.error('[uploads] compression failed, original still saved:', error)
  }

  console.log(`[uploads] saved ${filename} (${buffer.length} bytes)`)
  sendJson(res, 201, { url: `http://${host}/uploads/${filename}` })
}

/** Serves the original, or (with `?size=small|thumb|blur`) its compressed companion if one exists — falls back to the original if the requested variant is missing (e.g. an upload saved before that variant existed). */
export function handleServeUpload(res: ServerResponse, requestedFilename: string, size: string | null) {
  const safeName = basename(requestedFilename)
  let targetName = safeName

  if (size === 'small' || size === 'thumb' || size === 'blur') {
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

/** Removes the original and all of its `-small`/`-thumb`/`-blur` companions and status/name markers, if present, plus (for a video whose transcode never finished) its still-staged source. Idempotent — always succeeds even if nothing existed. Shared by `handleDeleteUpload` (the Media Library's own manual delete) and `server/storageCleanup.ts` (the admin-confirmed orphaned-image sweep), so both go through the exact same on-disk + backup-mirroring behavior. */
export function deleteUploadFiles(requestedFilename: string) {
  const safeName = basename(requestedFilename)
  const stem = stemOf(safeName)

  for (const name of [
    safeName,
    `${stem}-small.webp`,
    `${stem}-thumb.webp`,
    `${stem}-blur.webp`,
    `${safeName}.processing`,
    `${safeName}.error`,
    `${safeName}.name`,
  ]) {
    const filePath = join(UPLOADS_DIR, name)
    if (existsSync(filePath)) unlinkSync(filePath)
    // Mirrors the deletion too (mirrorFile removes its own copy when the
    // source no longer exists) so the backup doesn't accumulate orphans.
    mirrorFile(filePath)
  }

  const stagedSource = join(VIDEO_PENDING_DIR, `${stem}.src`)
  if (existsSync(stagedSource)) {
    unlinkSync(stagedSource)
    mirrorFile(stagedSource)
  }
}

/** HTTP wrapper around `deleteUploadFiles` for the Media Library's own manual "delete" action. */
export function handleDeleteUpload(res: ServerResponse, requestedFilename: string) {
  deleteUploadFiles(requestedFilename)
  res.writeHead(204, CORS_HEADERS)
  res.end()
}

export interface UploadListEntry {
  filename: string
  url: string
  thumbUrl: string
  sizeBytes: number
  uploadedAt: string
  /** Derived purely from extension — every video is always canonicalized to `.mp4` on a successful transcode, so this is unambiguous with no extra bookkeeping. */
  kind: 'image' | 'video'
  /** Omitted for images (always synchronously ready). Only ever set for a video mid-transcode or one whose transcode failed. */
  status?: 'processing' | 'failed'
  /** Only present alongside `status: 'failed'`. */
  errorMessage?: string
  /** User-set label from the Media Library's rename action, if any — falls back to the raw filename in the UI when unset. */
  displayName?: string
}

/** Reads a video's own `.processing`/`.error` status markers (see `server/videoUploads.ts`), if any — `undefined` status means the file is a plain ready upload (every image, and a video whose transcode already succeeded). */
function readUploadStatus(filename: string): Pick<UploadListEntry, 'status' | 'errorMessage'> {
  if (existsSync(join(UPLOADS_DIR, `${filename}.processing`))) return { status: 'processing' }
  const errorPath = join(UPLOADS_DIR, `${filename}.error`)
  if (existsSync(errorPath)) return { status: 'failed', errorMessage: readFileSync(errorPath, 'utf-8') }
  return {}
}

function readDisplayName(filename: string): string | undefined {
  const namePath = join(UPLOADS_DIR, `${filename}.name`)
  return existsSync(namePath) ? readFileSync(namePath, 'utf-8') : undefined
}

/** Lists every original upload (excluding `-small`/`-thumb`/`-blur` companions and status/name marker files, so each upload appears once), newest first. */
export function listUploads(host: string): UploadListEntry[] {
  const files = readdirSync(UPLOADS_DIR).filter((name) => {
    if (name === '.gitkeep' || name === '.pending') return false
    if (name.endsWith('-small.webp') || name.endsWith('-thumb.webp') || name.endsWith('-blur.webp')) return false
    if (name.endsWith('.processing') || name.endsWith('.error') || name.endsWith('.name')) return false
    return true
  })

  return files
    .map((filename) => {
      const stats = statSync(join(UPLOADS_DIR, filename))
      const kind: UploadListEntry['kind'] = extname(filename).toLowerCase() === '.mp4' ? 'video' : 'image'
      return {
        filename,
        url: `http://${host}/uploads/${filename}`,
        thumbUrl: `http://${host}/uploads/${filename}?size=thumb`,
        sizeBytes: stats.size,
        uploadedAt: stats.mtime.toISOString(),
        kind,
        ...readUploadStatus(filename),
        displayName: readDisplayName(filename),
      }
    })
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))
}

/** Sets or clears (`displayName: ''`) a user-chosen label for an upload — the "rename" the original Image Library's own deferred comment mentioned. Applies to both images and videos. */
export function handleRenameUpload(req: IncomingMessage, res: ServerResponse, requestedFilename: string) {
  const safeName = basename(requestedFilename)
  readJsonBody(req)
    .then((body) => {
      const { displayName } = body as { displayName?: string }
      const namePath = join(UPLOADS_DIR, `${safeName}.name`)
      const trimmed = typeof displayName === 'string' ? displayName.trim() : ''
      if (trimmed) writeFileSync(namePath, trimmed, 'utf-8')
      else if (existsSync(namePath)) unlinkSync(namePath)
      mirrorFile(namePath)
      sendJson(res, 200, { displayName: trimmed || undefined })
    })
    .catch(() => sendJson(res, 400, { error: 'Malformed request body' }))
}

/** Total bytes actually on disk under `UPLOADS_DIR` (originals + every companion/marker) and bytes still free on that volume — lets the Media Library warn before a kiosk's disk actually fills up. */
export function handleStorageUsage(res: ServerResponse) {
  const usedBytes = readdirSync(UPLOADS_DIR).reduce((total, name) => {
    const path = join(UPLOADS_DIR, name)
    const stats = statSync(path)
    return stats.isFile() ? total + stats.size : total
  }, 0)
  const volume = statfsSync(UPLOADS_DIR)
  const availableBytes = volume.bavail * volume.bsize
  sendJson(res, 200, { usedBytes, availableBytes })
}
