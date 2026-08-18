import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import type { ServerResponse } from 'node:http'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { pickNewsImageWidth } from '../src/types/news'
import { CORS_HEADERS, sendJson } from './http'

const __dirname = dirname(fileURLToPath(import.meta.url))
/**
 * Deliberately *not* mirrored to the backup folder (see `server/backup.ts`'s
 * own `mirrorFile` and the project-wide rule that any new persisted-data
 * location needs to be wired into it) — every file here is a disposable,
 * re-fetchable copy of a publicly hosted news image, the same "derived,
 * never user-authored" posture already used for `news.ts`'s own in-memory
 * headline cache. Losing this folder just means the next view re-fetches.
 */
export const NEWS_IMAGE_CACHE_DIR = join(__dirname, 'news-image-cache')
mkdirSync(NEWS_IMAGE_CACHE_DIR, { recursive: true })

/** A headline shown repeatedly across rotations hits disk instead of the source outlet's own server for up to an hour before its next refresh. */
const IMAGE_CACHE_TTL_MS = 60 * 60_000

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

/** Resolves a requested `?w=` through the same shared bucket list the client picks from, so the two can never disagree about which sizes exist. `undefined` means "serve the original bytes" — the behaviour for an absent, unparseable, or larger-than-the-largest-bucket request, which keeps every pre-`?w=` caller working unchanged. */
function resolveWidth(requested: string | null): number | undefined {
  if (!requested) return undefined
  return pickNewsImageWidth(Number(requested))
}

/**
 * Cache key includes the width, so each size is its own file and the original stays cached alongside
 * its derivatives. `width === undefined` keeps the original's historic key exactly as it was, so
 * files already on disk from before `?w=` existed are still found rather than silently re-fetched.
 */
function cacheKeyFor(src: string, width?: number): string {
  const hash = createHash('sha1').update(src).digest('hex')
  return width === undefined ? hash : `${hash}@${width}`
}

/** The currently-cached file for `key`, regardless of which extension it was last saved under (the upstream image's own content-type can change between fetches). */
function findCachedFile(key: string): string | undefined {
  // `${key}.` rather than `key` alone: without the dot, the original's own key is a prefix of every
  // width-suffixed key, so looking up the original would return a resized derivative at random.
  return readdirSync(NEWS_IMAGE_CACHE_DIR).find((name) => name.startsWith(`${key}.`))
}

function serveFile(res: ServerResponse, filePath: string) {
  const ext = extname(filePath).slice(1)
  res.writeHead(200, {
    'Content-Type': EXT_TO_CONTENT_TYPE[ext] ?? 'application/octet-stream',
    'Cache-Control': 'public, max-age=3600',
    ...CORS_HEADERS,
  })
  res.end(readFileSync(filePath))
}

/**
 * Serves `GET /news/image?src=<original image URL>[&w=<px>]` — fetches-and-caches
 * the image to disk the first time (or once the cached copy is older than
 * `IMAGE_CACHE_TTL_MS`), serving the disk copy on every request in between.
 * A failed re-fetch with a stale copy still on disk serves that stale copy
 * rather than erroring — an outdated image beats a broken `<img>`.
 *
 * `w` downscales to the nearest allowed width at or above the request (see `NEWS_IMAGE_WIDTHS`) and
 * caches that size as its own file. Upstream press images are routinely 2048x1152 or larger — the
 * on-disk cache measured up to 2368x1332 — while a news pane renders a few hundred CSS px wide, so
 * without this the kiosk decodes roughly 9MB of RGBA per headline rotation to draw a thumbnail. That
 * cost is measurable on real hardware: see `QA/Reports/qa-report-stutter-tv-2026-08-11.md`, where
 * every scenario touching the news path sat at 42-52% janky frames against a 3.45% floor.
 *
 * Omitting `w` serves the original bytes exactly as before, so this is backward-compatible for any
 * caller that hasn't opted in.
 */
export async function handleNewsImage(res: ServerResponse, src: string | null, requestedWidth: string | null = null) {
  if (!src) {
    sendJson(res, 400, { error: 'Missing src' })
    return
  }

  let parsed: URL
  try {
    parsed = new URL(src)
  } catch {
    sendJson(res, 400, { error: 'Invalid src' })
    return
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    sendJson(res, 400, { error: 'Invalid src' })
    return
  }

  const width = resolveWidth(requestedWidth)
  const key = cacheKeyFor(src, width)
  const existing = findCachedFile(key)
  if (existing) {
    const filePath = join(NEWS_IMAGE_CACHE_DIR, existing)
    if (Date.now() - statSync(filePath).mtimeMs < IMAGE_CACHE_TTL_MS) {
      serveFile(res, filePath)
      return
    }
  }

  try {
    const response = await fetch(src)
    if (!response.ok) throw new Error(`upstream responded ${response.status}`)
    const contentType = response.headers.get('content-type')?.split(';')[0] ?? 'image/jpeg'
    let ext = CONTENT_TYPE_TO_EXT[contentType] ?? 'jpg'
    // Annotated rather than inferred: `Buffer.from(ArrayBuffer)` narrows to `Buffer<ArrayBuffer>`,
    // while `sharp(...).toBuffer()` returns the wider `Buffer<ArrayBufferLike>`, so the resize
    // reassignment below would not typecheck against the narrowed inference.
    let buffer: Buffer = Buffer.from(await response.arrayBuffer())

    if (width !== undefined) {
      try {
        // `withoutEnlargement` so an upstream image already smaller than the requested width is
        // passed through at its own size rather than being upscaled into a bigger, blurrier file.
        // Re-encoded to WebP for the same reason the upload derivatives are (`server/uploads.ts`).
        buffer = await sharp(buffer).resize({ width, withoutEnlargement: true }).webp({ quality: 72 }).toBuffer()
        ext = 'webp'
      } catch (error) {
        // A resize failure must not lose the image — fall through and cache the original bytes under
        // this width's own key. Same best-effort posture as `handleUpload`'s own derivative block.
        console.error('[news] image resize failed, caching original instead:', src, error)
      }
    }

    // Remove a stale copy saved under a different extension, if any, before writing the fresh one.
    if (existing && existing !== `${key}.${ext}`) unlinkSync(join(NEWS_IMAGE_CACHE_DIR, existing))
    const filePath = join(NEWS_IMAGE_CACHE_DIR, `${key}.${ext}`)
    writeFileSync(filePath, buffer)
    serveFile(res, filePath)
  } catch (error) {
    console.error('[news] image fetch failed:', src, error)
    if (existing && existsSync(join(NEWS_IMAGE_CACHE_DIR, existing))) {
      serveFile(res, join(NEWS_IMAGE_CACHE_DIR, existing))
      return
    }
    sendJson(res, 502, { error: 'Could not fetch this image' })
  }
}

/** Frees disk space for images no longer being requested at all — `handleNewsImage`'s own lazy per-request TTL check only ever refreshes a file that's still actively being asked for, so without this a headline that rotated out of every pane's own pool days ago would leave its image cached forever. */
function sweepExpiredNewsImages() {
  const now = Date.now()
  for (const name of readdirSync(NEWS_IMAGE_CACHE_DIR)) {
    if (name === '.gitkeep') continue
    const filePath = join(NEWS_IMAGE_CACHE_DIR, name)
    if (now - statSync(filePath).mtimeMs > IMAGE_CACHE_TTL_MS) unlinkSync(filePath)
  }
}

let sweepTimer: ReturnType<typeof setInterval> | null = null

/** Starts the periodic sweep — call once at server boot, same posture as `woltPoller.start`/`foodoraPoller.start`. Guards against a duplicate, permanently-running interval if this is ever accidentally called more than once (same guard `woltPoller.start`/`foodoraPoller.start` already have). */
export function startNewsImageCacheSweep() {
  if (sweepTimer) clearInterval(sweepTimer)
  sweepTimer = setInterval(sweepExpiredNewsImages, IMAGE_CACHE_TTL_MS)
}
