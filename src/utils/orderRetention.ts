import type { OrderRecord } from '../types/order'

/** Customer names, phone numbers and notes are kept this long after an order was placed. */
export const ORDER_PERSONAL_DATA_RETENTION_MS = 7 * 24 * 60 * 60_000

/**
 * Clears the personal parts of an order once it's older than `ORDER_PERSONAL_DATA_RETENTION_MS`:
 * the customer's name and phone number, and the notes (free text often carries a name or a number).
 * Items, totals, status, payment and timestamps stay, so sales history still adds up.
 *
 * Returns the *same* object when nothing needs clearing (too recent, or already cleared), so callers
 * can tell "changed" by reference and never rewrite a key for nothing. Shared by the server's hourly
 * retention job (`server/retention.ts`) and the Neon pull (`server/neonMappers.ts`), which must agree
 * or each Neon pull would bring the names back.
 */
export function anonymiseIfExpired(order: OrderRecord, now: Date): OrderRecord {
  const placed = new Date(order.createdAt).getTime()
  if (!Number.isFinite(placed) || now.getTime() - placed <= ORDER_PERSONAL_DATA_RETENTION_MS) return order
  if (!order.customerName && !order.customerPhone && order.notes === undefined) return order
  const cleared: OrderRecord = { ...order, customerName: '', customerPhone: '', anonymisedAt: order.anonymisedAt ?? now.toISOString() }
  delete cleared.notes
  return cleared
}

/** Applies `anonymiseIfExpired` to a list, returning the same array when no order changed. */
export function anonymiseExpiredOrders(orders: OrderRecord[], now: Date): OrderRecord[] {
  let changed = false
  const next = orders.map((order) => {
    const cleared = anonymiseIfExpired(order, now)
    if (cleared !== order) changed = true
    return cleared
  })
  return changed ? next : orders
}
