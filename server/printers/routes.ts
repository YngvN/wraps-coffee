/**
 * HTTP routes for receipt printing — kept out of `server/index.ts`, which only calls
 * `handlePrinterRoute` and supplies the store access below as dependencies.
 *
 * - `GET  /printers/discover` — admin: every printer the server can find (network scan + OS queues);
 * - `POST /printers/test`     — admin: prints a sample receipt on a printer (saved or not yet saved);
 * - `POST /display-orders/print` — an approved order-board tablet prints one order's receipt on a
 *   *configured* printer. Same device trust as `POST /display-orders/status`, and never an arbitrary
 *   address: only printers listed in Settings → Printers can be reached this way.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { buildReceipt, resolveReceiptLanguage } from '../../src/lib/receipt'
import type { OrderRecord } from '../../src/types/order'
import { DEFAULT_RAW_PRINTER_PORT, type ConfiguredPrinter, type PrinterSettings } from '../../src/types/printer'
import { bearerToken, readJsonBody, sendJson } from '../http'
import { discoverNetworkPrinters, sendToNetworkPrinter } from './network'
import { listSystemPrinters, printToSystemPrinter } from './system'

/** What the routes need from the server around them. */
export interface PrinterRouteDeps {
  getSettings: () => PrinterSettings
  getStoreName: () => string
  findOrder: (orderId: string) => OrderRecord | undefined
  /** Whether this device may act on orders — see `deviceMayChangeOrders` in `server/index.ts`. */
  deviceMayChangeOrders: (deviceId: string) => boolean
  /** Whether the request carries a session allowed to manage printers (admin/subadmin, or a limited account with the `store` section). */
  mayManagePrinters: (token: string) => boolean
}

/** Sends a finished job to whichever transport `printer` uses. */
export async function printJob(printer: ConfiguredPrinter, bytes: Uint8Array): Promise<void> {
  if (printer.transport === 'network') {
    if (!printer.host) throw new Error('Printer has no address')
    return sendToNetworkPrinter(printer.host, printer.port ?? DEFAULT_RAW_PRINTER_PORT, bytes)
  }
  if (!printer.systemName) throw new Error('Printer has no queue name')
  return printToSystemPrinter(printer.systemName, bytes)
}


/** A believable order for a test print, so the admin sees the real layout (and that æøå come out right). */
function sampleOrder(): OrderRecord {
  return {
    id: 'test-0000',
    items: [
      { itemID: 'test-1', name: 'Latte', quantity: 2, unitPrice: 55 },
      { itemID: 'test-2', name: 'Kyllingwrap', quantity: 1, unitPrice: 119 },
    ],
    totalPrice: 229,
    customerName: 'Test Testesen',
    customerPhone: '+47 000 00 000',
    pickupTime: '12:00',
    notes: 'Testutskrift — æøå ÆØÅ',
    status: 'preparing',
    createdAt: new Date().toISOString(),
  }
}

/** Validates an unsaved printer from the admin form before anything is sent to it. */
function asConfiguredPrinter(value: unknown): ConfiguredPrinter | null {
  const printer = value as Partial<ConfiguredPrinter> | null
  if (!printer || (printer.transport !== 'network' && printer.transport !== 'system')) return null
  if (printer.transport === 'network' && (typeof printer.host !== 'string' || !printer.host.trim())) return null
  if (printer.transport === 'system' && (typeof printer.systemName !== 'string' || !printer.systemName.trim())) return null
  return {
    id: String(printer.id ?? 'unsaved'),
    name: String(printer.name ?? ''),
    transport: printer.transport,
    host: printer.host?.trim(),
    port: Number.isInteger(printer.port) ? printer.port : undefined,
    systemName: printer.systemName,
    paperWidthMm: printer.paperWidthMm === 58 ? 58 : 80,
  }
}

/** Handles the request if it's one of this module's routes; returns `false` to let `server/index.ts` carry on otherwise. */
export function handlePrinterRoute(req: IncomingMessage, res: ServerResponse, url: URL, deps: PrinterRouteDeps): boolean {
  if (req.method === 'GET' && url.pathname === '/printers/discover') {
    if (!deps.mayManagePrinters(bearerToken(req) ?? '')) {
      sendJson(res, 401, { error: 'Only accounts that can manage store settings can search for printers' })
      return true
    }
    Promise.all([discoverNetworkPrinters(), listSystemPrinters()])
      .then(([network, system]) => {
        const printers = [...network, ...system].sort((a, b) => Number(b.likelyReceipt) - Number(a.likelyReceipt) || a.name.localeCompare(b.name))
        sendJson(res, 200, { printers })
      })
      .catch((error: unknown) => sendJson(res, 500, { error: error instanceof Error ? error.message : 'Printer search failed' }))
    return true
  }

  if (req.method === 'POST' && url.pathname === '/printers/test') {
    if (!deps.mayManagePrinters(bearerToken(req) ?? '')) {
      sendJson(res, 401, { error: 'Only accounts that can manage store settings can test printers' })
      return true
    }
    readJsonBody(req)
      .then(async (body) => {
        const { printer: raw } = body as { printer?: unknown }
        const printer = asConfiguredPrinter(raw)
        if (!printer) {
          sendJson(res, 400, { error: 'Expected a printer with an address or queue name' })
          return
        }
        try {
          // A test print shows the real thing: the store's receipt language (see `resolveReceiptLanguage`), not the admin's screen language.
          const bytes = buildReceipt(sampleOrder(), { storeName: deps.getStoreName(), language: resolveReceiptLanguage(deps.getSettings()), paperWidthMm: printer.paperWidthMm, printedAt: new Date() })
          await printJob(printer, bytes)
          sendJson(res, 200, { ok: true })
        } catch (error) {
          sendJson(res, 502, { error: error instanceof Error ? error.message : 'The printer did not accept the job' })
        }
      })
      .catch(() => sendJson(res, 400, { error: 'Malformed request body' }))
    return true
  }

  if (req.method === 'POST' && url.pathname === '/display-orders/print') {
    readJsonBody(req)
      .then(async (body) => {
        const { deviceId, orderId, printerId } = body as { deviceId?: unknown; orderId?: unknown; printerId?: unknown }
        if (typeof deviceId !== 'string' || typeof orderId !== 'string') {
          sendJson(res, 400, { error: 'Expected deviceId and orderId' })
          return
        }
        if (!deps.deviceMayChangeOrders(deviceId)) {
          sendJson(res, 403, { error: 'This display is not allowed to print orders' })
          return
        }
        const settings = deps.getSettings()
        // A tablet's own choice wins; one that no longer exists (the admin removed that printer since)
        // falls back to the default rather than failing, so a stale tablet setting never blocks printing.
        const chosen = typeof printerId === 'string' ? settings.printers.find((candidate) => candidate.id === printerId) : undefined
        const printer = chosen ?? settings.printers.find((candidate) => candidate.id === settings.defaultPrinterId)
        if (!printer) {
          sendJson(res, 409, { error: 'No printer is set up — add one in Settings → Printers' })
          return
        }
        const order = deps.findOrder(orderId)
        if (!order) {
          sendJson(res, 404, { error: 'Order not found' })
          return
        }
        try {
          // The store's receipt language, not the one the tablet sent: an older tablet sends its screen language.
          await printJob(printer, buildReceipt(order, { storeName: deps.getStoreName(), language: resolveReceiptLanguage(settings), paperWidthMm: printer.paperWidthMm, printedAt: new Date() }))
          console.log(`[printers] display ${deviceId} printed order ${orderId} on "${printer.name}"`)
          sendJson(res, 200, { ok: true })
        } catch (error) {
          console.error(`[printers] printing order ${orderId} on "${printer.name}" failed:`, error)
          sendJson(res, 502, { error: error instanceof Error ? error.message : 'The printer did not accept the job' })
        }
      })
      .catch(() => sendJson(res, 400, { error: 'Malformed request body' }))
    return true
  }

  return false
}
