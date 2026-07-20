import type { OrderRecord } from '../src/types/order'
import type { FoodoraConfig } from '../src/types/delivery'
import { DEFAULT_FOODORA_CONFIG } from '../src/types/delivery'
import type { SyncedKey } from '../src/types/sync'
import * as store from './store'
import * as foodoraAdapter from './foodoraAdapter'

/**
 * Background sync for Foodora delivery orders — identical shape to
 * `woltPoller.ts` (see its own doc comment for the full reasoning: no
 * webhook is practical since this server has no public internet endpoint by
 * default, so this polls on a plain interval instead, plus an explicit
 * `pollOnce()` an admin can trigger from the Integrations page's own "Sync
 * now" button). `admin.foodoraOrders` is owned entirely by this poller and
 * deliberately kept separate from `admin.orders` (Neon-owned) and
 * `admin.woltOrders` (`woltPoller`-owned) for the same reason as Wolt's own.
 */

const POLL_INTERVAL_MS = 30_000

type ApplyUpdate = (key: SyncedKey, value: unknown) => void

let applyUpdateRef: ApplyUpdate | null = null
let timer: ReturnType<typeof setInterval> | null = null

function currentConfig(): FoodoraConfig {
  return (store.get('admin.foodoraConfig')?.value as FoodoraConfig | undefined) ?? DEFAULT_FOODORA_CONFIG
}

function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Runs one sync attempt. A no-op (not an error) while the integration is disabled, so the interval timer can simply always be running. */
export async function pollOnce(): Promise<void> {
  if (!applyUpdateRef) return
  const config = currentConfig()
  if (!config.enabled) return

  const credentials = store.getFoodoraCredentials()
  // No-op — same posture as disabled, and the same reasoning as
  // `woltPoller.ts`'s own guard: without this, an admin turning the toggle
  // on before saving credentials would have every poll tick silently
  // overwrite `admin.foodoraOrders` with `[]` and report a misleadingly
  // "live" status.
  if (!credentials.apiKey || !credentials.venueId) return

  try {
    const orders = await foodoraAdapter.fetchOrders(credentials)
    const tagged: OrderRecord[] = orders.map((order) => ({ ...order, source: 'foodora' }))
    const lastOrderAt = tagged.reduce<string | undefined>((latest, order) => (!latest || order.createdAt > latest ? order.createdAt : latest), undefined)

    applyUpdateRef('admin.foodoraOrders', tagged)
    applyUpdateRef('admin.foodoraConfig', {
      ...config,
      status: { state: 'live', updatedAt: Date.now(), lastOrderAt: lastOrderAt ?? config.status.lastOrderAt },
    })
  } catch (error) {
    console.error('[foodora] sync failed:', error)
    applyUpdateRef('admin.foodoraConfig', {
      ...config,
      status: { ...config.status, state: 'error', updatedAt: Date.now(), detail: errorDetail(error) },
    })
  }
}

/** Starts the poll interval — call once at server boot, same posture as `woltPoller.start`. Safe to call even with the integration disabled/unconfigured; each tick is a no-op until an admin turns it on. */
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
