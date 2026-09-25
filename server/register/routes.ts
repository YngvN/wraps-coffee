/**
 * HTTP routes for a Register pane on an approved tablet. Kept out of `server/index.ts`, which only
 * calls `handleRegisterRoute` and supplies store access as dependencies.
 *
 * Trust: the kiosk page is never logged in, so every route first checks the tablet — an approved
 * machine whose current screen has a Register pane (`deviceMayUseRegister`), the same LAN-trust
 * posture as `POST /display-orders/status`. Routes that change products also need an unlock token
 * from the staff PIN (`server/register/unlock.ts`), sent as `unlockToken` in the body (or the
 * `unlock` query parameter for the photo upload, whose body is the image).
 *
 * - `GET  /register/config?deviceId=`        — whether a PIN is set, and which payment providers are live;
 * - `POST /register/checkout`                — a sale paid by hand (card/cash/Vipps) → the order;
 * - `POST /register/pickup`                  — a scanned pickup QR or typed code completes a website order;
 * - `GET  /register/barcodes/:code?deviceId=` — barcode lookup (products → catalogue → Open Food Facts);
 * - `POST /register/unlock`, `/register/lock` — the staff PIN lock;
 * - `POST /register/products`                — add or edit one product (unlocked);
 * - `POST /register/uploads?deviceId=&unlock=` — a product photo from the tablet (unlocked).
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { BarcodeLookupResult } from '../../src/types/barcode'
import type { Catalogue } from '../../src/types/category'
import type { OrderRecord, PaymentMethod } from '../../src/types/order'
import type { Product } from '../../src/types/product'
import { parsePickupRequest } from '../../src/lib/pickupCode'
import { sendJson } from '../http'
import { createRegisterOrder, type RegisterOrderDeps } from './orders'
import { decidePickup, findPickupOrder } from './pickup'
import { parseCheckout } from './checkoutInput'
import { upsertRegisterProduct, type RegisterProductInput } from './products'
import { stringField, withJsonBody } from './routeHelpers'
import type { UnlockManager, PinRecord } from './unlock'

/** What the routes need from the server around them. */
export interface RegisterRouteDeps {
  deviceMayUseRegister: (deviceId: string) => boolean
  /** Whether the tablet's Register pane has pickup scanning on (`allowPickupScan`, default on). */
  deviceMayScanPickups: (deviceId: string) => boolean
  orders: RegisterOrderDeps
  readWebsiteOrders: () => OrderRecord[]
  /** Sets one website order to `completed` through `setOrderStatus`. Resolves `false` if it vanished. */
  completeWebsiteOrder: (orderId: string) => Promise<boolean>
  readProducts: () => Product[]
  readCatalogues: () => Catalogue[]
  writeProducts: (products: Product[]) => void
  unlock: UnlockManager
  readPin: () => PinRecord | null
  lookupBarcode: (code: string, host: string) => Promise<BarcodeLookupResult>
  /** Links a barcode's catalogue entry to the product it was confirmed as (creating a staff entry when there was none). */
  linkBarcode: (product: Product) => void
  /** `handleUpload` from `server/uploads.ts`. */
  handleUpload: (req: IncomingMessage, res: ServerResponse, host: string) => Promise<void>
  /** Providers the register may use: configured and live (`offeredProviders`). */
  offeredProviders: () => { id: string; method: PaymentMethod }[]
  newId: () => string
}

const MANUAL_METHODS: readonly PaymentMethod[] = ['card', 'cash', 'vipps']

/** 403s and returns `false` unless `deviceId` is an approved tablet showing a Register. */
function checkDevice(res: ServerResponse, deps: RegisterRouteDeps, deviceId: unknown): deviceId is string {
  if (typeof deviceId === 'string' && deps.deviceMayUseRegister(deviceId)) return true
  sendJson(res, 403, { error: 'This display is not allowed to use the register' })
  return false
}

/** 401s and returns `false` unless `token` is this tablet's live unlock token. */
function checkUnlocked(res: ServerResponse, deps: RegisterRouteDeps, deviceId: string, token: unknown): boolean {
  if (deps.unlock.check(deviceId, token)) return true
  sendJson(res, 401, { error: 'The register is locked', reason: 'locked' })
  return false
}

/** Handles the request if it's one of this module's routes; returns `false` to let `server/index.ts` carry on otherwise. */
export function handleRegisterRoute(req: IncomingMessage, res: ServerResponse, url: URL, host: string, deps: RegisterRouteDeps): boolean {
  const path = url.pathname
  if (!path.startsWith('/register/')) return false

  if (req.method === 'GET' && path === '/register/config') {
    if (checkDevice(res, deps, url.searchParams.get('deviceId'))) sendJson(res, 200, { pinSet: deps.readPin() !== null, providers: deps.offeredProviders() })
    return true
  }

  if (req.method === 'POST' && path === '/register/checkout') {
    withJsonBody(req, res, (body) => {
      if (!checkDevice(res, deps, body.deviceId)) return
      const checkout = parseCheckout(body)
      const method = body.method as PaymentMethod
      if (!checkout || !MANUAL_METHODS.includes(method)) return sendJson(res, 400, { error: 'Expected a cart, a total and a payment method' })
      const result = createRegisterOrder(deps.orders, { ...checkout, payment: { method } })
      if (result.ok) {
        if (result.created) console.log(`[register] ${body.deviceId} sold ${result.order.displayNumber} (${result.order.totalPrice} kr, ${method})`)
        return sendJson(res, result.created ? 201 : 200, { order: result.order })
      }
      sendJson(res, result.reason === 'priceChanged' ? 409 : 400, result)
    })
    return true
  }

  if (req.method === 'POST' && path === '/register/pickup') {
    withJsonBody(req, res, async (body) => {
      if (!checkDevice(res, deps, body.deviceId)) return
      if (!deps.deviceMayScanPickups(body.deviceId)) return sendJson(res, 403, { result: 'disabled' })
      const request = typeof body.payload === 'string' ? parsePickupRequest(body.payload) : null
      if (!request) return sendJson(res, 400, { result: 'invalid' })
      const order = findPickupOrder(deps.readWebsiteOrders(), request)
      if (!order) return sendJson(res, 404, { result: 'notFound' })
      const decision = decidePickup(order, body.force === true)
      if (decision.action === 'cancelled') return sendJson(res, 409, { result: 'cancelled', order })
      if (decision.action === 'alreadyCompleted') return sendJson(res, 200, { result: 'alreadyCompleted', order })
      if (decision.action === 'confirmNotReady') return sendJson(res, 409, { result: 'notReady', order })
      if (!(await deps.completeWebsiteOrder(order.id))) return sendJson(res, 404, { result: 'notFound' })
      console.log(`[register] ${body.deviceId} handed over website order ${order.id}`)
      sendJson(res, 200, { result: 'completed', order: { ...order, status: 'completed' } })
    })
    return true
  }

  const barcodeMatch = /^\/register\/barcodes\/([^/]+)$/.exec(path)
  if (req.method === 'GET' && barcodeMatch) {
    if (!checkDevice(res, deps, url.searchParams.get('deviceId'))) return true
    deps
      .lookupBarcode(decodeURIComponent(barcodeMatch[1]), host)
      .then((result) => sendJson(res, result.kind === 'invalid' ? 400 : 200, result))
      .catch((error: unknown) => sendJson(res, 500, { error: error instanceof Error ? error.message : 'Lookup failed' }))
    return true
  }

  if (req.method === 'POST' && path === '/register/unlock') {
    withJsonBody(req, res, (body) => {
      if (!checkDevice(res, deps, body.deviceId)) return
      const result = deps.unlock.attempt(body.deviceId, typeof body.pin === 'string' ? body.pin : '', deps.readPin())
      if (result.ok) return sendJson(res, 200, { token: result.token, expiresAt: result.expiresAt })
      const status = result.reason === 'noPin' ? 409 : result.reason === 'lockedOut' ? 429 : 401
      sendJson(res, status, { reason: result.reason, retryAfterMs: result.retryAfterMs })
    })
    return true
  }

  if (req.method === 'POST' && path === '/register/lock') {
    withJsonBody(req, res, (body) => {
      if (!checkDevice(res, deps, body.deviceId)) return
      deps.unlock.lock(body.deviceId)
      sendJson(res, 200, { ok: true })
    })
    return true
  }

  if (req.method === 'POST' && path === '/register/products') {
    withJsonBody(req, res, (body) => {
      if (!checkDevice(res, deps, body.deviceId) || !checkUnlocked(res, deps, body.deviceId, body.unlockToken)) return
      const input = body.product as RegisterProductInput | undefined
      if (!input || typeof input !== 'object') return sendJson(res, 400, { error: 'Expected a product' })
      const result = upsertRegisterProduct(deps.readProducts(), deps.readCatalogues(), input, deps.newId)
      if (!result.ok) return sendJson(res, 400, { reason: result.reason })
      deps.writeProducts(result.products)
      if (result.product.barcode) deps.linkBarcode(result.product)
      console.log(`[register] ${body.deviceId} ${input.itemID ? 'edited' : 'added'} product ${result.product.itemID}`)
      sendJson(res, input.itemID ? 200 : 201, { product: result.product })
    })
    return true
  }

  if (req.method === 'POST' && path === '/register/uploads') {
    const deviceId = url.searchParams.get('deviceId')
    if (checkDevice(res, deps, deviceId) && checkUnlocked(res, deps, deviceId, stringField(url.searchParams.get('unlock'))))
      deps.handleUpload(req, res, host).catch((error: unknown) => {
        console.error('[register] photo upload failed:', error)
        if (!res.headersSent) sendJson(res, 500, { error: 'The photo could not be saved' })
      })
    return true
  }

  return false
}
