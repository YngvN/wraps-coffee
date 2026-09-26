/**
 * `POST /register/drawer` — opens the cash drawer from a register tablet (see `drawer.ts` for the rules).
 *
 * Body: `{ deviceId, reason: 'sale' | 'return' | 'manual', orderId?, returnNumber?, sessionToken, printerId? }` — any signed-in staff
 * member may open it, and every opening is journaled with who did it. `printerId` is the
 * tablet's own printer choice; a USB printer on the tablet (`usb:<key>`) can't be reached from here, so
 * the route only authorises and logs the opening and answers `{ via: 'device' }` for the tablet to send
 * the pulse itself.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { OrderRecord } from '../../src/types/order'
import type { ConfiguredPrinter, PrinterSettings } from '../../src/types/printer'
import { buildDrawerKick } from '../../src/lib/receipt'
import { sendJson } from '../http'
import { drawerPrinter, logDrawerOpening, readDrawerLog, returnDrawerRefusal, saleDrawerRefusal, type DrawerReason } from './drawer'
import { withJsonBody } from './routeHelpers'
import { requireSession, type RegisterAccess } from './access'

/** What the route needs from the server around it. */
export interface DrawerRouteDeps extends RegisterAccess {
  readRegisterOrders: () => OrderRecord[]
  readPrinterSettings: () => PrinterSettings
  printJob: (printer: ConfiguredPrinter, bytes: Uint8Array) => Promise<void>
}

/** Handles `POST /register/drawer`; `false` for any other request. */
export function handleDrawerRoute(req: IncomingMessage, res: ServerResponse, url: URL, deps: DrawerRouteDeps): boolean {
  if (req.method !== 'POST' || url.pathname !== '/register/drawer') return false
  withJsonBody(req, res, async (body) => {
    const { deviceId, reason, orderId, sessionToken, printerId } = body
    const requestedReturn = typeof body.returnNumber === 'number' ? body.returnNumber : undefined
    if (typeof deviceId !== 'string' || !deps.deviceMayUseRegister(deviceId)) return sendJson(res, 403, { error: 'This display is not allowed to use the register' })
    if (reason !== 'sale' && reason !== 'return' && reason !== 'manual') return sendJson(res, 400, { error: 'Expected reason "sale", "return" or "manual"' })

    const session = requireSession(res, deps, deviceId, sessionToken)
    if (!session) return
    const order = reason === 'manual' ? undefined : deps.readRegisterOrders().find((candidate) => candidate.id === orderId)
    if (reason !== 'manual') {
      const refusal = reason === 'sale' ? saleDrawerRefusal(order, readDrawerLog(), Date.now()) : returnDrawerRefusal(order, readDrawerLog(), Date.now(), requestedReturn)
      if (refusal) return sendJson(res, 409, { reason: refusal })
    }

    const returnNumber = reason === 'return' ? (requestedReturn ?? order?.returns?.[order.returns.length - 1]?.number) : undefined
    const base = { at: new Date().toISOString(), deviceId, reason: reason as DrawerReason, orderId: typeof orderId === 'string' ? orderId : undefined, returnNumber }
    const journal = (printer: string) =>
      deps.journal.append({ register: session.register, actor: session.staffId, type: 'drawerOpen', data: { reason, orderId: base.orderId, returnNumber, printer } })
    if (typeof printerId === 'string' && printerId.startsWith('usb:')) {
      logDrawerOpening({ ...base, printer: 'usb' })
      journal('usb')
      return sendJson(res, 200, { ok: true, via: 'device' })
    }
    const printer = drawerPrinter(deps.readPrinterSettings(), typeof printerId === 'string' ? printerId : undefined)
    if (!printer) return sendJson(res, 409, { reason: 'noPrinter' })
    try {
      await deps.printJob(printer, buildDrawerKick())
    } catch (error) {
      console.error(`[register] opening the drawer on "${printer.name}" failed:`, error)
      return sendJson(res, 502, { reason: 'printerFailed' })
    }
    logDrawerOpening({ ...base, printer: printer.id })
    journal(printer.id)
    console.log(`[register] ${deviceId} opened the cash drawer on "${printer.name}" (${reason})`)
    sendJson(res, 200, { ok: true, via: 'server' })
  })
  return true
}
