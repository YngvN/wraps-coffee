/** One nearby public-transport stop place found via Entur's geocoder, a candidate for `ExtensionsConfig['transit']['selectedStops']`. */
export interface NearbyStop {
  /** Entur's own stop place id (e.g. `"NSR:StopPlace:12345"`), passed straight through to the departures lookup. */
  id: string
  name: string
  /** Transport modes served at this stop (e.g. `"bus"`, `"rail"`), as reported by Entur — shown next to its name so the admin can tell stops apart. */
  modes: string[]
}

/**
 * Result of the last "Look up address" action in the admin's Extensions tab
 * (see `ExtensionsView.tsx`). `address` is the exact Contact info address
 * text this was looked up for, so the UI can tell when Contact info's own
 * address has since changed and this result is stale. `coordinates` is
 * `null` when the address couldn't be geocoded at all.
 */
export interface AddressLookupResult {
  address: string
  coordinates: { lat: number; lon: number } | null
  nearbyStops: NearbyStop[]
}

/** Cafe-wide configuration for the two external "Extensions" integrations (Ruter transit departures, Yr weather), edited from the admin's Extensions tab and consumed by any screen slide of the matching content kind. */
export interface ExtensionsConfig {
  addressLookup?: AddressLookupResult
  transit: {
    enabled: boolean
    /** The subset of the last lookup's `nearbyStops` the admin has opted into showing on a display — a slide of kind `'transit'` picks one of these by id. */
    selectedStops: NearbyStop[]
    departureCount: number
  }
  weather: {
    enabled: boolean
    forecastHours: number
  }
}

/** Starting values for a cafe that hasn't configured either integration yet. */
export const DEFAULT_EXTENSIONS_CONFIG: ExtensionsConfig = {
  transit: { enabled: false, selectedStops: [], departureCount: 5 },
  weather: { enabled: false, forecastHours: 6 },
}

/** One upcoming departure from `GET /extensions/departures`, as rendered by `TransitSlide`. */
export interface DepartureInfo {
  /** The line's public-facing number/code (e.g. `"31"`). */
  line: string
  /** Entur's transport mode string (e.g. `"bus"`, `"rail"`, `"tram"`). */
  mode: string
  destination: string
  expectedDepartureTime: string
  /** Whether this time reflects live tracking rather than the static timetable. */
  realtime: boolean
}

/** One hour of `GET /extensions/weather`'s forecast, as rendered by `WeatherSlide`. */
export interface WeatherHour {
  time: string
  temperatureC: number
  precipitationMm: number
  /** MET's own icon code (e.g. `"partlycloudy_day"`) — mapped to an emoji client-side, see `weatherSymbols.ts`. */
  symbolCode: string
}
