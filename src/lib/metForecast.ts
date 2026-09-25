/** MET Norway (Yr) locationforecast — shared by the local server and every display. */
import type { WeatherHour } from '../types/integrations'

interface LocationforecastResponse {
  properties: {
    timeseries: {
      time: string
      data: {
        instant: {
          details: {
            air_temperature: number
            wind_speed?: number
            wind_from_direction?: number
            relative_humidity?: number
            air_pressure_at_sea_level?: number
            ultraviolet_index_clear_sky?: number
          }
        }
        next_1_hours?: {
          summary: { symbol_code: string }
          details: { precipitation_amount: number; probability_of_precipitation?: number }
        }
      }
    }[]
  }
}

/** Whether `isoTime` falls on the same (server-local) calendar date as `reference` — used to isolate "today's" entries out of the full cached timeseries for `todayLowC`/`todayHighC`, independent of however many hours the caller asked to have listed. */
function isSameLocalDate(isoTime: string, reference: Date): boolean {
  const date = new Date(isoTime)
  return date.getFullYear() === reference.getFullYear() && date.getMonth() === reference.getMonth() && date.getDate() === reference.getDate()
}

/** MET's entire multi-day hourly forecast for (lat, lon) from the complete dataset, mapped to WeatherHour. Uses only fetch, so it runs in the browser too (a display's direct fetch, see useWeatherForecast.ts) — a browser cannot set User-Agent, so the server passes its own identifying one and a display omits it (MET allows cross-origin calls). */
export async function fetchMetHourly(lat: number, lon: number, userAgent?: string, signal?: AbortSignal): Promise<WeatherHour[]> {
  const url = `https://api.met.no/weatherapi/locationforecast/2.0/complete?lat=${lat}&lon=${lon}`
  const response = await fetch(url, userAgent || signal ? { headers: userAgent ? { 'User-Agent': userAgent } : undefined, signal } : undefined)
  if (!response.ok) throw new Error(`locationforecast failed: ${response.status}`)
  const body = (await response.json()) as LocationforecastResponse

  return body.properties.timeseries
    .filter((entry) => entry.data.next_1_hours)
    .map((entry) => {
      const instant = entry.data.instant.details
      const next1h = entry.data.next_1_hours!
      return {
        time: entry.time,
        temperatureC: instant.air_temperature,
        precipitationMm: next1h.details.precipitation_amount,
        symbolCode: next1h.summary.symbol_code,
        windSpeedMs: instant.wind_speed,
        windFromDirectionDeg: instant.wind_from_direction,
        humidityPercent: instant.relative_humidity,
        precipitationProbabilityPercent: next1h.details.probability_of_precipitation,
        uvIndex: instant.ultraviolet_index_clear_sky,
        pressureHpa: instant.air_pressure_at_sea_level,
      }
    })
}

/** Today's overall low/high from the full timeseries (independent of how many hours are displayed), falling back to the first hours entries when none fall on today's local date (just before midnight). */
export function todayLowHigh(hourly: WeatherHour[], hours: number, now: Date = new Date()): { todayLowC?: number; todayHighC?: number } {
  const todayEntries = hourly.filter((entry) => isSameLocalDate(entry.time, now))
  const lowHighSource = todayEntries.length > 0 ? todayEntries : hourly.slice(0, hours)
  const todayLowC = lowHighSource.length > 0 ? Math.min(...lowHighSource.map((entry) => entry.temperatureC)) : undefined
  const todayHighC = lowHighSource.length > 0 ? Math.max(...lowHighSource.map((entry) => entry.temperatureC)) : undefined

  return { todayLowC, todayHighC }
}

/** The same { hourly, todayLowC, todayHighC } shape GET /integrations/weather returns. */
export async function fetchMetForecast(lat: number, lon: number, hours: number, userAgent?: string, signal?: AbortSignal): Promise<{ hourly: WeatherHour[]; todayLowC?: number; todayHighC?: number }> {
  const hourly = await fetchMetHourly(lat, lon, userAgent, signal)
  const lowHigh = todayLowHigh(hourly, hours)
  return { hourly, ...lowHigh }
}
