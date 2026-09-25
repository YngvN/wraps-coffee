/**
 * HTTP routes for taking a register payment through a provider, and for the providers' credentials.
 *
 * Register side (same tablet trust as `server/register/routes.ts`):
 * - `POST /register/payments`                    — price the cart and start a provider payment;
 * - `GET  /register/payments/:id?deviceId=`      — poll it (asks the provider while pending);
 * - `POST /register/payments/:id/device-result`  — the tablet reports a payment it took on the device (Zettle SDK);
 * - `POST /register/payments/:id/cancel`         — abandon it.
 * Once paid, the order is created with the cart priced at the start, exactly once.
 *
 * Admin side (admin/subadmin only, like `/wolt/credentials`):
 * - `GET`/`POST /vipps/credentials`, `GET`/`POST /zettle/credentials`.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { OrderRecord } from '../../src/types/order'
import { bearerToken, sendJson } from '../http'
import { parseCheckout } from '../register/checkoutInput'
import { createRegisterOrder, type RegisterOrderDeps } from '../register/orders'
import { priceCart } from '../../src/lib/registerPricing'
import { withJsonBody } from '../register/routeHelpers'
import { EMPTY_CREDENTIALS, getVippsCredentials, getZettleCredentials, parseCredentials, setVippsCredentials, setZettleCredentials } from './credentials'
import type { PaymentIntent, PaymentIntents } from './intents'
import { offeredProviders, type PaymentProvider } from './types'

/** What the routes need from the server around them. */
export interface PaymentRouteDeps {
  deviceMayUseRegister: (deviceId: string) => boolean
  providers: PaymentProvider[]
  intents: PaymentIntents
  orders: RegisterOrderDeps
  storeName: () => string
  /** Whether the bearer token belongs to an admin/subadmin session. */
  isFullAdmin: (token: string) => boolean
}

/** What the tablet sees of an intent — never the priced cart's internals beyond the total. */
function publicIntent(intent: PaymentIntent) {
  return { id: intent.id, provider: intent.providerId, start: intent.start, state: intent.state, totalPrice: intent.cart.totalPrice, order: intent.order }
}

/** Creates the order for a paid intent. */
function orderForPaidIntent(deps: PaymentRouteDeps, intent: PaymentIntent): OrderRecord | undefined {
  const provider = deps.providers.find((candidate) => candidate.id === intent.providerId)
  const result = createRegisterOrder(deps.orders, {
    ...intent.checkout,
    payment: { method: provider?.method ?? 'card', provider: intent.providerId, reference: intent.id },
    lockedCart: intent.cart,
  })
  if (!result.ok) {
    console.error(`[payments] paid intent ${intent.id} could not become an order:`, result.reason)
    return undefined
  }
  console.log(`[payments] ${intent.providerId} payment ${intent.id} → order ${result.order.displayNumber}`)
  return result.order
}

function credentialRoutes(req: IncomingMessage, res: ServerResponse, path: string, deps: PaymentRouteDeps): boolean {
  const kind = path === '/vipps/credentials' ? 'vipps' : path === '/zettle/credentials' ? 'zettle' : null
  if (!kind || (req.method !== 'GET' && req.method !== 'POST')) return false
  if (!deps.isFullAdmin(bearerToken(req) ?? '')) {
    sendJson(res, 403, { error: 'Only admin/subadmin accounts can manage payment credentials' })
    return true
  }
  if (req.method === 'GET') {
    sendJson(res, 200, kind === 'vipps' ? getVippsCredentials() : getZettleCredentials())
    return true
  }
  withJsonBody(req, res, (body) => {
    if (kind === 'vipps') setVippsCredentials(parseCredentials(body, EMPTY_CREDENTIALS.vipps))
    else setZettleCredentials(parseCredentials(body, EMPTY_CREDENTIALS.zettle))
    console.log(`[payments] ${kind} credentials updated`)
    sendJson(res, 200, { ok: true })
  })
  return true
}

/** Handles the request if it's one of this module's routes; returns `false` otherwise. */
export function handlePaymentRoute(req: IncomingMessage, res: ServerResponse, url: URL, deps: PaymentRouteDeps): boolean {
  const path = url.pathname
  if (credentialRoutes(req, res, path, deps)) return true
  if (!path.startsWith('/register/payments')) return false

  const checkDevice = (deviceId: unknown): deviceId is string => {
    if (typeof deviceId === 'string' && deps.deviceMayUseRegister(deviceId)) return true
    sendJson(res, 403, { error: 'This display is not allowed to use the register' })
    return false
  }

  if (req.method === 'POST' && path === '/register/payments') {
    withJsonBody(req, res, async (body) => {
      if (!checkDevice(body.deviceId)) return
      const checkout = parseCheckout(body)
      const provider = offeredProviders(deps.providers).find((candidate) => candidate.id === body.provider)
      if (!checkout || !provider) return sendJson(res, 400, { error: 'Expected a cart and a configured payment provider' })
      const priced = priceCart(checkout.lines, deps.orders.readCatalogue(), checkout.serving)
      if (!priced.ok) return sendJson(res, 400, priced)
      if (priced.cart.totalPrice !== checkout.expectedTotal) return sendJson(res, 409, { ok: false, reason: 'priceChanged', totalPrice: priced.cart.totalPrice })
      try {
        const intent = await deps.intents.start(provider, body.deviceId, checkout, priced.cart, deps.storeName())
        sendJson(res, 201, { intent: publicIntent(intent) })
      } catch (error) {
        sendJson(res, 503, { error: error instanceof Error ? error.message : 'The payment provider is unavailable' })
      }
    })
    return true
  }

  const match = /^\/register\/payments\/([^/]+)(?:\/(device-result|cancel))?$/.exec(path)
  if (!match) return false
  const [, id, action] = match

  if (req.method === 'GET' && !action) {
    const deviceId = url.searchParams.get('deviceId')
    if (!checkDevice(deviceId)) return true
    const intent = deps.intents.get(id, deviceId)
    if (!intent) return (sendJson(res, 404, { error: 'Payment not found' }), true)
    const provider = deps.providers.find((candidate) => candidate.id === intent.providerId)
    // A device-taken payment (Zettle) only changes when the tablet reports it; a QR payment is asked about.
    if (intent.state !== 'pending' || intent.start.kind !== 'qr' || !provider) return (sendJson(res, 200, { intent: publicIntent(intent) }), true)
    provider
      .status(intent.id)
      .then((state) => sendJson(res, 200, { intent: publicIntent(deps.intents.settle(intent, state, (paid) => orderForPaidIntent(deps, paid))) }))
      .catch((error: unknown) => sendJson(res, 502, { error: error instanceof Error ? error.message : 'Status check failed', intent: publicIntent(intent) }))
    return true
  }

  if (req.method === 'POST' && action) {
    withJsonBody(req, res, async (body) => {
      if (!checkDevice(body.deviceId)) return
      const intent = deps.intents.get(id, body.deviceId)
      if (!intent) return sendJson(res, 404, { error: 'Payment not found' })
      if (action === 'device-result') {
        if (intent.start.kind !== 'device') return sendJson(res, 400, { error: 'This payment is not taken on the device' })
        // TODO: verify a reported payment through Zettle's purchase API once confirmed (see zettleAdapter.ts).
        deps.intents.settle(intent, body.ok === true ? 'captured' : 'failed', (paid) => orderForPaidIntent(deps, paid))
        return sendJson(res, 200, { intent: publicIntent(intent) })
      }
      const provider = deps.providers.find((candidate) => candidate.id === intent.providerId)
      if (intent.start.kind === 'qr' && intent.state === 'pending' && provider) {
        await provider.cancel(intent.id).catch((error: unknown) => console.warn(`[payments] cancelling ${intent.id} at ${provider.id} failed:`, error))
      }
      deps.intents.settle(intent, 'cancelled', () => undefined)
      sendJson(res, 200, { intent: publicIntent(intent) })
    })
    return true
  }

  return false
}
