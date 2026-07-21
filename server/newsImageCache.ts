import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import type { ServerResponse } from 'node:http'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
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

function cacheKeyFor(src: string): string {
  return createHash('sha1').update(src).digest('hex')
}

/** The currently-cached file for `key`, regardless of which extension it was last saved under (the upstream image's own content-type can change between fetches). */
function findCachedFile(key: string): string | undefined {
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
 * Serves `GET /news/image?src=<original image URL>` — fetches-and-caches
 * the image to disk the first time (or once the cached copy is older than
 * `IMAGE_CACHE_TTL_MS`), serving the disk copy on every request in between.
 * A failed re-fetch with a stale copy still on disk serves that stale copy
 * rather than erroring — an outdated image beats a broken `<img>`.
 */
export async function handleNewsImage(res: ServerResponse, src: string | null) {
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

  const key = cacheKeyFor(src)
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
    const ext = CONTENT_TYPE_TO_EXT[contentType] ?? 'jpg'
    const buffer = Buffer.from(await response.arrayBuffer())

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
