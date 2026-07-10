import { useEffect, useState } from 'react'
import { fetchWeather } from '../lib/localServer'
import type { WeatherHour } from '../types/extensions'

/** Weather changes slowly enough that a ~10 minute poll keeps `WeatherSlide` fresh without hammering MET's free API. */
const POLL_INTERVAL_MS = 10 * 60_000

interface WeatherForecastState {
  hourly: WeatherHour[]
  loading: boolean
}

/**
 * Polls `GET /extensions/weather` for `(lat, lon)` every ~10 minutes. Takes
 * the coordinate as two primitive numbers rather than an object so the
 * effect only re-runs on an actual change, not whenever `useExtensionsConfig`
 * happens to return a freshly-parsed (but equal) object. On a failed
 * refresh (local server down, MET unreachable), keeps the last fetched
 * forecast rather than clearing it — same graceful-degradation posture as
 * `useTransitDepartures`.
 */
export function useWeatherForecast(lat: number | undefined, lon: number | undefined, hours: number): WeatherForecastState {
  const [state, setState] = useState<WeatherForecastState>({ hourly: [], loading: lat !== undefined && lon !== undefined })

  useEffect(() => {
    if (lat === undefined || lon === undefined) return

    let cancelled = false
    const refresh = () => {
      fetchWeather(lat, lon, hours)
        .then((result) => {
          if (!cancelled) setState({ hourly: result.hourly, loading: false })
        })
        .catch(() => {
          if (!cancelled) setState((current) => ({ ...current, loading: false }))
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
