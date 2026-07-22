import type { OrderRecord } from '../src/types/order'
import type { WoltConfig } from '../src/types/delivery'
import { DEFAULT_WOLT_CONFIG } from '../src/types/delivery'
import type { SyncedKey } from '../src/types/sync'
import * as store from './store'
import * as woltAdapter from './woltAdapter'

/**
 * Background sync for Wolt delivery orders — the local server's own
 * equivalent of `neonBridge.ts`, but far simpler: Wolt's POS Integration
 * API has no `LISTEN`/`NOTIFY` equivalent this app can reuse, and this
 * server has no public internet endpoint by default for Wolt to send a
 * webhook to (README: "binds to all interfaces... reachable from other
 * devices on the same network," not the open internet), so this polls on
 * a plain interval instead, plus an explicit `pollOnce()` an admin can
 * trigger from the Integrations page's own "Sync now" button.
 *
 * `admin.woltOrders` is owned entirely by this poller (unlike
 * `admin.orders`, which `neonBridge.ts` owns) — every successful poll
 * *fully replaces* it, since Wolt is the sole source of truth for what's
 * currently in this app's own view of "Wolt's open orders." This is
 * deliberately a *separate* synced key from `admin.orders`, not merged
 * into it: `admin.orders` gets unconditionally overwritten by every Neon
 * pull, so anything written there from elsewhere would eventually be wiped.
 */

const POLL_INTERVAL_MS = 30_000

type ApplyUpdate = (key: SyncedKey, value: unknown) => void

let applyUpdateRef: ApplyUpdate | null = null
let timer: ReturnType<typeof setInterval> | null = null

function currentConfig(): WoltConfig {
  return (store.get('admin.woltConfig')?.value as WoltConfig | undefined) ?? DEFAULT_WOLT_CONFIG
}

function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Runs one sync attempt. A no-op (not an error) while the integration is disabled, so the interval timer can simply always be running. */
export async function pollOnce(): Promise<void> {
  if (!applyUpdateRef) return
  const config = currentConfig()
  if (!config.enabled) return

  const credentials = store.getWoltCredentials()
  // No-op — same posture as disabled, deliberately not a "successful sync
  // with 0 orders." Without this, an admin turning the toggle on before
  // saving credentials would have every poll tick silently overwrite
  // `admin.woltOrders` with `[]` and report a misleadingly "live" status;
  // the Integrations page's own card already shows a "needs credentials"
  // status locally (see `woltMissingCredentials` in `IntegrationsView.tsx`)
  // without needing a poll attempt at all.
  if (!credentials.apiKey || !credentials.venueId) return

  try {
    const orders = await woltAdapter.fetchOrders(credentials)
    const tagged: OrderRecord[] = orders.map((order) => ({ ...order, source: 'wolt' }))
    const lastOrderAt = tagged.reduce<string | undefined>((latest, order) => (!latest || order.createdAt > latest ? order.createdAt : latest), undefined)

    applyUpdateRef('admin.woltOrders', tagged)
    applyUpdateRef('admin.woltConfig', {
      ...config,
      status: { state: 'live', updatedAt: Date.now(), lastOrderAt: lastOrderAt ?? config.status.lastOrderAt },
    })
  } catch (error) {
    console.error('[wolt] sync failed:', error)
    applyUpdateRef('admin.woltConfig', {
      ...config,
      status: { ...config.status, state: 'error', updatedAt: Date.now(), detail: errorDetail(error) },
    })
  }
}

/** Starts the poll interval — call once at server boot, same posture as `neonBridge.start`. Safe to call even with the integration disabled/unconfigured; each tick is a no-op until an admin turns it on. */
export function start(applyUpdate: ApplyUpdate) {
  applyUpdateRef = applyUpdate
  if (timer) clearInterval(timer)
  timer = setInterval(() => void pollOnce(), POLL_INTERVAL_MS)
  void pollOnce()
}

/** Re-syncs immediately — called after a credentials save or an enabled/disabled toggle, so the card's own status reflects reality without waiting for the next tick. */
export function restart() {
  void pollOnce()
}
