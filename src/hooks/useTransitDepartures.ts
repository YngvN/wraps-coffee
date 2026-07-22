import { useEffect, useRef, useState } from 'react'
import { fetchDepartures } from '../lib/localServer'
import type { DepartureInfo } from '../types/integrations'

/** How often `TransitSlide` re-fetches — frequent enough to feel "live" without hammering Entur (the server itself also caches responses briefly, see `server/integrations.ts`). */
const POLL_INTERVAL_MS = 30_000

/** How long a cached departures list is still trusted as "better than nothing" once the live feed starts failing (e.g. the local server or the internet connection itself is down). Past this age it's treated the same as no cache at all — same posture, and same duration, as `useWeatherForecast`'s own cache. */
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

const CACHE_KEY_PREFIX = 'transit-cache:'

interface FullDepartures {
  stopName: string
  /** The full buffer `handleDepartures` returns (up to `TRANSIT_FETCH_BUFFER`, see its own doc comment in `server/integrations.ts`) — not just however many departures are actually displayed, so there's far more than `count` to keep trimming from while offline (see `selectUpcoming`). */
  departures: DepartureInfo[]
  fetchedAt: number
}

function cacheKey(stopId: string): string {
  return `${CACHE_KEY_PREFIX}${stopId}`
}

/** `null` if there's no cache for `stopId`, or it's older than `CACHE_MAX_AGE_MS` (removing it in that case — an admin who reconfigures the stop over the weeks/months a display runs would otherwise leave every previous stop's own stale entry sitting in `localStorage` forever). Caching is a best-effort fallback, not core functionality, so any read/parse failure (storage disabled, corrupt entry) is treated the same as a cache miss rather than surfaced as an error. */
function readCache(stopId: string): FullDepartures | null {
  try {
    const key = cacheKey(stopId)
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as FullDepartures
    if (Date.now() - parsed.fetchedAt > CACHE_MAX_AGE_MS) {
      window.localStorage.removeItem(key)
      return null
    }
    return parsed
  } catch {
    return null
  }
}

function writeCache(stopId: string, full: FullDepartures) {
  try {
    window.localStorage.setItem(cacheKey(stopId), JSON.stringify(full))
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
 * informative.
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
 * Reads whatever's cached for `stopId` (if anything) and shapes it into both
 * the full buffer a fresh `fullRef` should start from and the state a fresh
 * mount should show *immediately*, before its first live fetch has even
 * resolved. Used both for the very first mount and for every later `stopId`
 * change within the same mounted instance, so both cases show last-known
 * departures rather than a blank/loading pane while the live fetch is in
 * flight — this is what keeps a `'transit'` pane from going blank for a beat
 * every time a screen's stage rotation brings it back into view: `TransitSlide`
 * typically unmounts and remounts on each such transition (a different pane
 * kind was showing in between), which would otherwise restart this hook from
 * scratch right as the pane becomes visible.
 */
function seedFromCache(stopId: string, count: number): { full: FullDepartures | null; state: TransitDeparturesState } {
  const cached = readCache(stopId)
  if (!cached) return { full: null, state: { stopName: null, departures: [], loading: true, stale: false } }
  const full: FullDepartures = { ...cached, departures: asScheduled(cached.departures) }
  return { full, state: { stopName: full.stopName, departures: full.departures.slice(0, count), loading: true, stale: true } }
}

/**
 * Polls `GET /integrations/departures` for `stopId` every 30s. The server
 * always returns a large buffer of upcoming departures (see
 * `handleDepartures`'s own `TRANSIT_FETCH_BUFFER` doc comment in
 * `server/integrations.ts`) regardless of `count` — this hook keeps that full
 * buffer in `fullRef` (mirrored into `localStorage` via `writeCache`, so it
 * survives a reload) and only *displays* `count` of them, trimmed to
 * whichever haven't already departed (`asScheduled`). That split is what
 * makes offline fallback last for more than just the next `count`
 * departures: if a refresh then fails (local server down, no internet), the
 * displayed list is re-derived from whatever's left in that same
 * much-larger buffer — not frozen on/shrinking from just the `count`-long
 * slice that happened to be on screen when the connection dropped — so a
 * display keeps showing something for as long as the buffer still has
 * departures left, as long as it's less than a week old. Either way `stale`
 * tells `TransitSlide` whether what it's showing is live.
 *
 * The very first render (and any later `stopId` change) seeds both `state`
 * and `fullRef` from `localStorage` via `seedFromCache` rather than starting
 * blank — see its own doc comment for why that matters for stage rotation.
 */
export function useTransitDepartures(stopId: string | undefined, count: number): TransitDeparturesState {
  const [state, setState] = useState<TransitDeparturesState>(() => (stopId ? seedFromCache(stopId, count).state : { stopName: null, departures: [], loading: false, stale: false }))
  const fullRef = useRef<FullDepartures | null>(null)

  useEffect(() => {
    if (!stopId) return

    const seed = seedFromCache(stopId, count)
    fullRef.current = seed.full
    setState(seed.state)
    let cancelled = false
    const refresh = () => {
      fetchDepartures(stopId, count)
        .then((result) => {
          if (cancelled) return
          const full: FullDepartures = { stopName: result.stopName, departures: result.departures, fetchedAt: Date.now() }
          fullRef.current = full
          writeCache(stopId, full)
          setState({ stopName: full.stopName, departures: full.departures.slice(0, count), loading: false, stale: false })
        })
        .catch(() => {
          if (cancelled) return
          const source = fullRef.current ?? readCache(stopId)
          if (!source) {
            setState((current) => ({ ...current, loading: false }))
            return
          }
          const trimmed: FullDepartures = { ...source, departures: asScheduled(source.departures) }
          fullRef.current = trimmed
          setState({ stopName: trimmed.stopName, departures: trimmed.departures.slice(0, count), loading: false, stale: true })
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
