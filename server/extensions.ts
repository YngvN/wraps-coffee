import type { ServerResponse } from 'node:http'
import type { NearbyStop } from '../src/types/extensions'
import { sendJson } from './http'

/** Identifies this app to Entur's APIs, per their usage terms — no personal/secret info needed, just a stable `<company>-<application>` string. */
const ENTUR_CLIENT_NAME = 'wraps-coffee-cafe-kiosk'
/** MET Norway's terms ask for an identifying `User-Agent`, ideally with a way to reach the operator — override via the `WEATHER_USER_AGENT` env var to include a real contact if desired; functions fine without it either way. */
const WEATHER_USER_AGENT = process.env.WEATHER_USER_AGENT ?? 'wraps-coffee-kiosk (self-hosted cafe display)'

const DEPARTURES_CACHE_MS = 20_000
const WEATHER_CACHE_MS = 10 * 60_000

interface CacheEntry<T> {
  expires: number
  value: T
}

/** Tiny in-memory TTL cache — this is derived/external data, never user-authored, so no disk persistence is needed; a server restart just re-fetches. */
function cached<T>(store: Map<string, CacheEntry<T>>, key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<T> {
  const hit = store.get(key)
  if (hit && hit.expires > Date.now()) return Promise.resolve(hit.value)
  return fetcher().then((value) => {
    store.set(key, { expires: Date.now() + ttlMs, value })
    return value
  })
}

// --- Address/stop lookup (Entur geocoder) -----------------------------------

interface GeocoderFeature {
  geometry: { coordinates: [number, number] }
  properties: { id: string; name?: string; label?: string; category?: string[] }
}
interface GeocoderResponse {
  features: GeocoderFeature[]
}

/** Geocodes `address` to a coordinate, then finds nearby stop places around it — powers the Extensions tab's "Look up address" action. Not cached: a one-shot admin action, not something polled. */
export async function handleLookup(res: ServerResponse, address: string) {
  if (!address.trim()) {
    sendJson(res, 200, { coordinates: null, nearbyStops: [] })
    return
  }

  try {
    const geocodeUrl = `https://api.entur.io/geocoder/v1/autocomplete?text=${encodeURIComponent(address)}&size=1&lang=no`
    const geocodeResponse = await fetch(geocodeUrl, { headers: { 'ET-Client-Name': ENTUR_CLIENT_NAME } })
    if (!geocodeResponse.ok) throw new Error(`geocoder autocomplete failed: ${geocodeResponse.status}`)
    const geocoded = (await geocodeResponse.json()) as GeocoderResponse

    const match = geocoded.features[0]
    if (!match) {
      sendJson(res, 200, { coordinates: null, nearbyStops: [] })
      return
    }

    const [lon, lat] = match.geometry.coordinates
    const reverseUrl = `https://api.entur.io/geocoder/v1/reverse?point.lat=${lat}&point.lon=${lon}&layers=venue&size=10`
    const reverseResponse = await fetch(reverseUrl, { headers: { 'ET-Client-Name': ENTUR_CLIENT_NAME } })
    if (!reverseResponse.ok) throw new Error(`geocoder reverse failed: ${reverseResponse.status}`)
    const nearby = (await reverseResponse.json()) as GeocoderResponse

    const nearbyStops: NearbyStop[] = nearby.features.map((feature) => ({
      id: feature.properties.id,
      name: feature.properties.label ?? feature.properties.name ?? feature.properties.id,
      // Entur repeats a mode once per quay under the same stop place — dedupe for a clean admin-facing list.
      modes: [...new Set(feature.properties.category ?? [])],
    }))

    sendJson(res, 200, { coordinates: { lat, lon }, nearbyStops })
  } catch (error) {
    console.error('[extensions] address lookup failed:', error)
    sendJson(res, 502, { error: 'Could not reach Entur to look up this address' })
  }
}

/**
 * Searches stop places by name (not by proximity to any address) — powers
 * the Integrations tab's "Search for a stop" box, which lets an admin add a
 * specific stop anywhere (not just ones near the store's own address, unlike
 * `handleLookup`'s `nearbyStops`) to `ExtensionsConfig['transit']['selectedStops']`.
 * Not cached, same one-shot-admin-action posture as `handleLookup`.
 */
export async function handleStopSearch(res: ServerResponse, query: string) {
  if (!query.trim()) {
    sendJson(res, 200, { stops: [] })
    return
  }

  try {
    const url = `https://api.entur.io/geocoder/v1/autocomplete?text=${encodeURIComponent(query)}&layers=venue&size=10&lang=no`
    const response = await fetch(url, { headers: { 'ET-Client-Name': ENTUR_CLIENT_NAME } })
    if (!response.ok) throw new Error(`geocoder autocomplete failed: ${response.status}`)
    const body = (await response.json()) as GeocoderResponse

    const stops: NearbyStop[] = body.features.map((feature) => ({
      id: feature.properties.id,
      name: feature.properties.label ?? feature.properties.name ?? feature.properties.id,
      modes: [...new Set(feature.properties.category ?? [])],
    }))

    sendJson(res, 200, { stops })
  } catch (error) {
    console.error('[extensions] stop search failed:', error)
    sendJson(res, 502, { error: 'Could not reach Entur to search for stops' })
  }
}

// --- Transit departures (Entur JourneyPlanner) ------------------------------

interface EstimatedCall {
  aimedDepartureTime: string
  expectedDepartureTime: string
  realtime: boolean
  cancellation: boolean
  destinationDisplay: { frontText: string }
  quay: { publicCode: string | null } | null
  serviceJourney: { line: { publicCode: string; name: string | null; transportMode: string } }
}
interface StopPlaceDeparturesResponse {
  data: { stopPlace: { name: string; estimatedCalls: EstimatedCall[] } | null }
}

const departuresCache = new Map<string, CacheEntry<{ stopName: string; departures: unknown[] }>>()

/**
 * Always fetched from Entur regardless of how many departures a slide is
 * actually configured to *show* (`count`, admin-capped at 20 in
 * `SlideFields.tsx`) — a schedule is effectively indefinite, so a display
 * that goes offline should have far more than just the next `count`
 * departures buffered client-side (see `useTransitDepartures.ts`'s own
 * `fullRef`) to keep trimming from as departures pass, the same way
 * `handleWeather` below always caches Yr's full multi-day forecast rather
 * than only the admin-chosen display window.
 */
const TRANSIT_FETCH_BUFFER = 100

const DEPARTURES_QUERY = `
  query StopPlaceDepartures($id: String!, $numberOfDepartures: Int!) {
    stopPlace(id: $id) {
      name
      estimatedCalls(numberOfDepartures: $numberOfDepartures, includeCancelledTrips: false) {
        aimedDepartureTime
        expectedDepartureTime
        realtime
        cancellation
        destinationDisplay { frontText }
        quay { publicCode }
        serviceJourney { line { publicCode name transportMode } }
      }
    }
  }
`

/** Fetches the next `TRANSIT_FETCH_BUFFER` real-time departures from stop `stopId` (regardless of `count` — see its own doc comment), cached briefly per `stopId` so several open kiosk/admin tabs (even ones configured with a different display `count`) don't each hit Entur independently. Returns the full buffered list; the caller/client is responsible for only *displaying* `count` of them. */
export async function handleDepartures(res: ServerResponse, stopId: string, count: number) {
  try {
    const result = await cached(departuresCache, stopId, DEPARTURES_CACHE_MS, async () => {
      const response = await fetch('https://api.entur.io/journey-planner/v3/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'ET-Client-Name': ENTUR_CLIENT_NAME },
        body: JSON.stringify({ query: DEPARTURES_QUERY, variables: { id: stopId, numberOfDepartures: Math.max(count, TRANSIT_FETCH_BUFFER) } }),
      })
      if (!response.ok) throw new Error(`journey planner failed: ${response.status}`)
      const body = (await response.json()) as StopPlaceDeparturesResponse
      if (!body.data.stopPlace) throw new Error(`unknown stop place: ${stopId}`)

      return {
        stopName: body.data.stopPlace.name,
        departures: body.data.stopPlace.estimatedCalls.map((call) => ({
          line: call.serviceJourney.line.publicCode,
          lineName: call.serviceJourney.line.name ?? undefined,
          mode: call.serviceJourney.line.transportMode,
          destination: call.destinationDisplay.frontText,
          expectedDepartureTime: call.expectedDepartureTime,
          aimedDepartureTime: call.aimedDepartureTime,
          realtime: call.realtime,
          platform: call.quay?.publicCode ?? undefined,
          cancelled: call.cancellation,
        })),
      }
    })
    sendJson(res, 200, result)
  } catch (error) {
    console.error('[extensions] departures lookup failed:', error)
    sendJson(res, 502, { error: 'Could not reach Entur for departures' })
  }
}

// --- Weather forecast (MET Norway / Yr) -------------------------------------

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

interface WeatherHourResult {
  time: string
  temperatureC: number
  precipitationMm: number
  symbolCode: string
  windSpeedMs?: number
  windFromDirectionDeg?: number
  humidityPercent?: number
  precipitationProbabilityPercent?: number
  uvIndex?: number
  pressureHpa?: number
}

const weatherCache = new Map<string, CacheEntry<WeatherHourResult[]>>()

/** Whether `isoTime` falls on the same (server-local) calendar date as `reference` — used to isolate "today's" entries out of the full cached timeseries for `todayLowC`/`todayHighC`, independent of however many hours the caller asked to have listed. */
function isSameLocalDate(isoTime: string, reference: Date): boolean {
  const date = new Date(isoTime)
  return date.getFullYear() === reference.getFullYear() && date.getMonth() === reference.getMonth() && date.getDate() === reference.getDate()
}

/** Fetches an hourly forecast for `(lat, lon)`, cached ~10 minutes (coordinates rounded to ~100m so nearby requests share a cache entry). Uses MET's "complete" dataset rather than "compact" — the same core fields, plus wind/humidity/pressure/UV/precipitation-probability for the optional display toggles in the admin's Weather (Yr) settings. Returns the *entire* multi-day cached timeseries, not just an `hours`-long slice — MET gives several days of hourly forecast per request regardless of `hours`, and truncating it here would throw away data a display could otherwise buffer client-side for offline use (a schedule/forecast this far ahead is worth keeping around even if only `hours` of it is shown live — see `useWeatherForecast.ts`'s own `fullRef`). `hours` is only used for the `todayLowC`/`todayHighC` midnight-edge fallback below; the caller/client is responsible for slicing `hourly` down to what it actually displays. `todayLowC`/`todayHighC` are computed fresh on every request (not baked into the ~10-minute cache) from the full timeseries, so they stay today's real low/high regardless of how few hours the admin chose to list. */
export async function handleWeather(res: ServerResponse, lat: number, lon: number, hours: number) {
  const cacheKey = `${lat.toFixed(3)},${lon.toFixed(3)}`
  try {
    const hourly = await cached(weatherCache, cacheKey, WEATHER_CACHE_MS, async () => {
      const url = `https://api.met.no/weatherapi/locationforecast/2.0/complete?lat=${lat}&lon=${lon}`
      const response = await fetch(url, { headers: { 'User-Agent': WEATHER_USER_AGENT } })
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
    })

    const now = new Date()
    const todayEntries = hourly.filter((entry) => isSameLocalDate(entry.time, now))
    const lowHighSource = todayEntries.length > 0 ? todayEntries : hourly.slice(0, hours)
    const todayLowC = lowHighSource.length > 0 ? Math.min(...lowHighSource.map((entry) => entry.temperatureC)) : undefined
    const todayHighC = lowHighSource.length > 0 ? Math.max(...lowHighSource.map((entry) => entry.temperatureC)) : undefined

    sendJson(res, 200, { hourly, todayLowC, todayHighC })
  } catch (error) {
    console.error('[extensions] weather lookup failed:', error)
    sendJson(res, 502, { error: 'Could not reach Yr for a forecast' })
  }
}
