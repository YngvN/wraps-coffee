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

/** The filename's stem without its extension — used to derive `<stem>-small.webp`/`<stem>-thumb.webp` companion filenames. Exported for `screensSnapshots.ts`'s own lazy-pinning hook, which needs to locate an original's existing variant files on disk. */
export function stemOf(filename: string): string {
  const ext = extname(filename)
  return ext ? filename.slice(0, -ext.length) : filename
}

/**
 * Every size suffix `handleUpload` generates a `.webp` companion for, and the single list all three
 * consumers derive from: `handleServeUpload`'s own `?size=` allowlist, `deleteUploadFiles` (so a
 * delete never leaves an orphaned derivative behind), and `listUploads` (so a derivative is never
 * listed as if it were an upload of its own).
 *
 * Kept as one exported constant specifically because those three used to spell the suffixes out
 * separately — adding a size meant remembering all three, and missing one fails quietly rather than
 * loudly (an orphan on disk, or a phantom entry in the Media Library).
 */
export const UPLOAD_VARIANT_SUFFIXES = ['small', 'thumb', 'blur', 'medium', 'tiny'] as const

/** Every derivative filename for an upload's own stem, e.g. `<stem>-small.webp`. */
function variantFilenames(stem: string): string[] {
  return UPLOAD_VARIANT_SUFFIXES.map((suffix) => `${stem}-${suffix}.webp`)
}

/** Whether `name` is one of an upload's generated derivatives rather than an original. */
function isVariantFilename(name: string): boolean {
  return UPLOAD_VARIANT_SUFFIXES.some((suffix) => name.endsWith(`-${suffix}.webp`))
}

/**
 * Saves the uploaded original, then generates a compressed WebP companion at each width in
 * `UPLOAD_VARIANT_SUFFIXES` alongside it: `-thumb` (240px) for small-image contexts like the Image
 * Library grid, `-tiny` (480px) for a display explicitly capped to the lowest tier, `-small` (800px)
 * for narrow viewports and small live previews, `-medium` (1600px) for a full-bleed pane on a 1080p
 * or larger display, and `-blur` (480px, pre-blurred) for a pane's own blurred backdrop — see
 * "Responsive image variants" in the sync-server plan. A compression failure (e.g. a corrupt image)
 * still leaves the original saved and usable, just without the smaller variants.
 *
 * The original is deliberately stored at its native resolution with no dimension cap (only
 * `MAX_UPLOAD_BYTES` bounds it), so it stays the archival source every derivative can be regenerated
 * from. Protecting a weak display from an oversized decode is the *serving* side's job — see
 * `pickImageVariant` and `DisplayMachine.maxImagePx`.
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

  // Every size comes from the one shared `VARIANT_RECIPES` table, so a variant generated here and the
  // same variant generated later on demand (`generateMissingVariant`) can never end up at different
  // widths or qualities.
  for (const suffix of UPLOAD_VARIANT_SUFFIXES) {
    try {
      const variantPath = join(UPLOADS_DIR, `${id}-${suffix}.webp`)
      writeFileSync(variantPath, await VARIANT_RECIPES[suffix](sharp(buffer)).toBuffer())
      mirrorFile(variantPath)
    } catch (error) {
      // Per-variant rather than one try around all of them: a failure on one size shouldn't cost the
      // others. Any that fail here are regenerated on first request anyway.
      console.error(`[uploads] ${suffix} compression failed, original still saved:`, error)
    }
  }

  console.log(`[uploads] saved ${filename} (${buffer.length} bytes)`)
  sendJson(res, 201, { url: `http://${host}/uploads/${filename}` })
}

/** The sharp pipeline behind each variant suffix — the single definition `handleUpload` and the lazy backfill in `handleServeUpload` both use, so a size can never be generated at one width on upload and a different one on demand. */
const VARIANT_RECIPES: Record<(typeof UPLOAD_VARIANT_SUFFIXES)[number], (input: sharp.Sharp) => sharp.Sharp> = {
  thumb: (input) => input.resize({ width: 240, withoutEnlargement: true }).webp({ quality: 50 }),
  tiny: (input) => input.resize({ width: 480, withoutEnlargement: true }).webp({ quality: 60 }),
  small: (input) => input.resize({ width: 800, withoutEnlargement: true }).webp({ quality: 70 }),
  medium: (input) => input.resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 75 }),
  // Downsized before blurring — blurred content has no fine detail to lose, so this is both a faster
  // sharp pass and a much smaller file than blurring the full-resolution original in the browser.
  blur: (input) => input.resize({ width: 480, withoutEnlargement: true }).blur(20).webp({ quality: 60 }),
}

/**
 * Generates one missing variant from an upload's own original, on demand, and caches it to disk.
 *
 * Exists because variants are otherwise only ever written at upload time, so adding a new size to
 * `UPLOAD_VARIANT_SUFFIXES` would apply to *future* uploads only — every image already in the library
 * would silently keep falling back to its full-size original, and any feature built on the new size
 * (a display's own `maxImagePx` cap, rendered-size variant picking) would do nothing at all on real
 * existing data. Doing it here rather than as a one-off migration means it also self-heals a variant
 * lost to a failed `sharp` pass at upload time, or to a partial backup restore.
 *
 * Best-effort and non-fatal: a failure returns `undefined` and the caller serves the original, which
 * is exactly the pre-existing behaviour. Returns the generated filename on success.
 */
async function generateMissingVariant(originalName: string, size: (typeof UPLOAD_VARIANT_SUFFIXES)[number]): Promise<string | undefined> {
  const originalPath = join(UPLOADS_DIR, originalName)
  // Videos share this directory and are served through the same route; only images have variants.
  if (!existsSync(originalPath) || extname(originalName).slice(1) === 'mp4') return undefined
  try {
    const variantName = `${stemOf(originalName)}-${size}.webp`
    const variantPath = join(UPLOADS_DIR, variantName)
    const output = await VARIANT_RECIPES[size](sharp(readFileSync(originalPath))).toBuffer()
    writeFileSync(variantPath, output)
    mirrorFile(variantPath)
    console.log(`[uploads] generated missing ${size} variant for ${originalName}`)
    return variantName
  } catch (error) {
    console.error(`[uploads] could not generate ${size} variant for ${originalName}:`, error)
    return undefined
  }
}

/** Serves the original, or (with `?size=tiny|thumb|small|medium|blur`, see `UPLOAD_VARIANT_SUFFIXES`) its compressed companion — generating that companion on first request if it doesn't exist yet (see `generateMissingVariant`), and falling back to the original if it can't be produced at all. */
export async function handleServeUpload(res: ServerResponse, requestedFilename: string, size: string | null) {
  const safeName = basename(requestedFilename)
  let targetName = safeName

  if (size !== null && (UPLOAD_VARIANT_SUFFIXES as readonly string[]).includes(size)) {
    const variantSize = size as (typeof UPLOAD_VARIANT_SUFFIXES)[number]
    const variantName = `${stemOf(safeName)}-${variantSize}.webp`
    if (existsSync(join(UPLOADS_DIR, variantName))) targetName = variantName
    else targetName = (await generateMissingVariant(safeName, variantSize)) ?? safeName
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

/**
 * Callbacks invoked with an original upload's own filename right before
 * `deleteUploadFiles` unlinks anything, while every one of its files (the
 * original + every generated variant) is still intact on disk. Registered
 * via `registerBeforeUploadDeleteHook` rather than a static import of
 * whichever module needs this — `screensSnapshots.ts` is the one real user
 * today (lazily pinning an image into any retained snapshot that still
 * references it, see that file's own `pinIfSnapshotReferenced`), and it
 * already needs to import this module's own `UPLOADS_DIR`/`stemOf`/
 * `UPLOAD_VARIANT_SUFFIXES` for that; a static import back from here to
 * there would be circular (this codebase deliberately avoids that pattern —
 * see `backup.ts`'s own module doc comment for the same reasoning applied
 * to `store.ts`/`uploads.ts`).
 */
type BeforeUploadDeleteHook = (originalFilename: string) => void
const beforeUploadDeleteHooks: BeforeUploadDeleteHook[] = []

export function registerBeforeUploadDeleteHook(hook: BeforeUploadDeleteHook) {
  beforeUploadDeleteHooks.push(hook)
}

/** Removes the original and all of its generated size companions (see `UPLOAD_VARIANT_SUFFIXES`) and status/name markers, if present, plus (for a video whose transcode never finished) its still-staged source. Idempotent — always succeeds even if nothing existed. Shared by `handleDeleteUpload` (the Media Library's own manual delete) and `server/storageCleanup.ts` (the admin-confirmed orphaned-image sweep), so both go through the exact same on-disk + backup-mirroring behavior — and, via the hooks above, the same lazy-pinning check, regardless of which caller triggered the delete. */
export function deleteUploadFiles(requestedFilename: string) {
  const safeName = basename(requestedFilename)
  const stem = stemOf(safeName)

  // Run before anything is unlinked — a hook needs every file (original +
  // variants) still present to actually pin a copy of them.
  for (const hook of beforeUploadDeleteHooks) hook(safeName)

  for (const name of [
    safeName,
    ...variantFilenames(stem),
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

/** Lists every original upload (excluding generated size companions, see `UPLOAD_VARIANT_SUFFIXES`, and status/name marker files, so each upload appears once), newest first. */
export function listUploads(host: string): UploadListEntry[] {
  const files = readdirSync(UPLOADS_DIR).filter((name) => {
    if (name === '.gitkeep' || name === '.pending') return false
    if (isVariantFilename(name)) return false
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
