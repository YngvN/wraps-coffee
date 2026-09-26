/**
 * Printing the register's legal receipts (see `receipts.ts` and `src/lib/receipt/legalReceipt.ts`):
 * - `POST /register/receipts/print` — `{ deviceId, sessionToken, orderId, printerId? }`: the sale's
 *   original receipt the first time, its one copy ("KOPI", journaled as a signed `copy`) the second,
 *   and 409 `copyLimit` after that;
 * - `POST /register/pro-forma` — `{ deviceId, sessionToken, lines, serving, printerId? }`: a pro forma
 *   ("Foreløpig kvittering – IKKE KVITTERING FOR KJØP") of the cart before payment, journaled as a
 *   signed `proForma` in its own number series.
 *
 * Both refuse with 409 `legalDetailsMissing` until Settings → Store → Company details is complete.
 * A printer on the server's network or USB is printed to here; a USB printer on the tablet (`usb:…`)
 * can't be, so the job comes back as base64 (`{ via: 'device', data }`) for the tablet to send — and
 * counts as printed from that moment, since the server can't see it land.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { buildLegalReceipt, resolveReceiptLanguage, type LegalReceiptData } from '../../src/lib/receipt'
import { priceCart, type CartLineInput, type PricingCatalogue, type Serving } from '../../src/lib/registerPricing'
import type { OrderRecord } from '../../src/types/order'
import type { ConfiguredPrinter, PrinterSettings } from '../../src/types/printer'
import type { StoreSettings } from '../../src/types/storeSettings'
import { missingLegalDetails } from '../../src/utils/storeLegal'
import { sendJson } from '../http'
import { checkDevice, requireSession, type RegisterAccess } from './access'
import { nextReceiptPrint, saleReceiptData } from './receipts'
import { saleJournalInput } from './saleJournal'
import { withJsonBody } from './routeHelpers'
import type { StaffMember } from './staff'

export interface ReceiptRouteDeps extends RegisterAccess {
  readRegisterOrders: () => OrderRecord[]
  /** Merges `patch` into one register order's `receipt`, re-reading the orders first. */
  markReceipt: (orderId: string, patch: Partial<NonNullable<OrderRecord['receipt']>>) => void
  readStaff: () => StaffMember[]
  readStoreSettings: () => StoreSettings
  readPrinterSettings: () => PrinterSettings
  readCatalogue: () => PricingCatalogue
  printJob: (printer: ConfiguredPrinter, bytes: Uint8Array) => Promise<void>
}

export type Destination = { kind: 'device' } | { kind: 'server'; printer: ConfiguredPrinter } | { kind: 'none' }

/** Where to print: the tablet's own USB printer, its chosen server printer, or the default. */
export function destination(settings: PrinterSettings, printerId: unknown): Destination {
  if (typeof printerId === 'string' && printerId.startsWith('usb:')) return { kind: 'device' }
  const chosen = typeof printerId === 'string' ? settings.printers.find((printer) => printer.id === printerId) : undefined
  const printer = chosen ?? settings.printers.find((candidate) => candidate.id === settings.defaultPrinterId)
  return printer ? { kind: 'server', printer } : { kind: 'none' }
}

/** Builds `data` for `target` and sends it there, or answers with the job for the tablet. Resolves `false` after answering an error. */
export async function deliver(
  res: ServerResponse,
  deps: ReceiptRouteDeps,
  target: Exclude<Destination, { kind: 'none' }>,
  data: LegalReceiptData,
  extra: Record<string, unknown>,
): Promise<boolean> {
  const language = resolveReceiptLanguage(deps.readPrinterSettings())
  if (target.kind === 'device') {
    const bytes = buildLegalReceipt(data, { language, paperWidthMm: 80 })
    sendJson(res, 200, { ok: true, via: 'device', data: Buffer.from(bytes).toString('base64'), ...extra })
    return true
  }
  try {
    await deps.printJob(target.printer, buildLegalReceipt(data, { language, paperWidthMm: target.printer.paperWidthMm }))
    sendJson(res, 200, { ok: true, via: 'server', ...extra })
    return true
  } catch (error) {
    console.error(`[register] printing a receipt on "${target.printer.name}" failed:`, error)
    sendJson(res, 502, { reason: 'printerFailed' })
    return false
  }
}

/** Handles a receipt route; `false` for anything else. */
export function handleReceiptRoute(req: IncomingMessage, res: ServerResponse, url: URL, deps: ReceiptRouteDeps): boolean {
  const path = url.pathname
  if (req.method !== 'POST' || (path !== '/register/receipts/print' && path !== '/register/pro-forma')) return false

  withJsonBody(req, res, async (body) => {
    if (!checkDevice(res, deps, body.deviceId)) return
    const session = requireSession(res, deps, body.deviceId, body.sessionToken)
    if (!session) return
    const store = deps.readStoreSettings()
    if (!store.legal || missingLegalDetails(store).length > 0) return sendJson(res, 409, { reason: 'legalDetailsMissing' })
    const register = deps.cashRegister(body.deviceId)
    const context = { legal: store.legal, storeName: store.name, register: { number: register.number, name: register.name } }
    const target = destination(deps.readPrinterSettings(), body.printerId)
    if (target.kind === 'none') return sendJson(res, 409, { reason: 'noPrinter' })

    if (path === '/register/pro-forma') {
      const lines = Array.isArray(body.lines) ? (body.lines as CartLineInput[]) : []
      const serving: Serving = body.serving === 'eatIn' ? 'eatIn' : 'takeaway'
      const priced = priceCart(lines, deps.readCatalogue(), serving)
      if (!priced.ok) return sendJson(res, 400, priced)
      // Priced exactly like a sale, so the pro forma shows the same lines and VAT the sale would.
      const draft = { id: '', items: priced.cart.items, totalPrice: priced.cart.totalPrice, serving } as unknown as OrderRecord
      const sale = saleJournalInput(draft, register.number, session.staffId)
      // An event in SAF-T, not a signed transaction: numbered in its own series, with its amount in the data.
      const entry = deps.journal.append({ register: sale.register, actor: sale.actor, type: 'proForma', data: { ...sale.data, orderId: undefined, payments: [], amountOre: sale.amounts?.inOre } })
      const data = saleReceiptData(entry, { ...context, cashier: session.name })
      await deliver(res, deps, target, { ...data, kind: 'proForma' }, { number: entry.receiptNumber })
      return
    }

    const order = deps.readRegisterOrders().find((candidate) => candidate.id === body.orderId)
    if (!order?.receipt) return sendJson(res, 404, { reason: 'unknownOrder' })
    const kind = nextReceiptPrint(order)
    if (kind === 'copyLimit') return sendJson(res, 409, { reason: 'copyLimit' })
    const saleEntry = deps.journal.get(order.receipt.journalSeq, order.receipt.at)
    if (!saleEntry) return sendJson(res, 500, { error: 'The sale is missing from the journal' })
    const cashier = deps.readStaff().find((member) => member.id === order.staffId)?.name ?? '-'
    const now = new Date()

    if (kind === 'original') {
      if (!(await deliver(res, deps, target, saleReceiptData(saleEntry, { ...context, cashier }), { kind }))) return
      deps.markReceipt(order.id, { printedAt: now.toISOString() })
      return
    }

    // The copy is journaled before it prints: it's the one allowed, whether or not the paper comes out.
    // An event in SAF-T (not a signed transaction), linked to the sale it copies.
    const copy = deps.journal.append({
      register: register.number,
      actor: session.staffId,
      type: 'copy',
      data: { orderId: order.id, originalReceiptNumber: saleEntry.receiptNumber, originalRegister: saleEntry.register, originalSeq: saleEntry.seq, amountOre: saleEntry.signed?.amountInOre ?? 0 },
    })
    deps.markReceipt(order.id, { copyPrintedAt: now.toISOString() })
    await deliver(res, deps, target, saleReceiptData(saleEntry, { ...context, cashier }, { number: copy.receiptNumber ?? 0, printedAt: now }), { kind })
  })
  return true
}
