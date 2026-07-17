/** One nearby public-transport stop place found via Entur's geocoder, a candidate for `ExtensionsConfig['transit']['selectedStops']`. */
export interface NearbyStop {
  /** Entur's own stop place id (e.g. `"NSR:StopPlace:12345"`), passed straight through to the departures lookup. */
  id: string
  name: string
  /** Transport modes served at this stop (e.g. `"bus"`, `"rail"`), as reported by Entur — shown next to its name so the admin can tell stops apart. */
  modes: string[]
}

/**
 * Result of the last "Look up address" action in the admin's Integrations tab
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

/**
 * One extra named location an admin has added for the weather integration,
 * in addition to (or instead of) the store's own address — looked up the
 * same way, via the same `/extensions/lookup` proxy (only `coordinates` is
 * used here; a location's own nearby stops, if any, are irrelevant to
 * weather). `coordinates` is `null` until looked up, or if the lookup
 * failed/hasn't been retried since `address` last changed.
 */
export interface WeatherLocation {
  id: string
  name: string
  address: string
  coordinates: { lat: number; lon: number } | null
}

/** Cafe-wide configuration for the live "Integrations" (Ruter transit departures, Entur, Yr weather), edited from the admin's Integrations tab and consumed by any screen slide of the matching content kind. */
export interface ExtensionsConfig {
  addressLookup?: AddressLookupResult
  /**
   * Entur is the exact same underlying transit feed as `transit` below (Ruter
   * is just Oslo's own regional brand for it) — the two are listed as
   * separate integrations purely so an admin outside Oslo can find the
   * feature under their own region's operator name, not because there's a
   * second real backend. `enabled` here is independent of `transit.enabled`
   * on purpose (each card's own on/off is its own category placement), but
   * doesn't gate the real slide — `TransitSlide` only ever checks
   * `transit.enabled`, so turning Entur off while Ruter stays on keeps the
   * feature working. Every other setting (stops, departure count, filters)
   * *is* shared with `transit`, since it's genuinely the same feed.
   */
  entur: {
    enabled: boolean
  }
  transit: {
    enabled: boolean
    /** The subset of the last lookup's `nearbyStops` the admin has opted into showing on a display — a slide of kind `'transit'` picks one of these by id. */
    selectedStops: NearbyStop[]
    departureCount: number
    /** Show each departure's quay/platform (e.g. `"A"`), when Entur reports one for that stop. */
    showPlatform: boolean
    /** Show the line's full name (e.g. "Ekebergbanen") instead of just its public code (e.g. "18"). */
    showLineName: boolean
    /** Hide schedule-only departures Entur hasn't started tracking live yet, keeping only `realtime: true` ones. */
    realtimeOnly: boolean
    /** Transport modes (matching `NearbyStop['modes']`, e.g. `"bus"`, `"rail"`) to include — empty means every mode at the stop is shown, unfiltered. */
    modeFilter: string[]
  }
  /**
   * The on/off switch, plus which location(s) a `'weather'` slide can
   * choose from — a slide's own forecast length and which extra details
   * (wind, humidity, etc.) it shows are configured per-slide instead (see
   * `ScreenSlotContent`'s `'weather'` variant), so different panes can each
   * show different detail for whichever location they pick.
   */
  weather: {
    enabled: boolean
    /** Whether the store's own address (`addressLookup.coordinates`, from Contact info) is offered as a selectable location for weather panes — on by default. Turning it off doesn't touch `addressLookup` itself (still shared with transit's own stop lookup); it just stops weather panes from offering/defaulting to it. */
    useStoreLocation: boolean
    /** Extra named locations an admin has added — e.g. a second store, or any other place they want a screen to show the forecast for. A `'weather'` slide picks one of these (or the store's own address) by id; see `WeatherSlide`'s resolution order. */
    locations: WeatherLocation[]
  }
}

/** Starting values for a cafe that hasn't configured either integration yet. */
export const DEFAULT_EXTENSIONS_CONFIG: ExtensionsConfig = {
  entur: { enabled: false },
  transit: { enabled: false, selectedStops: [], departureCount: 5, showPlatform: false, showLineName: false, realtimeOnly: false, modeFilter: [] },
  weather: { enabled: false, useStoreLocation: true, locations: [] },
}

/** One upcoming departure from `GET /extensions/departures`, as rendered by `TransitSlide`. */
export interface DepartureInfo {
  /** The line's public-facing number/code (e.g. `"31"`). */
  line: string
  /** The line's full name (e.g. `"Ekebergbanen"`), when Entur has one — not every line does. */
  lineName?: string
  /** Entur's transport mode string (e.g. `"bus"`, `"rail"`, `"tram"`). */
  mode: string
  destination: string
  expectedDepartureTime: string
  /** The static-timetable departure time, before any real-time adjustment — differs from `expectedDepartureTime` when the service is running late/early. */
  aimedDepartureTime: string
  /** Whether this time reflects live tracking rather than the static timetable. */
  realtime: boolean
  /** Quay/platform code (e.g. `"A"`), when Entur reports one for this stop. */
  platform?: string
  /** Whether Entur has cancelled this specific journey. */
  cancelled: boolean
}

/** One hour of `GET /extensions/weather`'s forecast, as rendered by `WeatherSlide`. Only `time`/`temperatureC`/`precipitationMm`/`symbolCode` are guaranteed — the rest come from MET's "complete" dataset and are missing where MET itself doesn't report them for that hour (e.g. `uvIndex` outside daylight). */
export interface WeatherHour {
  time: string
  temperatureC: number
  precipitationMm: number
  /** MET's own icon code (e.g. `"partlycloudy_day"`) — mapped to an emoji client-side, see `weatherSymbols.ts`. */
  symbolCode: string
  /** Wind speed in m/s. */
  windSpeedMs?: number
  /** Wind origin direction in compass degrees (0 = from the north). */
  windFromDirectionDeg?: number
  /** Relative humidity, 0-100. */
  humidityPercent?: number
  /** Chance of any precipitation in the coming hour, 0-100 — MET doesn't always compute this. */
  precipitationProbabilityPercent?: number
  /** UV index under a clear sky — only present during daylight hours. */
  uvIndex?: number
  /** Air pressure at sea level, in hPa. */
  pressureHpa?: number
}
