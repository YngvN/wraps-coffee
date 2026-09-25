/**
 * The one short number an order is known by — on the customer pickup board, the staff board, receipts,
 * the register's history, and what staff call out. Its first letter says where the order came from:
 * - a website order is its 5-character pickup code (`K7M2Q`, never starting with F or W — see the
 *   website's `netlify/functions/shared/pickupCode.ts`), the same code as in its pickup QR;
 * - a Wolt order is `W` + 4 characters of its id, a Foodora order `F` + 4;
 * - a register (counter) sale is its daily counter number (`K12`);
 * - an older website order with no pickup code keeps the last 4 characters of its id.
 */
import type { OrderRecord } from '../types/order'

/** The last 4 characters of an id, uppercased — the fallback short form. */
function tail(id: string): string {
  return id.slice(-4).toUpperCase()
}

/** The order's number, without the `#` some places show in front of it. */
export function orderNumber(order: OrderRecord): string {
  if (order.displayNumber) return order.displayNumber
  if (order.source === 'wolt') return `W${tail(order.externalId ?? order.id)}`
  if (order.source === 'foodora') return `F${tail(order.externalId ?? order.id)}`
  if (order.pickupCode) return order.pickupCode.toUpperCase()
  return tail(order.id)
}
