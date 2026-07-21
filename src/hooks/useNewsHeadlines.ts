import { useEffect, useState } from 'react'
import { fetchNewsHeadlines } from '../lib/localServer'
import type { NewsHeadline } from '../types/news'

/** Matches the server's own `HEADLINES_CACHE_MS` (`server/news.ts`) — no point polling faster than the cache it's reading from actually refreshes. */
const POLL_INTERVAL_MS = 10 * 60_000

/** How long a cached headline list is still trusted as "better than nothing" once the live fetch starts failing — same posture and duration as `useWeatherForecast`/`useTransitDepartures`'s own caches. */
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

const CACHE_KEY_PREFIX = 'news-cache:'

interface CachedHeadlines {
  headlines: NewsHeadline[]
  fetchedAt: number
}

function cacheKey(sourceIds: string[], count: number): string {
  return `${CACHE_KEY_PREFIX}${[...sourceIds].sort().join(',')}:${count}`
}

/** `null` if there's no cache for this exact `(sourceIds, count)` combination, or it's older than `CACHE_MAX_AGE_MS` (removing it in that case — an admin who reconfigures the news sources over the weeks/months a display runs would otherwise leave every previous combination's own stale entry sitting in `localStorage` forever). Caching is a best-effort fallback, not core functionality, so any read/parse failure (storage disabled, corrupt entry) is treated the same as a cache miss rather than surfaced as an error. */
function readCache(sourceIds: string[], count: number): CachedHeadlines | null {
  try {
    const key = cacheKey(sourceIds, count)
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CachedHeadlines
    if (Date.now() - parsed.fetchedAt > CACHE_MAX_AGE_MS) {
      window.localStorage.removeItem(key)
      return null
    }
    return parsed
  } catch {
    return null
  }
}

function writeCache(sourceIds: string[], count: number, headlines: NewsHeadline[]) {
  try {
    window.localStorage.setItem(cacheKey(sourceIds, count), JSON.stringify({ headlines, fetchedAt: Date.now() } satisfies CachedHeadlines))
  } catch {
    // Storage full/disabled — losing the offline fallback is a lot less bad than crashing the slide over it.
  }
}

interface NewsHeadlinesState {
  headlines: NewsHeadline[]
  loading: boolean
  /** `true` when `headlines` is a cached list shown because the live fetch just failed, rather than freshly-fetched data — same posture as `useWeatherForecast`/`useTransitDepartures`'s own `stale`. */
  stale: boolean
}

/**
 * Polls `GET /news/headlines` for `(sourceIds, count)` every ~10 minutes.
 * Takes `sourceIds` as a plain array (not memoized upstream) — the effect
 * re-runs whenever its own serialized form (via the `sourceIds.join(',')`
 * dependency below) actually changes, not on every render a fresh-but-equal
 * array reference would otherwise cause. Same cache/stale-fallback shape as
 * `useWeatherForecast`/`useTransitDepartures`.
 */
export function useNewsHeadlines(sourceIds: string[], count: number): NewsHeadlinesState {
  const [state, setState] = useState<NewsHeadlinesState>({ headlines: [], loading: sourceIds.length > 0, stale: false })
  const sourceIdsKey = sourceIds.join(',')

  useEffect(() => {
    // No setState here for the empty case — same posture as
    // `useTransitDepartures`'s own `if (!stopId) return`: the initial
    // `useState` value above is already correct for "nothing requested,"
    // and calling `setState` synchronously inside an effect body (rather
    // than in a callback reacting to an external event) is a lint-flagged
    // anti-pattern here.
    if (sourceIds.length === 0) return

    let cancelled = false
    const refresh = () => {
      fetchNewsHeadlines(sourceIds, count)
        .then((headlines) => {
          if (cancelled) return
          writeCache(sourceIds, count, headlines)
          setState({ headlines, loading: false, stale: false })
        })
        .catch(() => {
          if (cancelled) return
          setState((current) => {
            if (current.headlines.length > 0) return { ...current, loading: false, stale: true }
            const cached = readCache(sourceIds, count)
            return cached ? { headlines: cached.headlines, loading: false, stale: true } : { ...current, loading: false }
          })
        })
    }

    refresh()
    const interval = setInterval(refresh, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `sourceIdsKey` is `sourceIds`' own serialized dependency, see the doc comment above.
  }, [sourceIdsKey, count])

  return state
}
