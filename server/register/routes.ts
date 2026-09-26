/**
 * HTTP routes for a Register pane on an approved tablet. Kept out of `server/index.ts`, which only
 * calls `handleRegisterRoute` and supplies store access as dependencies.
 *
 * Trust: the kiosk page is never logged in, so every route first checks the tablet — an approved
 * machine whose current screen has a Register pane (`deviceMayUseRegister`), the same LAN-trust
 * posture as `POST /display-orders/status`. Anything that changes something also needs the signed-in
 * staff member's session token (`sessionToken` in the body, or the `session` query parameter for the
 * photo upload, whose body is the image) — see `access.ts` and `signInRoutes.ts`. Changing products
 * needs a manager.
 *
 * - `GET  /register/config?deviceId=`        — how many staff can sign in, which payment providers are live, and this tablet's cash register number and name;
 * - `POST /register/checkout`                — a sale paid by hand (card/cash/Vipps) → the order, journaled as a signed sale;
 * - `POST /register/pickup`                  — a scanned pickup QR or typed code completes a website order;
 * - `GET  /register/barcodes/:code?deviceId=` — barcode lookup (products → catalogue → Open Food Facts);
 * - `POST /register/products`                — add or edit one product (manager);
 * - `POST /register/uploads?deviceId=&session=` — a product photo from the tablet (manager).
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
import { checkDevice, requireSession, type RegisterAccess } from './access'
import type { StaffMember } from './staff'
import type { StaffSession } from './sessions'
import { priceCart } from '../../src/lib/registerPricing'

/** What the routes need from the server around them. */
export interface RegisterRouteDeps extends RegisterAccess {
  /** Whether the tablet's Register pane has pickup scanning on (`allowPickupScan`, default on). */
  deviceMayScanPickups: (deviceId: string) => boolean
  orders: RegisterOrderDeps
  readWebsiteOrders: () => OrderRecord[]
  /** Sets one website order to `completed` through `setOrderStatus`. Resolves `false` if it vanished. */
  completeWebsiteOrder: (orderId: string) => Promise<boolean>
  readProducts: () => Product[]
  readCatalogues: () => Catalogue[]
  /** Saves the product list; `actor` (the staff id) is journaled with any price change. */
  writeProducts: (products: Product[], actor: string) => void
  readStaff: () => StaffMember[]
  /** Whether the company details receipts need are complete; nothing is sold until they are. */
  legalReady: () => boolean
  /** Whether the drawer on the tablet's printer (`printerId`, see `drawerPrinter`) reports being open. */
  drawerIsOpen: (printerId: unknown) => Promise<boolean>
  /** Whether `register` is in training mode (then a sale is a practice sale, see `training.ts`). */
  isTraining: (register: number) => boolean
  /** Journals and prints a practice sale of `order` (priced, never saved) and answers the request. */
  trainingCheckout: (res: ServerResponse, session: StaffSession, order: OrderRecord, printerId: unknown) => Promise<void>
  /** Whether `register` still needs its opening float counted this period. */
  floatNeeded: (register: number) => boolean
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

/** Handles the request if it's one of this module's routes; returns `false` to let `server/index.ts` carry on otherwise. */
export function handleRegisterRoute(req: IncomingMessage, res: ServerResponse, url: URL, host: string, deps: RegisterRouteDeps): boolean {
  const path = url.pathname
  if (!path.startsWith('/register/')) return false

  if (req.method === 'GET' && path === '/register/config') {
    const deviceId = url.searchParams.get('deviceId')
    if (checkDevice(res, deps, deviceId)) {
      const { number, name } = deps.cashRegister(deviceId)
      const staffCount = deps.readStaff().filter((member) => member.active && member.pin).length
      sendJson(res, 200, {
        staffCount,
        legalReady: deps.legalReady(),
        floatNeeded: deps.floatNeeded(number),
        training: deps.isTraining(number),
        providers: deps.offeredProviders(),
        register: { number, name },
      })
    }
    return true
  }

  if (req.method === 'POST' && path === '/register/checkout') {
    withJsonBody(req, res, async (body) => {
      if (!checkDevice(res, deps, body.deviceId)) return
      const session = requireSession(res, deps, body.deviceId, body.sessionToken)
      if (!session) return
      if (!deps.legalReady()) return sendJson(res, 409, { ok: false, reason: 'legalDetailsMissing' })
      // kassasystemforskrifta § 2-6: no sale while an integrated drawer is open.
      if (await deps.drawerIsOpen(body.printerId)) return sendJson(res, 409, { ok: false, reason: 'drawerOpen' })
      const checkout = parseCheckout(body)
      const method = body.method as PaymentMethod
      if (!checkout || !MANUAL_METHODS.includes(method)) return sendJson(res, 400, { error: 'Expected a cart, a total and a payment method' })
      if (deps.isTraining(session.register)) {
        const priced = priceCart(checkout.lines, deps.orders.readCatalogue(), checkout.serving)
        if (!priced.ok) return sendJson(res, 400, priced)
        if (priced.cart.totalPrice !== checkout.expectedTotal) return sendJson(res, 409, { ok: false, reason: 'priceChanged', totalPrice: priced.cart.totalPrice })
        const now = new Date().toISOString()
        const practice = {
          id: '',
          source: 'register',
          items: priced.cart.items,
          totalPrice: priced.cart.totalPrice,
          customerName: '',
          customerPhone: '',
          pickupTime: '',
          status: 'completed',
          createdAt: now,
          serving: checkout.serving,
          registerNumber: session.register,
          staffId: session.staffId,
          payment: { method, amount: priced.cart.totalPrice, paidAt: now },
        } satisfies OrderRecord
        return deps.trainingCheckout(res, session, practice, body.printerId)
      }
      const result = createRegisterOrder(deps.orders, { ...checkout, payment: { method }, registerNumber: session.register, staffId: session.staffId })
      if (result.ok) {
        if (result.created) {
          console.log(`[register] ${body.deviceId} sold ${result.order.displayNumber} (${result.order.totalPrice} kr, ${method}) by ${session.name}`)
        }
        return sendJson(res, result.created ? 201 : 200, { order: result.order })
      }
      sendJson(res, result.reason === 'priceChanged' ? 409 : 400, result)
    })
    return true
  }

  if (req.method === 'POST' && path === '/register/pickup') {
    withJsonBody(req, res, async (body) => {
      if (!checkDevice(res, deps, body.deviceId) || !requireSession(res, deps, body.deviceId, body.sessionToken)) return
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

  if (req.method === 'POST' && path === '/register/products') {
    withJsonBody(req, res, (body) => {
      if (!checkDevice(res, deps, body.deviceId)) return
      const session = requireSession(res, deps, body.deviceId, body.sessionToken, 'manager')
      if (!session) return
      const input = body.product as RegisterProductInput | undefined
      if (!input || typeof input !== 'object') return sendJson(res, 400, { error: 'Expected a product' })
      const result = upsertRegisterProduct(deps.readProducts(), deps.readCatalogues(), input, deps.newId)
      if (!result.ok) return sendJson(res, 400, { reason: result.reason })
      deps.writeProducts(result.products, session.staffId)
      if (result.product.barcode) deps.linkBarcode(result.product)
      console.log(`[register] ${body.deviceId} ${input.itemID ? 'edited' : 'added'} product ${result.product.itemID}`)
      sendJson(res, input.itemID ? 200 : 201, { product: result.product })
    })
    return true
  }

  if (req.method === 'POST' && path === '/register/uploads') {
    const deviceId = url.searchParams.get('deviceId')
    if (checkDevice(res, deps, deviceId) && requireSession(res, deps, deviceId, stringField(url.searchParams.get('session')), 'manager'))
      deps.handleUpload(req, res, host).catch((error: unknown) => {
        console.error('[register] photo upload failed:', error)
        if (!res.headersSent) sendJson(res, 500, { error: 'The photo could not be saved' })
      })
    return true
  }

  return false
}
