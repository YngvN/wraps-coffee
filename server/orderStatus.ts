/**
 * One place that changes a single order's status, shared by the admin Wolt/Foodora status routes and
 * the touch order board's own `POST /display-orders/status` route (see `server/index.ts`).
 *
 * Takes its store access and side effects as injected dependencies rather than importing them:
 * `applyUpdate` lives inside `server/index.ts` itself, which already imports this module, so a direct
 * import would be circular — and injecting them is also what makes this unit-testable.
 */
import type { OrderRecord, OrderStatus } from '../src/types/order'
import type { ScreenConfig } from '../src/types/screen'
import type { SyncedKey } from '../src/types/sync'

/** Every valid `OrderStatus`, for validating a status that arrived over the network. */
export const ORDER_STATUSES: readonly OrderStatus[] = ['received', 'accepted', 'preparing', 'ready', 'completed', 'cancelled']

/** Narrows an untrusted request-body value to an `OrderStatus`. */
export function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === 'string' && (ORDER_STATUSES as readonly string[]).includes(value)
}

/** The synced keys orders live in — one per source (see `OrderSource`). */
export type OrderKey = 'admin.orders' | 'admin.woltOrders' | 'admin.foodoraOrders' | 'admin.registerOrders'

/** Every `OrderKey`, in the order they're searched. */
export const ORDER_KEYS: readonly OrderKey[] = ['admin.orders', 'admin.woltOrders', 'admin.foodoraOrders', 'admin.registerOrders']

/** What `setOrderStatus` needs from the server around it. */
export interface OrderStatusDeps {
  /** The current value of one orders key, read fresh from the store on every call. */
  readOrders: (key: OrderKey) => OrderRecord[]
  /** `server/index.ts`'s own `applyUpdate` — persists and broadcasts. */
  applyUpdate: (key: SyncedKey, value: unknown) => void
  /** Pushes a website-order change back to Neon (`neonBridge.pushIfRelevant`). */
  pushWebsite: (key: SyncedKey, value: unknown) => void
  /** Pushes a status to Wolt's own API. Rejects on failure. */
  pushWolt: (externalId: string, status: OrderStatus) => Promise<void>
  /** Pushes a status to Foodora's own API. Rejects on failure. */
  pushFoodora: (externalId: string, status: OrderStatus) => Promise<void>
}

/** `notFound` — no order with that id in the key(s) searched; `pushFailed` — the delivery platform rejected the change, so nothing was changed locally either. */
export type SetOrderStatusResult = { ok: true; order: OrderRecord } | { ok: false; reason: 'notFound' | 'pushFailed'; error?: unknown }

/** Finds which key currently holds `orderId`, searching only `keys`. */
function findOrderKey(deps: OrderStatusDeps, orderId: string, keys: readonly OrderKey[]): OrderKey | undefined {
  return keys.find((key) => deps.readOrders(key).some((order) => order.id === orderId))
}

/** Replaces one order's status in the *current* store value of `key` — never a previously read copy — so an order a poller inserted in the meantime is never overwritten. Returns the updated order, or `undefined` if it vanished. */
function patchOne(deps: OrderStatusDeps, key: OrderKey, orderId: string, status: OrderStatus): OrderRecord | undefined {
  const current = deps.readOrders(key)
  const existing = current.find((order) => order.id === orderId)
  if (!existing) return undefined
  const updated = { ...existing, status }
  const next = current.map((order) => (order.id === orderId ? updated : order))
  deps.applyUpdate(key, next)
  if (key === 'admin.orders') deps.pushWebsite(key, next)
  return updated
}

/**
 * Sets one order's status. Delivery-platform orders are pushed to the platform *first* and only
 * changed locally once it accepts (the same order the admin routes always used), so the local board
 * never shows a status the platform doesn't have. The store is re-read after that `await`, not
 * before it, so a poll that landed while the push was in flight survives.
 *
 * `onlyKey` restricts the search to one source (the admin Wolt/Foodora routes, which address an
 * order by source-specific id); omitted, every order key is searched (the order board). Register
 * orders have no platform to push to, so they change locally straight away, like website orders.
 */
export async function setOrderStatus(deps: OrderStatusDeps, orderId: string, status: OrderStatus, onlyKey?: OrderKey): Promise<SetOrderStatusResult> {
  const key = findOrderKey(deps, orderId, onlyKey ? [onlyKey] : ORDER_KEYS)
  if (!key) return { ok: false, reason: 'notFound' }

  if (key === 'admin.woltOrders' || key === 'admin.foodoraOrders') {
    const order = deps.readOrders(key).find((candidate) => candidate.id === orderId)
    if (!order) return { ok: false, reason: 'notFound' }
    try {
      const push = key === 'admin.woltOrders' ? deps.pushWolt : deps.pushFoodora
      await push(order.externalId ?? order.id, status)
    } catch (error) {
      return { ok: false, reason: 'pushFailed', error }
    }
  }

  const updated = patchOne(deps, key, orderId, status)
  return updated ? { ok: true, order: updated } : { ok: false, reason: 'notFound' }
}

/**
 * Whether `screen` has at least one staff-mode orders pane with Touch control switched on, at any
 * stage — the condition under which an approved device showing this screen may change an order's
 * status (see `POST /display-orders/status`). A customer-mode pane never qualifies, even if a stale
 * `touchControl: true` is still stored on it.
 */
export function screenAllowsOrderTouch(screen: ScreenConfig | undefined): boolean {
  if (!screen) return false
  return Object.values(screen.paneSlots ?? {}).some((slot) =>
    Object.values(slot.content ?? {}).some((content) => content?.kind === 'orders' && content.mode === 'staff' && content.touchControl === true),
  )
}

/** Whether `screen` has a Register pane at any stage — the condition under which an approved device showing this screen may use the register routes (see `server/register/routes.ts`). */
export function screenHasRegister(screen: ScreenConfig | undefined): boolean {
  if (!screen) return false
  return Object.values(screen.paneSlots ?? {}).some((slot) => Object.values(slot.content ?? {}).some((content) => content?.kind === 'register'))
}
