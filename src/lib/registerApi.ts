/**
 * The Register page's client for the local server's register, payment and barcode routes (see
 * `server/register/routes.ts` and `server/payments/routes.ts`). Every call names the tablet by its
 * machine id (`?deviceId=` on the kiosk URL); the server decides what that tablet may do. Failures the
 * register must react to (a changed price, a locked register, an order that isn't ready) come back as
 * values; only a network failure or an unexpected server error rejects.
 */
import type { BarcodeLookupResult } from '../types/barcode'
import type { OrderRecord, PaymentMethod, PaymentProviderId } from '../types/order'
import type { Product } from '../types/product'
import type { CartLineInput, Serving } from './registerPricing'
import { serverBaseUrl } from './localServer'

/** A cart ready to sell. `clientOrderId` is the register's own id for this sale, so a retried Pay never sells twice. */
export interface RegisterCheckout {
  clientOrderId: string
  lines: CartLineInput[]
  serving: Serving
  /** The total shown to staff; the server refuses the sale if its own total differs. */
  expectedTotal: number
  customerName?: string
}

/** A refused sale. `priceChanged` carries the server's total; the others name the offending product. */
export type CheckoutRefusal = { reason: 'priceChanged'; totalPrice: number } | { reason: 'empty' | 'badQuantity' | 'unknownProduct' | 'noPrice' | 'soldOut'; productId?: string }

/** How a pickup scan went. */
export type PickupResult = { result: 'completed' | 'alreadyCompleted' | 'notReady' | 'cancelled'; order: OrderRecord } | { result: 'notFound' | 'invalid' | 'disabled' }

/** A payment in progress, as the server shows it to the tablet. */
export interface RegisterPaymentIntent {
  id: string
  provider: PaymentProviderId
  start: { kind: 'qr'; qrUrl: string } | { kind: 'device'; action: 'zettle-charge' }
  state: 'pending' | 'authorized' | 'captured' | 'failed' | 'cancelled' | 'expired'
  totalPrice: number
  /** Set once the payment went through and the order was created. */
  order?: OrderRecord
}

/** Sends a JSON request and returns the status and parsed body; rejects only on a network failure. */
async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<{ status: number; body: T }> {
  const response = await fetch(`${serverBaseUrl()}${path}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const parsed = (await response.json().catch(() => ({}))) as T
  return { status: response.status, body: parsed }
}

/** Throws the server's own message for a status the caller didn't expect. */
function unexpected(status: number, body: unknown): never {
  throw new Error((body as { error?: string })?.error ?? `The server answered ${status}`)
}

const query = (deviceId: string) => `deviceId=${encodeURIComponent(deviceId)}`

/** Whether a staff PIN is set, and which payment providers are live. */
export async function fetchRegisterConfig(deviceId: string): Promise<{ pinSet: boolean; providers: { id: PaymentProviderId; method: PaymentMethod }[] }> {
  const { status, body } = await call<{ pinSet: boolean; providers: { id: PaymentProviderId; method: PaymentMethod }[] }>('GET', `/register/config?${query(deviceId)}`)
  return status === 200 ? body : unexpected(status, body)
}

/** Sells `checkout`, recorded as paid by hand with `method`. */
export async function checkoutByHand(
  deviceId: string,
  checkout: RegisterCheckout,
  method: PaymentMethod,
): Promise<{ ok: true; order: OrderRecord } | ({ ok: false } & CheckoutRefusal)> {
  const { status, body } = await call<{ order?: OrderRecord } & Partial<CheckoutRefusal>>('POST', '/register/checkout', { deviceId, ...checkout, method })
  if ((status === 200 || status === 201) && body.order) return { ok: true, order: body.order }
  if (status === 409 || (status === 400 && body.reason)) return { ok: false, ...(body as CheckoutRefusal) }
  return unexpected(status, body)
}

/** Completes the website order a scanned pickup QR (or typed code) belongs to. `force` hands over an order that isn't ready yet. */
export async function scanPickup(deviceId: string, payload: string, force = false): Promise<PickupResult> {
  const { status, body } = await call<PickupResult>('POST', '/register/pickup', { deviceId, payload, force })
  if ('result' in body && body.result) return body
  return unexpected(status, body)
}

/** Looks a barcode up: our products, then the server's catalogue, then Open Food Facts. */
export async function lookupBarcode(deviceId: string, code: string): Promise<BarcodeLookupResult> {
  const { status, body } = await call<BarcodeLookupResult>('GET', `/register/barcodes/${encodeURIComponent(code)}?${query(deviceId)}`)
  return status === 200 || status === 400 ? body : unexpected(status, body)
}

/** Tries the staff PIN. */
export async function unlockRegister(
  deviceId: string,
  pin: string,
): Promise<{ ok: true; token: string; expiresAt: number } | { ok: false; reason: 'noPin' | 'wrongPin' | 'lockedOut'; retryAfterMs?: number }> {
  const { status, body } = await call<{ token?: string; expiresAt?: number; reason?: 'noPin' | 'wrongPin' | 'lockedOut'; retryAfterMs?: number }>('POST', '/register/unlock', {
    deviceId,
    pin,
  })
  if (status === 200 && body.token) return { ok: true, token: body.token, expiresAt: body.expiresAt ?? 0 }
  if (body.reason) return { ok: false, reason: body.reason, retryAfterMs: body.retryAfterMs }
  return unexpected(status, body)
}

/** Locks the register again at once. Best effort: the token expires by itself anyway. */
export function lockRegister(deviceId: string): Promise<void> {
  return call('POST', '/register/lock', { deviceId }).then(
    () => undefined,
    () => undefined,
  )
}

/** Adds or edits a product (the register must be unlocked). `locked` means the unlock expired. */
export async function saveRegisterProduct(deviceId: string, unlockToken: string, product: object): Promise<{ ok: true; product: Product } | { ok: false; reason: string }> {
  const { status, body } = await call<{ product?: Product; reason?: string }>('POST', '/register/products', { deviceId, unlockToken, product })
  if ((status === 200 || status === 201) && body.product) return { ok: true, product: body.product }
  if (body.reason) return { ok: false, reason: body.reason }
  return unexpected(status, body)
}

/** Uploads a product photo taken on the tablet; resolves to its URL. */
export async function uploadRegisterPhoto(deviceId: string, unlockToken: string, file: Blob): Promise<string> {
  const response = await fetch(`${serverBaseUrl()}/register/uploads?${query(deviceId)}&unlock=${encodeURIComponent(unlockToken)}`, { method: 'POST', body: file })
  const body = (await response.json().catch(() => ({}))) as { url?: string; error?: string }
  if (response.ok && body.url) return body.url
  return unexpected(response.status, body)
}

/** Starts a provider payment for `checkout`. */
export async function startPayment(
  deviceId: string,
  provider: PaymentProviderId,
  checkout: RegisterCheckout,
): Promise<{ ok: true; intent: RegisterPaymentIntent } | ({ ok: false } & CheckoutRefusal) | { ok: false; reason: 'unavailable'; error: string }> {
  const { status, body } = await call<{ intent?: RegisterPaymentIntent; error?: string } & Partial<CheckoutRefusal>>('POST', '/register/payments', {
    deviceId,
    provider,
    ...checkout,
  })
  if (status === 201 && body.intent) return { ok: true, intent: body.intent }
  if (status === 503) return { ok: false, reason: 'unavailable', error: body.error ?? '' }
  if (body.reason) return { ok: false, ...(body as CheckoutRefusal) }
  return unexpected(status, body)
}

/** The latest state of a payment in progress. */
export async function pollPayment(deviceId: string, id: string): Promise<RegisterPaymentIntent> {
  const { status, body } = await call<{ intent?: RegisterPaymentIntent; error?: string }>('GET', `/register/payments/${encodeURIComponent(id)}?${query(deviceId)}`)
  if (body.intent) return body.intent
  return unexpected(status, body)
}

/** Reports the outcome of a payment the tablet took itself (Zettle card reader). */
export async function reportDevicePayment(deviceId: string, id: string, ok: boolean): Promise<RegisterPaymentIntent> {
  const { status, body } = await call<{ intent?: RegisterPaymentIntent }>('POST', `/register/payments/${encodeURIComponent(id)}/device-result`, { deviceId, ok })
  return body.intent ?? unexpected(status, body)
}

/** Abandons a payment in progress. */
export async function cancelPayment(deviceId: string, id: string): Promise<void> {
  await call('POST', `/register/payments/${encodeURIComponent(id)}/cancel`, { deviceId })
}

/** Why the drawer didn't open: locked (manual without a live PIN unlock), a sale that may not open it, no printer, or the printer failed. */
export type DrawerRefusal = 'locked' | 'unknownOrder' | 'notCash' | 'tooLate' | 'alreadyOpened' | 'noPrinter' | 'printerFailed'

/**
 * Opens the cash drawer (`POST /register/drawer`). `via: 'device'` means the tablet's own USB printer
 * holds the drawer: the server authorised and logged it, and the caller sends the pulse itself.
 */
export async function openCashDrawer(
  deviceId: string,
  request: { reason: 'sale'; orderId: string; printerId: string } | { reason: 'manual'; unlockToken: string; printerId: string },
): Promise<{ ok: true; via: 'server' | 'device' } | { ok: false; reason: DrawerRefusal }> {
  const { status, body } = await call<{ ok?: boolean; via?: 'server' | 'device'; reason?: DrawerRefusal }>('POST', '/register/drawer', { deviceId, ...request })
  if (status === 200 && body.via) return { ok: true, via: body.via }
  if (body.reason) return { ok: false, reason: body.reason }
  return unexpected(status, body)
}
