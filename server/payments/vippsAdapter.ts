/**
 * Vipps MobilePay ePayment API — scaffolding, no live payments yet.
 *
 * The register would take Vipps with a one-time QR shown on the tablet (`userFlow: 'QR'`, which
 * requires `customerInteraction: 'CUSTOMER_PRESENT'`): the customer scans it in the Vipps app and
 * approves. Server-side REST only — no SDK and no Companion change.
 *
 * Confirmed from developer.vippsmobilepay.com on 2026-09-25:
 * - create: `POST /epayment/v1/payments`; status: `GET /epayment/v1/payments/{reference}`;
 *   `POST /epayment/v1/payments/{reference}/capture`, `/cancel`, `/refund`;
 * - test base URL `https://apitest.vipps.no`;
 * - headers `Authorization: Bearer <token>`, `Ocp-Apim-Subscription-Key`, `Merchant-Serial-Number`,
 *   `Idempotency-Key`, optional `Vipps-System-Name`/`-Version`/`-Plugin-Name`/`-Plugin-Version`;
 * - `amount: { value, currency }` with `value` in øre; `paymentMethod.type: 'WALLET'`;
 * - states `CREATED`, `AUTHORIZED`, `ABORTED`, `EXPIRED`, `TERMINATED`.
 *
 * TODO (not confirmed — do not fill in from memory):
 * - the access-token endpoint and its headers (their Access Token API page);
 * - the production base URL;
 * - which response field carries the QR for `userFlow: 'QR'` (`redirectUrl` is confirmed for the
 *   redirect flows only), and `qrFormat` options;
 * - capture timing for in-person sales, and webhook registration (Webhooks API).
 */
import type { PaymentProvider, PaymentRequest, PaymentState } from './types'
import type { VippsCredentials } from './credentials'

/** Merchant Test (MT) environment — confirmed. */
const VIPPS_BASE_URL_DEVELOPMENT = 'https://apitest.vipps.no'
/** TODO: confirm the production host in Vipps MobilePay's own docs before going live. */
const VIPPS_BASE_URL_PRODUCTION = ''

/** The base URL for these credentials' chosen environment. */
export function vippsBaseUrl(credentials: VippsCredentials): string {
  return credentials.useDevelopmentEnvironment ? VIPPS_BASE_URL_DEVELOPMENT : VIPPS_BASE_URL_PRODUCTION
}

/** Whether every key the API needs has been entered. */
export function vippsConfigured(credentials: VippsCredentials): boolean {
  return Boolean(credentials.clientId && credentials.clientSecret && credentials.subscriptionKey && credentials.merchantSerialNumber)
}

/** The create-payment body for an in-person QR payment, from the confirmed fields above. */
export function buildCreatePaymentBody(request: PaymentRequest) {
  return {
    amount: { value: request.amountMinor, currency: request.currency },
    paymentMethod: { type: 'WALLET' },
    reference: request.reference,
    userFlow: 'QR',
    customerInteraction: 'CUSTOMER_PRESENT',
    paymentDescription: request.description,
  }
}

/** Maps a Vipps payment state onto ours. `TERMINATED` is a merchant cancel; anything unrecognised stays pending. */
export function mapVippsState(state: string): PaymentState {
  switch (state) {
    case 'CREATED':
      return 'pending'
    case 'AUTHORIZED':
      return 'authorized'
    case 'ABORTED':
      return 'cancelled'
    case 'EXPIRED':
      return 'expired'
    case 'TERMINATED':
      return 'cancelled'
    default:
      return 'pending'
  }
}

/** Throws the "not yet" error every call gives until the TODOs above are resolved. */
function notYet(credentials: VippsCredentials, what: string): never {
  if (!vippsConfigured(credentials)) throw new Error('Vipps MobilePay is not configured — add its API keys on the Integrations page')
  throw new Error(
    `Vipps MobilePay ${what} is not implemented yet — pending a merchant agreement and confirmed API details (base URL: ${vippsBaseUrl(credentials) || 'production, unconfirmed'})`,
  )
}

/** The Vipps provider, bound to a way of reading the current credentials. */
export function createVippsProvider(readCredentials: () => VippsCredentials): PaymentProvider {
  return {
    id: 'vipps',
    method: 'vipps',
    isConfigured: () => vippsConfigured(readCredentials()),
    // TODO: set to `true` once every TODO in this file is resolved and tested in the MT environment.
    live: false,
    // TODO: fetch an access token, then POST `buildCreatePaymentBody(request)` to
    // `${base}/epayment/v1/payments` with the confirmed headers and `Idempotency-Key: request.reference`,
    // and return the QR URL from the (unconfirmed) response field.
    start: async () => notYet(readCredentials(), 'payment start'),
    // TODO: GET `${base}/epayment/v1/payments/${reference}` and `mapVippsState(body.state)`.
    status: async () => notYet(readCredentials(), 'status check'),
    // TODO: POST `${base}/epayment/v1/payments/${reference}/cancel`.
    cancel: async () => notYet(readCredentials(), 'cancel'),
    // TODO: POST `${base}/epayment/v1/payments/${reference}/refund` with `{ modificationAmount: … }` — body shape unconfirmed.
    refund: async () => notYet(readCredentials(), 'refund'),
  }
}
