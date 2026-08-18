import type { DepartureInfo, IntegrationsConfig, TransitDeparturesSnapshot } from '../src/types/integrations'
import { DEFAULT_INTEGRATIONS_CONFIG } from '../src/types/integrations'
import type { SyncedKey } from '../src/types/sync'
import { fetchStopDepartures } from './integrations'
import * as store from './store'

/**
 * Background sync for transit departures — the local server's own
 * equivalent of `woltPoller.ts`/`foodoraPoller.ts`, but polling Entur
 * instead of a delivery provider. Owning this server-side (one poll per
 * stop, not one per open display) rather than leaving each display to fetch
 * `GET /integrations/departures` independently means every connected
 * display/companion app sees the exact same data, pushed the moment it
 * changes, and a freshly connected/swapped display gets a correct snapshot
 * immediately via the sync protocol's own snapshot-on-subscribe — see
 * `admin.transitDepartures` in `src/types/sync.ts`.
 */

const POLL_INTERVAL_MS = 30_000

/** Always fetched per stop regardless of any one pane's own configured display count — mirrors `TRANSIT_FETCH_BUFFER` in `integrations.ts`, since this snapshot is shared across every pane that might reference the stop. */
const DEPARTURES_PER_STOP = 100

type ApplyUpdate = (key: SyncedKey, value: unknown) => void

let applyUpdateRef: ApplyUpdate | null = null
let timer: ReturnType<typeof setInterval> | null = null

function currentIntegrationsConfig(): IntegrationsConfig {
  return (store.get('admin.integrations')?.value as IntegrationsConfig | undefined) ?? DEFAULT_INTEGRATIONS_CONFIG
}

function currentSnapshot(): TransitDeparturesSnapshot {
  return (store.get('admin.transitDepartures')?.value as TransitDeparturesSnapshot | undefined) ?? {}
}

/** Every stop id currently curated by an admin, across both brands' independent pools — see `IntegrationsConfig`'s own doc comment on why `transit`/`entur` each keep a separate `selectedStops` list. */
function configuredStopIds(config: IntegrationsConfig): string[] {
  const ids = new Set([...config.transit.selectedStops.map((stop) => stop.id), ...config.entur.selectedStops.map((stop) => stop.id)])
  return [...ids]
}

/**
 * Runs one poll cycle: fetches every currently configured stop and merges
 * successful results into `admin.transitDepartures`, pushing once per cycle
 * (not once per stop) so subscribers get one coherent update. A stop whose
 * fetch fails keeps its prior entry untouched — the same "don't overwrite
 * good data with an error" posture `woltPoller.ts` uses for orders — so a
 * transient Entur outage degrades to stale-but-present data rather than a
 * blank pane.
 */
export async function pollOnce(): Promise<void> {
  if (!applyUpdateRef) return
  const stopIds = configuredStopIds(currentIntegrationsConfig())
  if (stopIds.length === 0) return

  const results = await Promise.allSettled(stopIds.map((stopId) => fetchStopDepartures(stopId, DEPARTURES_PER_STOP).then((result) => ({ stopId, result }))))

  const snapshot = { ...currentSnapshot() }
  let changed = false
  for (const outcome of results) {
    if (outcome.status === 'rejected') {
      console.error('[transit] poll failed for a stop:', outcome.reason)
      continue
    }
    const { stopId, result } = outcome.value
    const departures: DepartureInfo[] = result.departures
    snapshot[stopId] = { stopName: result.stopName, departures, fetchedAt: new Date().toISOString() }
    changed = true
  }

  if (changed) applyUpdateRef('admin.transitDepartures', snapshot)
}

/** Starts the poll interval — call once at server boot, same posture as `woltPoller.start`. Safe to call with no stops configured yet; each tick is a no-op until an admin picks one. */
export function start(applyUpdate: ApplyUpdate) {
  applyUpdateRef = applyUpdate
  if (timer) clearInterval(timer)
  timer = setInterval(() => void pollOnce(), POLL_INTERVAL_MS)
  void pollOnce()
}

/** Re-polls immediately — e.g. after an admin adds/removes a stop, so the new pool doesn't wait for the next tick. */
export function restart() {
  void pollOnce()
}

/** Stops the poll interval — called on graceful shutdown (SIGTERM/SIGINT). */
export function stop() {
  if (timer) clearInterval(timer)
  timer = null
}
