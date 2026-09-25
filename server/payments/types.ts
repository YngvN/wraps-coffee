/**
 * The one interface every payment integration implements, so the Register's Pay step talks to
 * "a provider" and never to Zettle or Vipps directly. Both adapters are scaffolding for now (see
 * their own headers): nothing here takes real money until a merchant account exists and every TODO
 * in the adapter has been confirmed against the provider's own documentation.
 */
import type { PaymentMethod, PaymentProviderId } from '../../src/types/order'

/** A payment the register wants taken, in the provider's own units. */
export interface PaymentRequest {
  /** Our unique reference for this payment — the intent id; providers use it to look the payment up. */
  reference: string
  /** In minor units (øre). */
  amountMinor: number
  currency: 'NOK'
  /** Short text the customer sees in their app or on the reader, e.g. "Wraps Coffee K12". */
  description: string
}

/**
 * How the register continues once a payment is started:
 * - `qr` — show this URL as a QR code for the customer to scan (Vipps' one-time payment QR);
 * - `device` — the tablet itself takes the payment through a native SDK (Zettle's card reader), then
 *   reports the outcome back.
 */
export type PaymentStart = { kind: 'qr'; qrUrl: string } | { kind: 'device'; action: 'zettle-charge' }

/** A payment's state, normalised across providers. `authorized` and `captured` both count as paid. */
export type PaymentState = 'pending' | 'authorized' | 'captured' | 'failed' | 'cancelled' | 'expired'

/** The providers the register may use right now: configured by the admin, and finished enough to take real payments. */
export function offeredProviders(providers: PaymentProvider[]): PaymentProvider[] {
  return providers.filter((provider) => provider.live && provider.isConfigured())
}

/** Whether `state` means the customer has paid. */
export function isPaid(state: PaymentState): boolean {
  return state === 'authorized' || state === 'captured'
}

/** Whether `state` is final and the register should stop waiting. */
export function isFinal(state: PaymentState): boolean {
  return state !== 'pending'
}

/** One payment integration. Every method throws until the integration is really configured. */
export interface PaymentProvider {
  id: PaymentProviderId
  /** The `PaymentMethod` recorded on an order this provider took. */
  method: PaymentMethod
  /** Whether the admin has entered credentials for it (Integrations page). */
  isConfigured: () => boolean
  /**
   * Whether the integration is finished and can take real payments. Both adapters are scaffolding, so
   * `false` until each one's TODOs are resolved: saved credentials alone must not replace the register's
   * hand-recorded "Paid by card/Vipps" buttons with a flow that can only fail. A provider is offered
   * only when it is both configured and live (see `offeredProviders`).
   */
  live: boolean
  start: (request: PaymentRequest) => Promise<PaymentStart>
  status: (reference: string) => Promise<PaymentState>
  cancel: (reference: string) => Promise<void>
  refund: (reference: string, amountMinor: number) => Promise<void>
}
