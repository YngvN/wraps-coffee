/**
 * The hourly personal-data retention pass: clears customer names, phone numbers and notes from every
 * order older than seven days, in every order key (see `anonymiseIfExpired` for exactly what is
 * cleared and kept). Runs once at startup and then hourly, and writes a key only when an order in it
 * actually changed, through the injected `applyUpdate` so every display gets the change.
 *
 * Website orders are also cleared at their source by the website's own scheduled function
 * (wraps-ulven `anonymise-orders`), and the Neon pull applies the same rule while mapping, so a pull
 * never brings a cleared name back.
 */
import type { OrderRecord } from '../src/types/order'
import { anonymiseExpiredOrders } from '../src/utils/orderRetention'
import { ORDER_KEYS, type OrderKey } from './orderStatus'

/** How often the pass runs. An order is therefore cleared at most an hour after its seventh day. */
export const RETENTION_INTERVAL_MS = 60 * 60_000

/** What the pass needs from the server around it. */
export interface RetentionDeps {
  readOrders: (key: OrderKey) => OrderRecord[]
  applyUpdate: (key: OrderKey, value: OrderRecord[]) => void
  now: () => Date
}

/** One pass over every order key. Returns how many orders were cleared. */
export function runOrderRetention(deps: RetentionDeps): number {
  let cleared = 0
  for (const key of ORDER_KEYS) {
    const orders = deps.readOrders(key)
    const next = anonymiseExpiredOrders(orders, deps.now())
    if (next === orders) continue
    cleared += next.filter((order, index) => order !== orders[index]).length
    deps.applyUpdate(key, next)
  }
  if (cleared > 0) console.log(`[retention] cleared customer details from ${cleared} order(s) older than 7 days`)
  return cleared
}

/** Runs the pass now and then every `RETENTION_INTERVAL_MS`. */
export function startOrderRetention(deps: RetentionDeps): void {
  runOrderRetention(deps)
  setInterval(() => runOrderRetention(deps), RETENTION_INTERVAL_MS).unref()
}
