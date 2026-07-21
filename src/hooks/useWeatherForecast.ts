import { useEffect, useRef, useState } from 'react'
import { fetchWeather } from '../lib/localServer'
import type { WeatherHour } from '../types/extensions'
import { weatherLocationKey } from '../utils/weatherLocationKey'

/** Weather changes slowly enough that a ~10 minute poll keeps `WeatherSlide` fresh without hammering MET's free API. */
const POLL_INTERVAL_MS = 10 * 60_000

/** How long a cached forecast is still trusted as "better than nothing" once the live fetch starts failing (e.g. the local server or the internet connection itself is down). Past this age it's treated the same as no cache at all. */
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

const CACHE_KEY_PREFIX = 'weather-cache:'

interface FullForecast {
  /** The entire multi-day timeseries `handleWeather` returns — not just however many hours are actually displayed, so there's days of buffer to draw on if the connection drops (see `selectUpcoming`). */
  hourly: WeatherHour[]
  todayLowC?: number
  todayHighC?: number
  fetchedAt: number
}

function cacheKey(lat: number, lon: number): string {
  return `${CACHE_KEY_PREFIX}${weatherLocationKey(lat, lon)}`
}

/** `null` if there's no cache for `(lat, lon)`, or it's older than `CACHE_MAX_AGE_MS` (removing it in that case — an admin who changes the configured location over the weeks/months a display runs would otherwise leave every previous location's own stale entry sitting in `localStorage` forever). Caching is a best-effort fallback, not core functionality, so any read/parse failure (storage disabled, corrupt entry) is treated the same as a cache miss rather than surfaced as an error. */
function readCache(lat: number, lon: number): FullForecast | null {
  try {
    const key = cacheKey(lat, lon)
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as FullForecast
    if (Date.now() - parsed.fetchedAt > CACHE_MAX_AGE_MS) {
      window.localStorage.removeItem(key)
      return null
    }
    return parsed
  } catch {
    return null
  }
}

function writeCache(lat: number, lon: number, forecast: FullForecast) {
  try {
    window.localStorage.setItem(cacheKey(lat, lon), JSON.stringify(forecast))
  } catch {
    // Storage full/disabled — losing the offline fallback is a lot less bad than crashing the slide over it.
  }
}

/** The next `hours` entries of `hourly` that haven't already passed — rather than a plain `slice(0, hours)` from the start of the array, so that re-deriving the displayed window from a `fullRef`/cache snapshot that's hours or days old (the connection's been down a while) still shows *upcoming* hours instead of ones that are now in the past. */
function selectUpcoming(hourly: WeatherHour[], hours: number): WeatherHour[] {
  const now = Date.now()
  return hourly.filter((entry) => new Date(entry.time).getTime() >= now).slice(0, hours)
}

interface WeatherForecastState {
  hourly: WeatherHour[]
  /** Today's overall low/high (see `server/extensions.ts`'s own `handleWeather` doc comment for how it's computed) — `undefined` before the first successful fetch or cache read, same as `fetchedAt`. */
  todayLowC?: number
  todayHighC?: number
  loading: boolean
  /** `true` when `hourly` is a cached forecast shown because the live fetch just failed, rather than freshly-fetched data — lets `WeatherSlide` show a "not live" notice instead of silently passing off stale numbers as current. */
  stale: boolean
  /** When `hourly` was actually fetched (whether just now, or read from a `stale` cache entry). `undefined` before the first successful fetch or cache read. */
  fetchedAt?: number
}

/**
 * Reads whatever's cached for `(lat, lon)` (if anything) and shapes it into
 * both the full buffer a fresh `fullRef` should start from and the state a
 * fresh mount should show *immediately*, before its first live fetch has
 * even resolved. Used both for the very first mount and for every later
 * `(lat, lon)` change within the same mounted instance, so both cases show
 * last-known forecast data rather than a blank/loading pane while the live
 * fetch is in flight — this is what keeps a `'weather'` pane from going
 * blank for a beat every time a screen's stage rotation brings it back into
 * view: `WeatherSlide` typically unmounts and remounts on each such
 * transition (a different pane kind was showing in between), which would
 * otherwise restart this hook from scratch right as the pane becomes
 * visible. Same pattern as `useTransitDepartures.ts`'s own `seedFromCache`.
 */
function seedFromCache(lat: number, lon: number, hours: number): { full: FullForecast | null; state: WeatherForecastState } {
  const cached = readCache(lat, lon)
  if (!cached) return { full: null, state: { hourly: [], loading: true, stale: false } }
  return {
    full: cached,
    state: { hourly: selectUpcoming(cached.hourly, hours), todayLowC: cached.todayLowC, todayHighC: cached.todayHighC, loading: true, stale: true, fetchedAt: cached.fetchedAt },
  }
}

/**
 * Polls `GET /extensions/weather` for `(lat, lon)` every ~10 minutes. The
 * server always returns MET's entire multi-day hourly timeseries (see
 * `handleWeather`'s own doc comment) regardless of `hours` — this hook keeps
 * that full response in `fullRef` (mirrored into `localStorage` via
 * `writeCache`, so it survives a reload) and only *displays* `hours` worth
 * of it, via `selectUpcoming`. That split is what makes offline fallback
 * useful for more than the next few hours: if a refresh then fails (local
 * server down, no internet), the displayed window is re-derived from
 * whatever's still upcoming in that same days-long buffer — not frozen on
 * whatever `hours`-long slice happened to be on screen when the connection
 * dropped — so a display stays useful for as long as the buffer still has
 * entries ahead of "now" (days, not just `hours`), as long as it's less
 * than a week old. Either way `stale` tells `WeatherSlide` whether what
 * it's showing is live.
 *
 * The very first render (and any later `(lat, lon)` change) seeds both
 * `state` and `fullRef` from `localStorage` via `seedFromCache` rather than
 * starting blank — see its own doc comment for why that matters for stage
 * rotation.
 */
export function useWeatherForecast(lat: number | undefined, lon: number | undefined, hours: number): WeatherForecastState {
  const [state, setState] = useState<WeatherForecastState>(() =>
    lat !== undefined && lon !== undefined ? seedFromCache(lat, lon, hours).state : { hourly: [], loading: false, stale: false },
  )
  const fullRef = useRef<FullForecast | null>(null)

  useEffect(() => {
    if (lat === undefined || lon === undefined) return

    const seed = seedFromCache(lat, lon, hours)
    fullRef.current = seed.full
    setState(seed.state)
    let cancelled = false
    const refresh = () => {
      fetchWeather(lat, lon, hours)
        .then((result) => {
          if (cancelled) return
          const forecast: FullForecast = { hourly: result.hourly, todayLowC: result.todayLowC, todayHighC: result.todayHighC, fetchedAt: Date.now() }
          fullRef.current = forecast
          writeCache(lat, lon, forecast)
          setState({ hourly: selectUpcoming(forecast.hourly, hours), todayLowC: forecast.todayLowC, todayHighC: forecast.todayHighC, loading: false, stale: false, fetchedAt: forecast.fetchedAt })
        })
        .catch(() => {
          if (cancelled) return
          const source = fullRef.current ?? readCache(lat, lon)
          if (!source) {
            setState((current) => ({ ...current, loading: false }))
            return
          }
          fullRef.current = source
          setState({ hourly: selectUpcoming(source.hourly, hours), todayLowC: source.todayLowC, todayHighC: source.todayHighC, loading: false, stale: true, fetchedAt: source.fetchedAt })
        })
    }

    refresh()
    const interval = setInterval(refresh, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [lat, lon, hours])

  return state
}
