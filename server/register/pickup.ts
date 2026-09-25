/**
 * Completing a website order by scanning the customer's pickup QR at the register. Matching is
 * against `admin.orders` only (the one key website orders live in), with a constant-time compare of
 * the code, so a guessed order id alone never completes anything.
 */
import { timingSafeEqual } from 'node:crypto'
import type { OrderRecord, OrderStatus } from '../../src/types/order'
import type { PickupRequest } from '../../src/lib/pickupCode'

/** Constant-time string equality (length leaks, but every code has the same length). */
function sameCode(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

/** The website order a pickup request points at, or `undefined` when no order matches both id (for a QR) and code. */
export function findPickupOrder(orders: OrderRecord[], request: PickupRequest): OrderRecord | undefined {
  if (request.kind === 'qr') {
    const order = orders.find((candidate) => candidate.id.toLowerCase() === request.orderId)
    return order?.pickupCode && sameCode(order.pickupCode.toUpperCase(), request.code) ? order : undefined
  }
  // A typed code: prefer an order that's still open, so an old completed order sharing the code
  // (8 base32 characters make that unlikely, not impossible) never hides today's.
  const matches = orders.filter((candidate) => candidate.pickupCode && sameCode(candidate.pickupCode.toUpperCase(), request.code))
  return matches.find((candidate) => candidate.status !== 'completed' && candidate.status !== 'cancelled') ?? matches[0]
}

/**
 * What to do with a matched order:
 * - `complete` — mark it picked up;
 * - `confirmNotReady` — it isn't `ready` yet, so staff must confirm handing it over early (`force`);
 * - `alreadyCompleted` — a repeat scan; nothing changes;
 * - `cancelled` — the order was cancelled and must not be handed over.
 */
export type PickupDecision = { action: 'complete' } | { action: 'confirmNotReady'; status: OrderStatus } | { action: 'alreadyCompleted' } | { action: 'cancelled' }

/** Decides what a pickup scan does to `order`. `force` is staff confirming an early handover. */
export function decidePickup(order: OrderRecord, force: boolean): PickupDecision {
  if (order.status === 'cancelled') return { action: 'cancelled' }
  if (order.status === 'completed') return { action: 'alreadyCompleted' }
  if (order.status === 'ready' || force) return { action: 'complete' }
  return { action: 'confirmNotReady', status: order.status }
}
