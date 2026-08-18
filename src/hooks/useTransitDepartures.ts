import { useEffect, useState } from 'react'
import type { DepartureInfo, TransitDeparturesSnapshot } from '../types/integrations'
import { useLocalStorage } from './useLocalStorage'

const STORAGE_KEY = 'admin.transitDepartures'

/** How stale the server's own last successful poll for a stop has to be before it's shown as "not live" rather than trusted outright — comfortably past `transitPoller.ts`'s own 30s interval so one merely-slow tick doesn't flicker the notice. */
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
  /** `true` when `departures` is being shown as a scheduled fallback (see `asScheduled`) because the server's own snapshot for this stop has gone stale, rather than a recent poll — lets `TransitSlide` show a "not live" notice instead of silently passing off an outdated/reinterpreted list as current. */
  stale: boolean
}

/**
 * Reads `stopId`'s own entry out of `admin.transitDepartures` — the local
 * server's own background poller (`server/transitPoller.ts`) is the sole
 * writer, fetching Entur once per stop (not once per open display) and
 * pushing the result to every connected display/companion app via the
 * standard sync mechanism (see `useLocalStorage`). This hook itself no
 * longer talks to Entur, or even the local server's own REST route,
 * directly — it just reads whatever the server last successfully learned,
 * which arrives instantly on subscribe (the sync protocol's own
 * snapshot-on-connect) even for a freshly connected/swapped display that has
 * no history of its own. The poller only overwrites a stop's entry on a
 * *successful* fetch, so every display keeps showing the same last-known-good
 * data — not a per-device fallback that could differ display to display — for
 * as long as Entur itself stays unreachable.
 */
export function useTransitDepartures(stopId: string | undefined, count: number): TransitDeparturesState {
  const [snapshot] = useLocalStorage<TransitDeparturesSnapshot>(STORAGE_KEY, {})
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), STALE_CHECK_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [])

  if (!stopId) return { stopName: null, departures: [], loading: false, stale: false }

  const entry = snapshot[stopId]
  if (!entry) return { stopName: null, departures: [], loading: true, stale: false }

  const stale = now - new Date(entry.fetchedAt).getTime() > STALE_THRESHOLD_MS
  const departures = stale ? asScheduled(entry.departures) : entry.departures
  return { stopName: entry.stopName, departures: departures.slice(0, count), loading: false, stale }
}
