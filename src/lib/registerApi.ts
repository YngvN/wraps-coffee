/**
 * The Register page's client for the local server's register, payment and barcode routes (see
 * `server/register/routes.ts` and `server/payments/routes.ts`). Every call names the tablet by its
 * machine id (`?deviceId=` on the kiosk URL); the server decides what that tablet may do, and who is
 * signed in (the session token is added by `registerHttp.ts`; signing in is `registerSessionApi.ts`).
 * Failures the register must react to (a changed price, nobody signed in, an order that isn't ready)
 * come back as values; only a network failure or an unexpected server error rejects.
 */
import type { BarcodeLookupResult } from '../types/barcode'
import type { OrderRecord, PaymentMethod, PaymentProviderId } from '../types/order'
import type { Product } from '../types/product'
import type { CartLineInput, Serving } from './registerPricing'
import { serverBaseUrl } from './localServer'
import { call, notifyRegisterSignedOut, query, registerSessionToken, unexpected } from './registerHttp'

/** A cart ready to sell. `clientOrderId` is the register's own id for this sale, so a retried Pay never sells twice. */
export interface RegisterCheckout {
  clientOrderId: string
  lines: CartLineInput[]
  serving: Serving
  /** The total shown to staff; the server refuses the sale if its own total differs. */
  expectedTotal: number
  customerName?: string
  /** The tablet's printer, whose cash drawer must not be open when the sale is recorded. */
  printerId?: string
}

/** A refused sale. `priceChanged` carries the server's total; the others name the offending product. */
export type CheckoutRefusal =
  | { reason: 'priceChanged'; totalPrice: number }
  | { reason: 'empty' | 'badQuantity' | 'unknownProduct' | 'noPrice' | 'soldOut'; productId?: string }
  | { reason: 'legalDetailsMissing' | 'drawerOpen' | 'training'; productId?: undefined }

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


/** What `GET /register/config` tells a register tablet. */
export interface RegisterConfig {
  /** How many staff members can sign in (active, with a PIN). */
  staffCount: number
  /** Whether Settings → Store → Company details is complete; nothing can be sold or printed until it is. */
  legalReady: boolean
  /** Whether this register still needs its opening float counted this period (after the last Z report). */
  floatNeeded: boolean
  /** Whether this register is in training mode: sales are practice sales, printed as training receipts. */
  training: boolean
  providers: { id: PaymentProviderId; method: PaymentMethod }[]
  /** This tablet's cash register: its fixed number (printed on receipts) and its name. */
  register: { number: number; name: string }
}

/** How many staff can sign in, which payment providers are live, and which cash register this tablet is. */
export async function fetchRegisterConfig(deviceId: string): Promise<RegisterConfig> {
  const { status, body } = await call<RegisterConfig>('GET', `/register/config?${query(deviceId)}`)
  return status === 200 ? body : unexpected(status, body)
}

/** A practice sale in training mode: saved nowhere, its training receipt already printed (`via: 'server'`) or handed back for this tablet's USB printer (`data`). */
export interface TrainingPrint {
  via?: 'server' | 'device'
  data?: string
}

/** Sells `checkout`, recorded as paid by hand with `method` (a practice sale while the register is in training mode). */
export async function checkoutByHand(
  deviceId: string,
  checkout: RegisterCheckout,
  method: PaymentMethod,
): Promise<{ ok: true; order: OrderRecord; training?: TrainingPrint } | ({ ok: false } & CheckoutRefusal)> {
  const { status, body } = await call<{ order?: OrderRecord; training?: boolean; via?: 'server' | 'device'; data?: string } & Partial<CheckoutRefusal>>('POST', '/register/checkout', {
    deviceId,
    ...checkout,
    method,
  })
  if ((status === 200 || status === 201) && body.order) return { ok: true, order: body.order, training: body.training ? { via: body.via, data: body.data } : undefined }
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

/** Adds or edits a product (a manager must be signed in). `signedOut`/`managerOnly` mean that's no longer so. */
export async function saveRegisterProduct(deviceId: string, product: object): Promise<{ ok: true; product: Product } | { ok: false; reason: string }> {
  const { status, body } = await call<{ product?: Product; reason?: string }>('POST', '/register/products', { deviceId, product })
  if ((status === 200 || status === 201) && body.product) return { ok: true, product: body.product }
  if (body.reason) return { ok: false, reason: body.reason }
  return unexpected(status, body)
}

/** Uploads a product photo taken on the tablet (a manager must be signed in); resolves to its URL. */
export async function uploadRegisterPhoto(deviceId: string, file: Blob): Promise<string> {
  const session = encodeURIComponent(registerSessionToken() ?? '')
  const response = await fetch(`${serverBaseUrl()}/register/uploads?${query(deviceId)}&session=${session}`, { method: 'POST', body: file })
  const body = (await response.json().catch(() => ({}))) as { url?: string; error?: string; reason?: string }
  if (response.status === 401 && body.reason === 'signedOut') notifyRegisterSignedOut()
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

/** Why the drawer didn't open: nobody signed in, a sale that may not open it, no printer, or the printer failed. */
export type DrawerRefusal = 'signedOut' | 'unknownOrder' | 'notCash' | 'tooLate' | 'alreadyOpened' | 'noPrinter' | 'printerFailed'

/**
 * Opens the cash drawer (`POST /register/drawer`). `via: 'device'` means the tablet's own USB printer
 * holds the drawer: the server authorised and logged it, and the caller sends the pulse itself.
 */
export async function openCashDrawer(
  deviceId: string,
  request: { reason: 'sale'; orderId: string; printerId: string } | { reason: 'return'; orderId: string; returnNumber: number; printerId: string } | { reason: 'manual'; printerId: string },
): Promise<{ ok: true; via: 'server' | 'device' } | { ok: false; reason: DrawerRefusal }> {
  const { status, body } = await call<{ ok?: boolean; via?: 'server' | 'device'; reason?: DrawerRefusal }>('POST', '/register/drawer', { deviceId, ...request })
  if (status === 200 && body.via) return { ok: true, via: body.via }
  if (body.reason) return { ok: false, reason: body.reason }
  return unexpected(status, body)
}

/** A cart change the journal must record — see `server/register/cartEventRoutes.ts`. */
export type CartJournalEvent =
  | { kind: 'lineCorrection'; correction: 'removed' | 'decreased'; lines: { productId: string; quantity: number }[]; serving: Serving }
  | { kind: 'void'; lines: { productId: string; quantity: number }[]; serving: Serving }

/**
 * Tells the journal about a cart change before payment: a line taken out or lowered, or a cart with
 * items cleared (see `cartJournalEvent`). Best effort: a lost event never blocks the cart.
 */
export async function sendCartEvent(deviceId: string, event: CartJournalEvent): Promise<void> {
  await call('POST', '/register/cart-events', { deviceId, ...event }).catch(() => undefined)
}
