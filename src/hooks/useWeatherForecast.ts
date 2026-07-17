import { useEffect, useState } from 'react'
import { fetchWeather } from '../lib/localServer'
import type { WeatherHour } from '../types/extensions'
import { weatherLocationKey } from '../utils/weatherLocationKey'

/** Weather changes slowly enough that a ~10 minute poll keeps `WeatherSlide` fresh without hammering MET's free API. */
const POLL_INTERVAL_MS = 10 * 60_000

/** How long a cached forecast is still trusted as "better than nothing" once the live fetch starts failing (e.g. the local server or the internet connection itself is down). Past this age it's treated the same as no cache at all. */
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

const CACHE_KEY_PREFIX = 'weather-cache:'

interface CachedForecast {
  hourly: WeatherHour[]
  fetchedAt: number
}

function cacheKey(lat: number, lon: number): string {
  return `${CACHE_KEY_PREFIX}${weatherLocationKey(lat, lon)}`
}

/** `null` if there's no cache for `(lat, lon)`, or it's older than `CACHE_MAX_AGE_MS`. Caching is a best-effort fallback, not core functionality, so any read/parse failure (storage disabled, corrupt entry) is treated the same as a cache miss rather than surfaced as an error. */
function readCache(lat: number, lon: number): CachedForecast | null {
  try {
    const raw = window.localStorage.getItem(cacheKey(lat, lon))
    if (!raw) return null
    const parsed = JSON.parse(raw) as CachedForecast
    if (Date.now() - parsed.fetchedAt > CACHE_MAX_AGE_MS) return null
    return parsed
  } catch {
    return null
  }
}

function writeCache(lat: number, lon: number, hourly: WeatherHour[]) {
  try {
    window.localStorage.setItem(cacheKey(lat, lon), JSON.stringify({ hourly, fetchedAt: Date.now() } satisfies CachedForecast))
  } catch {
    // Storage full/disabled — losing the offline fallback is a lot less bad than crashing the slide over it.
  }
}

interface WeatherForecastState {
  hourly: WeatherHour[]
  loading: boolean
  /** `true` when `hourly` is a cached forecast shown because the live fetch just failed, rather than freshly-fetched data — lets `WeatherSlide` show a "not live" notice instead of silently passing off stale numbers as current. */
  stale: boolean
  /** When `hourly` was actually fetched (whether just now, or read from a `stale` cache entry). `undefined` before the first successful fetch or cache read. */
  fetchedAt?: number
}

/**
 * Polls `GET /extensions/weather` for `(lat, lon)` every ~10 minutes. Takes
 * the coordinate as two primitive numbers rather than an object so the
 * effect only re-runs on an actual change, not whenever `useExtensionsConfig`
 * happens to return a freshly-parsed (but equal) object.
 *
 * Every successful fetch is also mirrored into `localStorage` (see
 * `writeCache`), keyed by its own rounded coordinate — so if a refresh then
 * fails (local server down, no internet), and there's no already-loaded
 * forecast in memory to just keep showing, this falls back to that cached
 * one instead of going blank, as long as it's less than a week old. Either
 * way `stale` tells `WeatherSlide` whether what it's showing is live.
 */
export function useWeatherForecast(lat: number | undefined, lon: number | undefined, hours: number): WeatherForecastState {
  const [state, setState] = useState<WeatherForecastState>({ hourly: [], loading: lat !== undefined && lon !== undefined, stale: false })

  useEffect(() => {
    if (lat === undefined || lon === undefined) return

    let cancelled = false
    const refresh = () => {
      fetchWeather(lat, lon, hours)
        .then((result) => {
          if (cancelled) return
          writeCache(lat, lon, result.hourly)
          setState({ hourly: result.hourly, loading: false, stale: false, fetchedAt: Date.now() })
        })
        .catch(() => {
          if (cancelled) return
          setState((current) => {
            if (current.hourly.length > 0) return { ...current, loading: false }
            const cached = readCache(lat, lon)
            return cached ? { hourly: cached.hourly, loading: false, stale: true, fetchedAt: cached.fetchedAt } : { ...current, loading: false }
          })
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
