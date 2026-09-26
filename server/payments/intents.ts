/**
 * Payments in progress at the register. Starting a provider payment prices the cart once and keeps
 * that priced cart here with the payment's reference; only when the provider says the customer paid
 * is the order created (through `onPaid`, exactly once per intent), so the kitchen never sees an
 * unpaid order and the order always carries the amount actually paid.
 *
 * In memory only: an intent is minutes long, and after a server restart the tablet simply starts the
 * payment again. The provider's own reference is the intent id, so it can still be found there.
 */
import { randomUUID } from 'node:crypto'
import type { OrderRecord } from '../../src/types/order'
import type { RegisterOrderInput } from '../register/orders'
import type { PricedCart } from '../../src/lib/registerPricing'
import { isFinal, isPaid, type PaymentProvider, type PaymentStart, type PaymentState } from './types'

/** An intent is forgotten this long after it started. */
export const INTENT_TTL_MS = 30 * 60_000

/** One payment in progress. */
export interface PaymentIntent {
  id: string
  deviceId: string
  providerId: PaymentProvider['id']
  /** The checkout as the tablet sent it, re-used unchanged to create the order once paid. */
  checkout: Omit<RegisterOrderInput, 'payment' | 'lockedCart' | 'registerNumber'>
  cart: PricedCart
  start: PaymentStart
  state: PaymentState
  /** Set once the order exists. */
  order?: OrderRecord
  createdAt: number
}

/** Tracks intents and turns a paid one into an order. */
export class PaymentIntents {
  private intents = new Map<string, PaymentIntent>()
  private readonly now: () => number

  constructor(now: () => number = Date.now) {
    this.now = now
  }

  private sweep(): void {
    for (const [id, intent] of this.intents) if (this.now() - intent.createdAt > INTENT_TTL_MS) this.intents.delete(id)
  }

  /** Starts a payment for an already priced cart. The provider's errors (e.g. "not configured") propagate to the caller. */
  async start(provider: PaymentProvider, deviceId: string, checkout: PaymentIntent['checkout'], cart: PricedCart, description: string): Promise<PaymentIntent> {
    this.sweep()
    const id = randomUUID()
    const start = await provider.start({ reference: id, amountMinor: Math.round(cart.totalPrice * 100), currency: 'NOK', description })
    const intent: PaymentIntent = { id, deviceId, providerId: provider.id, checkout, cart, start, state: 'pending', createdAt: this.now() }
    this.intents.set(id, intent)
    return intent
  }

  /** Whether `deviceId` has a payment still in progress — a Z report waits until it's settled. */
  hasPending(deviceId: string): boolean {
    this.sweep()
    return [...this.intents.values()].some((intent) => intent.deviceId === deviceId && !isFinal(intent.state))
  }

  /** The intent `id`, but only for the tablet that started it. */
  get(id: string, deviceId: string): PaymentIntent | undefined {
    this.sweep()
    const intent = this.intents.get(id)
    return intent && intent.deviceId === deviceId ? intent : undefined
  }

  /**
   * Records a new state for `intent`. The first time it's paid, `onPaid` creates the order (with the
   * intent's locked cart) and the order is kept on the intent, so a repeated poll or device report
   * never creates a second one. A final state never changes again.
   */
  settle(intent: PaymentIntent, state: PaymentState, onPaid: (intent: PaymentIntent) => OrderRecord | undefined): PaymentIntent {
    if (isFinal(intent.state)) return intent
    intent.state = state
    if (isPaid(state) && !intent.order) intent.order = onPaid(intent)
    return intent
  }
}
