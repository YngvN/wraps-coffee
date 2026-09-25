/**
 * Admin-side routes for the Register, used from the dashboard (logged-in sessions only):
 * - `GET  /register/pin` — whether a staff PIN is set (never the PIN);
 * - `POST /register/pin` — `{ pin }` sets it (4–6 digits), `{ pin: null }` removes it. Either way every
 *   unlocked register is locked again, so an old unlock never outlives a PIN change;
 * - `GET  /barcodes/:code` — the same lookup the register uses, for the product editor's "Look up";
 * - `POST /register/orders/:id/status` — `{ status }`: the admin Orders view changing one counter
 *   sale's status, through `setOrderStatus` like the board, never a whole-array write.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { BarcodeLookupResult } from '../../src/types/barcode'
import type { OrderStatus } from '../../src/types/order'
import type { DashboardSection } from '../../src/types/sync'
import { bearerToken, sendJson } from '../http'
import { isOrderStatus } from '../orderStatus'
import { withJsonBody } from './routeHelpers'
import { isValidPin, type PinRecord, type UnlockManager } from './unlock'

/** What the routes need from the server around them. */
export interface RegisterAdminRouteDeps {
  /** Whether the bearer token's session may edit `section` (admin/subadmin always; limited only with that section). */
  sessionMay: (token: string, section: DashboardSection) => boolean
  readPin: () => PinRecord | null
  writePin: (pin: string | null) => void
  unlock: UnlockManager
  lookupBarcode: (code: string, host: string) => Promise<BarcodeLookupResult>
  /** Sets one register order's status; `false` if no such register order exists. */
  setRegisterOrderStatus: (orderId: string, status: OrderStatus) => Promise<boolean>
}

/** Handles the request if it's one of this module's routes; returns `false` otherwise. */
export function handleRegisterAdminRoute(req: IncomingMessage, res: ServerResponse, url: URL, host: string, deps: RegisterAdminRouteDeps): boolean {
  const token = bearerToken(req) ?? ''

  if (url.pathname === '/register/pin' && (req.method === 'GET' || req.method === 'POST')) {
    if (!deps.sessionMay(token, 'store')) {
      sendJson(res, 403, { error: 'Only accounts that can manage store settings can change the register PIN' })
      return true
    }
    if (req.method === 'GET') {
      sendJson(res, 200, { isSet: deps.readPin() !== null })
      return true
    }
    withJsonBody(req, res, (body) => {
      if (body.pin !== null && !isValidPin(body.pin)) return sendJson(res, 400, { error: 'The PIN must be 4 to 6 digits' })
      deps.writePin(body.pin)
      deps.unlock.lockAll()
      console.log(`[register] staff PIN ${body.pin === null ? 'removed' : 'changed'}`)
      sendJson(res, 200, { isSet: body.pin !== null })
    })
    return true
  }

  const statusMatch = /^\/register\/orders\/([^/]+)\/status$/.exec(url.pathname)
  if (req.method === 'POST' && statusMatch) {
    if (!deps.sessionMay(token, 'orders')) {
      sendJson(res, 403, { error: 'Only accounts that can manage orders can change a counter sale' })
      return true
    }
    withJsonBody(req, res, async (body) => {
      if (!isOrderStatus(body.status)) return sendJson(res, 400, { error: 'Expected a valid status' })
      const found = await deps.setRegisterOrderStatus(decodeURIComponent(statusMatch[1]), body.status)
      sendJson(res, found ? 200 : 404, found ? { ok: true } : { error: 'Order not found' })
    })
    return true
  }

  const match = /^\/barcodes\/([^/]+)$/.exec(url.pathname)
  if (req.method === 'GET' && match) {
    if (!deps.sessionMay(token, 'products')) {
      sendJson(res, 403, { error: 'Only accounts that can manage products can look up barcodes' })
      return true
    }
    deps
      .lookupBarcode(decodeURIComponent(match[1]), host)
      .then((result) => sendJson(res, result.kind === 'invalid' ? 400 : 200, result))
      .catch((error: unknown) => sendJson(res, 500, { error: error instanceof Error ? error.message : 'Lookup failed' }))
    return true
  }

  return false
}
