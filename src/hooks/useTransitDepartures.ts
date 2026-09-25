import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { getDirectDepartures, subscribeDirectDepartures } from '../lib/directTransitPoller'
import type { DepartureInfo, TransitDeparturesSnapshot } from '../types/integrations'
import { useLocalStorage } from './useLocalStorage'

const STORAGE_KEY = 'admin.transitDepartures'

/** How stale the freshest known fetch for a stop (the display's own direct one, or the server's) has to be before it's shown as "not live" rather than trusted outright — comfortably past `transitPoller.ts`'s own 30s interval so one merely-slow tick doesn't flicker the notice. */
const STALE_THRESHOLD_MS = 90_000

/** How often staleness is re-evaluated locally — `fetchedAt` only changes when the server pushes a fresh poll, so without a local tick a stop that stops receiving updates would never be *noticed* as stale until some unrelated re-render happened to occur. */
const STALE_CHECK_INTERVAL_MS = 15_000

/**
 * Reinterprets a departure list as a static timetable rather than a live
 * prediction, for whenever the server's own snapshot has gone stale (see
 * `STALE_THRESHOLD_MS`): forces `realtime` off (there's no way to know
 * whether that last-known delay still holds) and shows each departure's own
 * `aimedDepartureTime` (the timetabled time) instead of its
 * `expectedDepartureTime` (a live adjustment that may now be outdated and
 * misleading) — then drops any that have already passed by wall-clock time,
 * since "in -12 min" reads as broken rather than informative.
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
  /** `true` when `departures` is being shown as a scheduled fallback (see `asScheduled`) because neither this display's own direct fetch nor the server's snapshot for this stop is recent — lets `TransitSlide` show a "not live" notice instead of silently passing off an outdated/reinterpreted list as current. */
  stale: boolean
}

/**
 * `stopId`'s departures, internet first with the local server as the backup.
 * Two sources are kept side by side:
 *  - this display's own direct Entur poll (`directTransitPoller.ts`, one per
 *    stop per page), which keeps a display with internet live even while the
 *    local server is down;
 *  - the server's `admin.transitDepartures` snapshot (`server/transitPoller.ts`,
 *    pushed over sync), which keeps a display without direct internet access
 *    live, and arrives instantly on subscribe even for a freshly connected
 *    display with no history of its own.
 * Whichever has the newer `fetchedAt` wins, so neither has to know whether the
 * other is failing. Both only ever replace an entry on a *successful* fetch, so
 * when both go quiet the freshest last-known-good list is shown as a timetable
 * (see `asScheduled`) instead.
 */
export function useTransitDepartures(stopId: string | undefined, count: number): TransitDeparturesState {
  const [snapshot] = useLocalStorage<TransitDeparturesSnapshot>(STORAGE_KEY, {})
  const subscribe = useCallback((listener: () => void) => (stopId ? subscribeDirectDepartures(stopId, listener) : () => {}), [stopId])
  const direct = useSyncExternalStore(subscribe, () => (stopId ? getDirectDepartures(stopId) : null))
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), STALE_CHECK_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [])

  if (!stopId) return { stopName: null, departures: [], loading: false, stale: false }

  const serverEntry = snapshot[stopId]
  const entry = !direct ? serverEntry : !serverEntry || Date.parse(direct.fetchedAt) > Date.parse(serverEntry.fetchedAt) ? direct : serverEntry
  if (!entry) return { stopName: null, departures: [], loading: true, stale: false }

  const stale = now - new Date(entry.fetchedAt).getTime() > STALE_THRESHOLD_MS
  const departures = stale ? asScheduled(entry.departures) : entry.departures
  return { stopName: entry.stopName, departures: departures.slice(0, count), loading: false, stale }
}
