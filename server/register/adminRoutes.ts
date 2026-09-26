/**
 * Admin-side routes for the Register, used from the dashboard (logged-in sessions only):
 * - `GET  /barcodes/:code` — the same lookup the register uses, for the product editor's "Look up";
 * - `POST /register/orders/:id/status` — `{ status }`: the admin Orders view changing one counter
 *   sale's status, through `setOrderStatus` like the board, never a whole-array write;
 * - `GET  /register/registers` — every cash register (tablet) with its number and name;
 * - `POST /register/registers/:number` — `{ name }` renames one.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { BarcodeLookupResult } from '../../src/types/barcode'
import type { OrderStatus } from '../../src/types/order'
import type { DashboardSection } from '../../src/types/sync'
import { bearerToken, sendJson } from '../http'
import { isOrderStatus } from '../orderStatus'
import { withJsonBody } from './routeHelpers'
import type { CashRegister } from './registers'

/** What the routes need from the server around them. */
export interface RegisterAdminRouteDeps {
  /** Whether the bearer token's session may edit `section` (admin/subadmin always; limited only with that section). */
  sessionMay: (token: string, section: DashboardSection) => boolean
  lookupBarcode: (code: string, host: string) => Promise<BarcodeLookupResult>
  /** Sets one register order's status; `false` if no such register order exists. */
  setRegisterOrderStatus: (orderId: string, status: OrderStatus) => Promise<boolean>
  listCashRegisters: () => CashRegister[]
  renameCashRegister: (number: number, name: unknown) => CashRegister | null
}

/** Handles the request if it's one of this module's routes; returns `false` otherwise. */
export function handleRegisterAdminRoute(req: IncomingMessage, res: ServerResponse, url: URL, host: string, deps: RegisterAdminRouteDeps): boolean {
  const token = bearerToken(req) ?? ''

  const registerMatch = /^\/register\/registers(?:\/(\d+))?$/.exec(url.pathname)
  if (registerMatch && (req.method === 'GET' || req.method === 'POST')) {
    if (!deps.sessionMay(token, 'store')) {
      sendJson(res, 403, { error: 'Only accounts that can manage store settings can see or rename cash registers' })
      return true
    }
    if (req.method === 'GET' && !registerMatch[1]) {
      sendJson(res, 200, { registers: deps.listCashRegisters().map(({ number, name, createdAt }) => ({ number, name, createdAt })) })
      return true
    }
    if (req.method === 'POST' && registerMatch[1]) {
      withJsonBody(req, res, (body) => {
        const renamed = deps.renameCashRegister(Number(registerMatch[1]), body.name)
        sendJson(res, renamed ? 200 : 400, renamed ? { number: renamed.number, name: renamed.name } : { error: 'Unknown register or blank name' })
      })
      return true
    }
  }

  const statusMatch = /^\/register\/orders\/([^/]+)\/status$/.exec(url.pathname)
  if (req.method === 'POST' && statusMatch) {
    if (!deps.sessionMay(token, 'orders')) {
      sendJson(res, 403, { error: 'Only accounts that can manage orders can change a counter sale' })
      return true
    }
    withJsonBody(req, res, async (body) => {
      if (!isOrderStatus(body.status)) return sendJson(res, 400, { error: 'Expected a valid status' })
      if (body.status === 'cancelled') return sendJson(res, 409, { error: 'A register sale cannot be cancelled; make a return instead', reason: 'registerSaleFinal' })
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
