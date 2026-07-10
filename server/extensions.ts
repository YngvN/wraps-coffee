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

// --- Transit departures (Entur JourneyPlanner) ------------------------------

interface EstimatedCall {
  expectedDepartureTime: string
  realtime: boolean
  destinationDisplay: { frontText: string }
  serviceJourney: { line: { publicCode: string; transportMode: string } }
}
interface StopPlaceDeparturesResponse {
  data: { stopPlace: { name: string; estimatedCalls: EstimatedCall[] } | null }
}

const departuresCache = new Map<string, CacheEntry<{ stopName: string; departures: unknown[] }>>()

const DEPARTURES_QUERY = `
  query StopPlaceDepartures($id: String!, $numberOfDepartures: Int!) {
    stopPlace(id: $id) {
      name
      estimatedCalls(numberOfDepartures: $numberOfDepartures, includeCancelledTrips: false) {
        expectedDepartureTime
        realtime
        destinationDisplay { frontText }
        serviceJourney { line { publicCode transportMode } }
      }
    }
  }
`

/** Fetches the next `count` real-time departures from stop `stopId`, cached briefly per `(stopId, count)` so several open kiosk/admin tabs don't each hit Entur independently. */
export async function handleDepartures(res: ServerResponse, stopId: string, count: number) {
  try {
    const result = await cached(departuresCache, `${stopId}:${count}`, DEPARTURES_CACHE_MS, async () => {
      const response = await fetch('https://api.entur.io/journey-planner/v3/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'ET-Client-Name': ENTUR_CLIENT_NAME },
        body: JSON.stringify({ query: DEPARTURES_QUERY, variables: { id: stopId, numberOfDepartures: count } }),
      })
      if (!response.ok) throw new Error(`journey planner failed: ${response.status}`)
      const body = (await response.json()) as StopPlaceDeparturesResponse
      if (!body.data.stopPlace) throw new Error(`unknown stop place: ${stopId}`)

      return {
        stopName: body.data.stopPlace.name,
        departures: body.data.stopPlace.estimatedCalls.map((call) => ({
          line: call.serviceJourney.line.publicCode,
          mode: call.serviceJourney.line.transportMode,
          destination: call.destinationDisplay.frontText,
          expectedDepartureTime: call.expectedDepartureTime,
          realtime: call.realtime,
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
        instant: { details: { air_temperature: number } }
        next_1_hours?: { summary: { symbol_code: string }; details: { precipitation_amount: number } }
      }
    }[]
  }
}

const weatherCache = new Map<string, CacheEntry<{ time: string; temperatureC: number; precipitationMm: number; symbolCode: string }[]>>()

/** Fetches an hourly forecast for `(lat, lon)`, cached ~10 minutes (coordinates rounded to ~100m so nearby requests share a cache entry); `hours` only slices the cached timeseries, it isn't part of the upstream request. */
export async function handleWeather(res: ServerResponse, lat: number, lon: number, hours: number) {
  const cacheKey = `${lat.toFixed(3)},${lon.toFixed(3)}`
  try {
    const hourly = await cached(weatherCache, cacheKey, WEATHER_CACHE_MS, async () => {
      const url = `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${lat}&lon=${lon}`
      const response = await fetch(url, { headers: { 'User-Agent': WEATHER_USER_AGENT } })
      if (!response.ok) throw new Error(`locationforecast failed: ${response.status}`)
      const body = (await response.json()) as LocationforecastResponse

      return body.properties.timeseries
        .filter((entry) => entry.data.next_1_hours)
        .map((entry) => ({
          time: entry.time,
          temperatureC: entry.data.instant.details.air_temperature,
          precipitationMm: entry.data.next_1_hours!.details.precipitation_amount,
          symbolCode: entry.data.next_1_hours!.summary.symbol_code,
        }))
    })
    sendJson(res, 200, { hourly: hourly.slice(0, hours) })
  } catch (error) {
    console.error('[extensions] weather lookup failed:', error)
    sendJson(res, 502, { error: 'Could not reach Yr for a forecast' })
  }
}
