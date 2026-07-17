import { useEffect, useState } from 'react'
import { fetchDepartures } from '../lib/localServer'
import type { DepartureInfo } from '../types/extensions'

/** How often `TransitSlide` re-fetches — frequent enough to feel "live" without hammering Entur (the server itself also caches responses briefly, see `server/extensions.ts`). */
const POLL_INTERVAL_MS = 30_000

/** How long a cached departures list is still trusted as "better than nothing" once the live feed starts failing (e.g. the local server or the internet connection itself is down). Past this age it's treated the same as no cache at all — same posture, and same duration, as `useWeatherForecast`'s own cache. */
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

const CACHE_KEY_PREFIX = 'transit-cache:'

interface CachedDepartures {
  stopName: string
  departures: DepartureInfo[]
  fetchedAt: number
}

function cacheKey(stopId: string): string {
  return `${CACHE_KEY_PREFIX}${stopId}`
}

/** `null` if there's no cache for `stopId`, or it's older than `CACHE_MAX_AGE_MS`. Caching is a best-effort fallback, not core functionality, so any read/parse failure (storage disabled, corrupt entry) is treated the same as a cache miss rather than surfaced as an error. */
function readCache(stopId: string): CachedDepartures | null {
  try {
    const raw = window.localStorage.getItem(cacheKey(stopId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as CachedDepartures
    if (Date.now() - parsed.fetchedAt > CACHE_MAX_AGE_MS) return null
    return parsed
  } catch {
    return null
  }
}

function writeCache(stopId: string, stopName: string, departures: DepartureInfo[]) {
  try {
    window.localStorage.setItem(cacheKey(stopId), JSON.stringify({ stopName, departures, fetchedAt: Date.now() } satisfies CachedDepartures))
  } catch {
    // Storage full/disabled — losing the offline fallback is a lot less bad than crashing the slide over it.
  }
}

/**
 * Reinterprets a departure list as a static timetable rather than a live
 * prediction, for whenever the live feed itself is unreachable: forces
 * `realtime` off (there's no way to know whether that last-known delay still
 * holds) and shows each departure's own `aimedDepartureTime` (the timetabled
 * time) instead of its `expectedDepartureTime` (a live adjustment that may
 * now be stale and misleading) — then drops any that have already passed by
 * wall-clock time, since "in -12 min" reads as broken rather than
 * informative. Applied both the moment the feed drops and on every
 * subsequent poll attempt while it stays down, so the shown list keeps
 * trimming elapsed departures rather than freezing on one stale snapshot.
 */
function asScheduled(departures: DepartureInfo[]): DepartureInfo[] {
  const now = Date.now()
  return departures
    .filter((departure) => new Date(departure.aimedDepartureTime).getTime() > now)
    .map((departure) => ({ ...departure, expectedDepartureTime: departure.aimedDepartureTime, realtime: false }))
}

interface TransitDeparturesState {
  stopName: string | null
  departures: DepartureInfo[]
  loading: boolean
  /** `true` when `departures` is being shown as a scheduled fallback (see `asScheduled`) because the live feed just failed, rather than a fresh live fetch — lets `TransitSlide` show a "not live" notice instead of silently passing off a stale/reinterpreted list as current. */
  stale: boolean
}

/**
 * Polls `GET /extensions/departures` for `stopId` every 30s. Every
 * successful fetch is also mirrored into `localStorage` (see `writeCache`),
 * so if a refresh then fails (local server down, no internet) this falls
 * back to whatever's already showing (or, on a fresh mount with nothing yet,
 * the cache) reinterpreted as a static schedule (see `asScheduled`) instead
 * of going blank, as long as it's less than a week old. Either way `stale`
 * tells `TransitSlide` whether what it's showing is live.
 */
export function useTransitDepartures(stopId: string | undefined, count: number): TransitDeparturesState {
  const [state, setState] = useState<TransitDeparturesState>({ stopName: null, departures: [], loading: Boolean(stopId), stale: false })

  useEffect(() => {
    if (!stopId) return

    let cancelled = false
    const refresh = () => {
      fetchDepartures(stopId, count)
        .then((result) => {
          if (cancelled) return
          writeCache(stopId, result.stopName, result.departures)
          setState({ stopName: result.stopName, departures: result.departures, loading: false, stale: false })
        })
        .catch(() => {
          if (cancelled) return
          setState((current) => {
            // Already showing something (from an earlier successful fetch this
            // session, or a previous cache fallback) — re-derive it as a
            // schedule rather than clearing it, same "was live, then dropped"
            // case `useWeatherForecast` handles.
            if (current.departures.length > 0) return { ...current, loading: false, stale: true, departures: asScheduled(current.departures) }
            const cached = readCache(stopId)
            return cached ? { stopName: cached.stopName, departures: asScheduled(cached.departures), loading: false, stale: true } : { ...current, loading: false }
          })
        })
    }

    refresh()
    const interval = setInterval(refresh, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [stopId, count])

  return state
}
