import type { TransitDeparturesSnapshot } from '../types/integrations'
import { fetchEnturDepartures, TRANSIT_FETCH_BUFFER } from './entur'

/** One stop's directly-fetched entry — the same shape as a stop's entry in the server's `admin.transitDepartures` snapshot, so `useTransitDepartures` can compare the two by `fetchedAt` and use whichever is fresher. */
export type DirectDeparturesEntry = TransitDeparturesSnapshot[string]

/** Same cadence as the server's own `transitPoller.ts`. */
const POLL_INTERVAL_MS = 30_000

/** Gives up on a direct fetch well inside one poll interval, so a hung request (a browser fetch has no timeout of its own) can't hold `inFlight` and stall this stop's polling for good. */
const FETCH_TIMEOUT_MS = 15_000

/** Per-stop localStorage key, so a display reloaded while offline still starts from its last direct fetch rather than only the server's (possibly older) snapshot. */
const CACHE_KEY_PREFIX = 'transit-direct:'

interface StopPoll {
  listeners: Set<() => void>
  entry: DirectDeparturesEntry | null
  timer: ReturnType<typeof setInterval> | null
  inFlight: boolean
}

const polls = new Map<string, StopPoll>()

function readCache(stopId: string): DirectDeparturesEntry | null {
  try {
    const raw = window.localStorage.getItem(`${CACHE_KEY_PREFIX}${stopId}`)
    return raw ? (JSON.parse(raw) as DirectDeparturesEntry) : null
  } catch {
    return null
  }
}

function writeCache(stopId: string, entry: DirectDeparturesEntry) {
  try {
    window.localStorage.setItem(`${CACHE_KEY_PREFIX}${stopId}`, JSON.stringify(entry))
  } catch {
    // Storage full or unavailable — the in-memory entry still serves this page.
  }
}

function pollFor(stopId: string): StopPoll {
  let poll = polls.get(stopId)
  if (!poll) {
    poll = { listeners: new Set(), entry: readCache(stopId), timer: null, inFlight: false }
    polls.set(stopId, poll)
  }
  return poll
}

/** One direct Entur fetch for `stopId`. Skipped while the browser reports itself offline or a previous fetch is still pending; a failure keeps the last good entry, leaving `useTransitDepartures` to fall back to the server's snapshot once this one goes stale. */
function tick(stopId: string, poll: StopPoll) {
  if (poll.inFlight || navigator.onLine === false) return
  poll.inFlight = true
  fetchEnturDepartures(stopId, TRANSIT_FETCH_BUFFER, AbortSignal.timeout(FETCH_TIMEOUT_MS))
    .then((result) => {
      const entry: DirectDeparturesEntry = { ...result, fetchedAt: new Date().toISOString() }
      poll.entry = entry
      writeCache(stopId, entry)
      for (const listener of poll.listeners) listener()
    })
    .catch(() => {})
    .finally(() => {
      poll.inFlight = false
    })
}

/**
 * Subscribes to a display's own direct Entur departures for `stopId` — the
 * internet-first half of transit data, with the server's `admin.transitDepartures`
 * snapshot as the backup (see `useTransitDepartures`). Polls once per stop per
 * page, however many panes/thumbnails show it: the first subscriber starts
 * the 30s poll, the last one to leave stops it. Shaped for
 * `useSyncExternalStore` — `listener` is called after every successful fetch.
 */
export function subscribeDirectDepartures(stopId: string, listener: () => void): () => void {
  const poll = pollFor(stopId)
  poll.listeners.add(listener)
  if (!poll.timer) {
    tick(stopId, poll)
    poll.timer = setInterval(() => tick(stopId, poll), POLL_INTERVAL_MS)
  }
  return () => {
    poll.listeners.delete(listener)
    if (poll.listeners.size === 0 && poll.timer) {
      clearInterval(poll.timer)
      poll.timer = null
    }
  }
}

/** The latest direct entry for `stopId` (from this page's poll, else the localStorage cache), or `null` if this display has never fetched it directly. Stable reference between fetches, as `useSyncExternalStore` requires. */
export function getDirectDepartures(stopId: string): DirectDeparturesEntry | null {
  return pollFor(stopId).entry
}
