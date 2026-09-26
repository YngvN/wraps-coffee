/**
 * Creates one register (counter) order. Synchronous on purpose: it reads `admin.registerOrders`,
 * appends one order and writes it back with no `await` in between, so nothing another request writes
 * can be lost — the same "patch one, never a whole client array" rule as `server/orderStatus.ts`.
 * Store access is injected (see that module's header for why).
 */
import type { OrderPayment, OrderRecord } from '../../src/types/order'
import { nextDisplayNumber, priceCart, type CartLineInput, type PricedCart, type PricingCatalogue, type PricingError, type Serving } from '../../src/lib/registerPricing'

/** What `createRegisterOrder` needs from the server around it. */
export interface RegisterOrderDeps {
  /** The current `admin.registerOrders`, read fresh. */
  readOrders: () => OrderRecord[]
  /** Persists and broadcasts `admin.registerOrders` (index's `applyUpdate`, which also reconciles stock). */
  writeOrders: (orders: OrderRecord[]) => void
  readCatalogue: () => PricingCatalogue
  now: () => Date
  newId: () => string
  /** Journals a new sale as a signed receipt, before the order is saved; its receipt number goes on the order. */
  journalSale: (order: OrderRecord) => NonNullable<OrderRecord['receipt']>
}

/** A checkout as the register sends it, minus the device check the route does first. */
export interface RegisterOrderInput {
  clientOrderId: string
  lines: CartLineInput[]
  serving: Serving
  /** The total the tablet showed staff. A mismatch means a price changed since, so nothing is sold until staff see the new total. */
  expectedTotal: number
  payment: Pick<OrderPayment, 'method' | 'provider' | 'reference'>
  /** Optional name to call out when the order is ready. Cleared after 7 days like any customer name. */
  customerName?: string
  /** The cash register (tablet) making the sale — see `server/register/registers.ts`. */
  registerNumber: number
  /** The signed-in staff member making the sale. */
  staffId?: string
  /** A cart already priced and *paid* through a payment provider (see `server/payments/intents.ts`). It's used as-is: the customer paid that amount, so a price edited meanwhile must not change it. */
  lockedCart?: PricedCart
}

/** `created: false` means the same `clientOrderId` was already sold, and that earlier order is returned. */
export type RegisterOrderResult = { ok: true; order: OrderRecord; created: boolean } | ({ ok: false } & PricingError) | { ok: false; reason: 'priceChanged'; totalPrice: number }

/** Longest accepted pickup name — the same order of size as the website's own name limit. */
const MAX_NAME_LENGTH = 60

/** Prices the cart, checks the total the tablet showed, and appends the paid order. */
export function createRegisterOrder(deps: RegisterOrderDeps, input: RegisterOrderInput): RegisterOrderResult {
  const existing = deps.readOrders()
  const previous = existing.find((order) => order.clientOrderId === input.clientOrderId)
  if (previous) return { ok: true, order: previous, created: false }

  const priced = input.lockedCart ? { ok: true as const, cart: input.lockedCart } : priceCart(input.lines, deps.readCatalogue(), input.serving)
  if (!priced.ok) return priced
  if (!input.lockedCart && priced.cart.totalPrice !== input.expectedTotal) return { ok: false, reason: 'priceChanged', totalPrice: priced.cart.totalPrice }

  const now = deps.now()
  const order: OrderRecord = {
    id: deps.newId(),
    source: 'register',
    clientOrderId: input.clientOrderId,
    items: priced.cart.items,
    totalPrice: priced.cart.totalPrice,
    customerName: (input.customerName ?? '').trim().slice(0, MAX_NAME_LENGTH),
    customerPhone: '',
    // Not an `HH:MM` time on purpose: a counter order has no agreed pickup time, and the board only
    // marks an order overdue when this parses as one.
    pickupTime: '',
    status: priced.cart.status,
    createdAt: now.toISOString(),
    displayNumber: nextDisplayNumber(existing, now),
    servedAtCounter: priced.cart.servedAtCounter,
    serving: input.serving,
    registerNumber: input.registerNumber,
    staffId: input.staffId,
    payment: { ...input.payment, amount: priced.cart.totalPrice, paidAt: now.toISOString() },
  }
  // The journal first: if it can't record the sale, the sale doesn't happen.
  order.receipt = deps.journalSale(order)
  deps.writeOrders([...existing, order])
  return { ok: true, order, created: true }
}
