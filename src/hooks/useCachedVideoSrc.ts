import { useEffect, useState } from 'react'

/** Shared with the pre-warm/eviction pass in `ScreenDisplay.tsx`, which needs the same cache name to prune entries this hook isn't actively resolving right now. */
export const VIDEO_CACHE_NAME = 'wraps-coffee-video-cache-v1'
const MAX_RETRY_DELAY_MS = 15_000

/** A `404` (the display resolving a pane's video moments after upload, while the server is still transcoding it) is treated the same as a transient network hiccup — both are worth retrying with backoff, neither is a reason to give up. */
class RetryableFetchError extends Error {}

async function fetchAndCache(cache: Cache, url: string): Promise<Blob> {
  const response = await fetch(url)
  if (response.status === 404) throw new RetryableFetchError('Not found yet — still transcoding?')
  if (!response.ok) throw new Error(`Fetch failed: ${response.status}`)
  await cache.put(url, response.clone())
  return response.blob()
}

/**
 * Resolves a video's own network URL to a locally-cached, replayable source
 * — deliberately never hands back the raw network URL as a placeholder
 * while downloading, because `VideoSlide` reassigns its `<video>` element's
 * `src` (restarting playback) whenever this hook's return value changes.
 * Handing out the network URL first and then swapping to the cached blob
 * URL once the download finishes would itself be exactly that kind of
 * interruption, just delayed instead of avoided. So: resolve fully via the
 * Cache API first (checking for an existing entry, or downloading and
 * storing one), and only return a value once there is exactly one canonical
 * source for this URL's whole lifetime on the caller's video element — no
 * later swap, no restart risk, by construction. Returns `undefined` while
 * unresolved (including on a very first render always start there);
 * `VideoSlide` shows its poster frame as a placeholder for however long
 * that lasts. Works identically for either kind of display connection
 * (`DisplayConnectionType`'s `'electron'`/`'url'`) since it's pure
 * web-standard Cache API, no Electron-specific code.
 */
export function useCachedVideoSrc(videoUrl: string | undefined): string | undefined {
  const [resolvedByUrl, setResolvedByUrl] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!videoUrl || resolvedByUrl[videoUrl]) return
    let cancelled = false
    let attempt = 0

    async function resolve() {
      if (!videoUrl) return
      try {
        if (typeof caches === 'undefined') throw new Error('Cache API unavailable')
        const cache = await caches.open(VIDEO_CACHE_NAME)
        const cached = await cache.match(videoUrl)
        const blob = cached ? await cached.blob() : await fetchAndCache(cache, videoUrl)
        if (!cancelled) setResolvedByUrl((prev) => ({ ...prev, [videoUrl]: URL.createObjectURL(blob) }))
      } catch (error) {
        if (cancelled) return
        if (error instanceof RetryableFetchError) {
          attempt += 1
          const delay = Math.min(1000 * 2 ** attempt, MAX_RETRY_DELAY_MS)
          setTimeout(() => {
            if (!cancelled) void resolve()
          }, delay)
          return
        }
        // Cache API unsupported, or a real (non-404) fetch failure — last
        // resort so playback still works, just without pre-caching.
        console.error('[useCachedVideoSrc] falling back to the direct network URL:', videoUrl, error)
        setResolvedByUrl((prev) => ({ ...prev, [videoUrl]: videoUrl }))
      }
    }

    void resolve()
    return () => {
      cancelled = true
    }
  }, [videoUrl, resolvedByUrl])

  return videoUrl ? resolvedByUrl[videoUrl] : undefined
}

/**
 * Proactively downloads-and-caches every given URL that isn't already
 * cached, so a stage's video is already sitting on disk before it ever
 * rotates into view — called from `ScreenDisplay.tsx` with every video URL
 * referenced by *any* stage in the resolved screen (not just the one
 * currently showing). Best-effort: a single URL failing (still transcoding,
 * momentarily unreachable) doesn't block the others, and this deliberately
 * doesn't feed into any `<video>` element itself — `useCachedVideoSrc` on
 * the pane that eventually shows it will find the cache already warm and
 * resolve instantly instead of downloading again.
 */
export async function prewarmVideoCache(urls: string[]): Promise<void> {
  if (typeof caches === 'undefined' || urls.length === 0) return
  const cache = await caches.open(VIDEO_CACHE_NAME)
  await Promise.all(
    urls.map(async (url) => {
      if (await cache.match(url)) return
      await fetchAndCache(cache, url).catch(() => {
        // Best-effort — see doc comment. `useCachedVideoSrc` retries on its
        // own once this URL is actually needed for playback.
      })
    }),
  )
}

/** Deletes every cache entry whose URL isn't in `activeUrls` — called alongside `prewarmVideoCache` with the same full set, so a video removed from every stage of every screen this display ever showed eventually falls out of the cache instead of accumulating forever. */
export async function evictUnusedVideoCache(activeUrls: string[]): Promise<void> {
  if (typeof caches === 'undefined') return
  const cache = await caches.open(VIDEO_CACHE_NAME)
  const activeSet = new Set(activeUrls)
  const requests = await cache.keys()
  await Promise.all(requests.filter((request) => !activeSet.has(request.url)).map((request) => cache.delete(request)))
}
