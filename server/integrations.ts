import type { ServerResponse } from 'node:http'
import { ENTUR_CLIENT_NAME, fetchEnturDepartures } from '../src/lib/entur'
import { fetchMetHourly, todayLowHigh } from '../src/lib/metForecast'
import type { NearbyStop, StopDepartures, WeatherHour } from '../src/types/integrations'
import { sendJson } from './http'

/** MET Norway's terms ask for an identifying `User-Agent`, ideally with a way to reach the operator — override via the `WEATHER_USER_AGENT` env var to include a real contact if desired; functions fine without it either way. */
const WEATHER_USER_AGENT = process.env.WEATHER_USER_AGENT ?? 'adhdisplay-kiosk (self-hosted cafe display)'

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

/** Geocodes `address` to a coordinate, then finds nearby stop places around it — powers the Integrations tab's "Look up address" action. Not cached: a one-shot admin action, not something polled. */
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
    console.error('[integrations] address lookup failed:', error)
    sendJson(res, 502, { error: 'Could not reach Entur to look up this address' })
  }
}

/**
 * Searches stop places by name (not by proximity to any address) — powers
 * the Integrations tab's "Search for a stop" box, which lets an admin add a
 * specific stop anywhere (not just ones near the store's own address, unlike
 * `handleLookup`'s `nearbyStops`) to `IntegrationsConfig['transit']['selectedStops']`.
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
    console.error('[integrations] stop search failed:', error)
    sendJson(res, 502, { error: 'Could not reach Entur to search for stops' })
  }
}

// --- Transit departures (Entur JourneyPlanner) ------------------------------

const departuresCache = new Map<string, CacheEntry<StopDepartures>>()

/** `fetchEnturDepartures` (`src/lib/entur.ts`, shared with every display's own direct poller), cached briefly per `stopId` so several concurrent callers (the poller, an on-demand HTTP request) don't each hit Entur independently. Returns the full buffered list (see `TRANSIT_FETCH_BUFFER`); the caller is responsible for only *displaying* `count` of them. Shared by `handleDepartures` (the on-demand HTTP route) and `transitPoller.ts` (the background poller that owns `admin.transitDepartures`). */
export async function fetchStopDepartures(stopId: string, count: number): Promise<StopDepartures> {
  return cached(departuresCache, stopId, DEPARTURES_CACHE_MS, () => fetchEnturDepartures(stopId, count))
}

/** The on-demand HTTP route — kept for manual/debugging use even though the transit pane itself now reads `admin.transitDepartures` (kept fresh server-side by `transitPoller.ts`) instead of calling this directly. */
export async function handleDepartures(res: ServerResponse, stopId: string, count: number) {
  try {
    const result = await fetchStopDepartures(stopId, count)
    sendJson(res, 200, result)
  } catch (error) {
    console.error('[integrations] departures lookup failed:', error)
    sendJson(res, 502, { error: 'Could not reach Entur for departures' })
  }
}

// --- Weather forecast (MET Norway / Yr) -------------------------------------

const weatherCache = new Map<string, CacheEntry<WeatherHour[]>>()

/** Fetches an hourly forecast for `(lat, lon)` via `fetchMetHourly` (`src/lib/metForecast.ts`, shared with every display's own direct fetch), cached ~10 minutes (coordinates rounded to ~100m so nearby requests share a cache entry). Uses MET's "complete" dataset rather than "compact" — the same core fields, plus wind/humidity/pressure/UV/precipitation-probability for the optional display toggles in the admin's Weather (Yr) settings. Returns the *entire* multi-day cached timeseries, not just an `hours`-long slice — MET gives several days of hourly forecast per request regardless of `hours`, and truncating it here would throw away data a display could otherwise buffer client-side for offline use (a schedule/forecast this far ahead is worth keeping around even if only `hours` of it is shown live — see `useWeatherForecast.ts`). `hours` is only used for the `todayLowC`/`todayHighC` midnight-edge fallback below; the caller/client is responsible for slicing `hourly` down to what it actually displays. `todayLowC`/`todayHighC` are computed fresh on every request (not baked into the ~10-minute cache) from the full timeseries, so they stay today's real low/high regardless of how few hours the admin chose to list. */
export async function handleWeather(res: ServerResponse, lat: number, lon: number, hours: number) {
  const cacheKey = `${lat.toFixed(3)},${lon.toFixed(3)}`
  try {
    const hourly = await cached(weatherCache, cacheKey, WEATHER_CACHE_MS, () => fetchMetHourly(lat, lon, WEATHER_USER_AGENT))
    sendJson(res, 200, { hourly, ...todayLowHigh(hourly, hours) })
  } catch (error) {
    console.error('[integrations] weather lookup failed:', error)
    sendJson(res, 502, { error: 'Could not reach Yr for a forecast' })
  }
}
