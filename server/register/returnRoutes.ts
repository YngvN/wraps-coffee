/**
 * `POST /register/returns` — a return against a register sale (see `returns.ts`), by a signed-in
 * manager: `{ deviceId, sessionToken, orderId, lines: [{ itemID, quantity }], reason, note?, printerId? }`.
 *
 * In order: the return is checked against what's left of the sale; journaled as a signed `return`
 * (negative amounts, linked to the original receipt); added to the order's `returns` so the board and
 * history show it; any returned product with stock tracking gets its stock back; and the
 * "Returkvittering" is printed like any legal receipt. The refund itself is done by hand for card and
 * Vipps (on the terminal, until a provider is live); a cash refund then opens the drawer through
 * `POST /register/drawer` with reason `return`.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { translate } from '../../src/i18n/translate'
import { resolveReceiptLanguage } from '../../src/lib/receipt'
import type { OrderRecord, OrderReturn } from '../../src/types/order'
import type { Product } from '../../src/types/product'
import { missingLegalDetails } from '../../src/utils/storeLegal'
import { sendJson } from '../http'
import { checkDevice, requireSession } from './access'
import { deliver, destination, type ReceiptRouteDeps } from './receiptRoutes'
import { planReturn, returnJournalInput, type ReturnLine } from './returns'
import { withJsonBody } from './routeHelpers'
import { trainingActive } from './training'

export interface ReturnRouteDeps extends ReceiptRouteDeps {
  /** Appends `entry` to one register order's `returns`, re-reading the orders first. */
  addReturn: (orderId: string, entry: OrderReturn) => void
  readProducts: () => Product[]
  /** Saves the product list; `actor` is the staff id. */
  writeProducts: (products: Product[], actor: string) => void
}

/** `products` with the returned lines' stock put back (only products that track stock). */
export function restockReturn(products: Product[], lines: ReturnLine[]): Product[] {
  const back = new Map(lines.map((line) => [line.itemID, line.quantity]))
  return products.map((product) =>
    product.trackStock && back.has(product.itemID) ? { ...product, stockQuantity: (product.stockQuantity ?? 0) + (back.get(product.itemID) ?? 0) } : product,
  )
}

/** Handles `POST /register/returns`; `false` for anything else. */
export function handleReturnRoute(req: IncomingMessage, res: ServerResponse, url: URL, deps: ReturnRouteDeps): boolean {
  if (req.method !== 'POST' || url.pathname !== '/register/returns') return false
  withJsonBody(req, res, async (body) => {
    if (!checkDevice(res, deps, body.deviceId)) return
    const session = requireSession(res, deps, body.deviceId, body.sessionToken, 'manager')
    if (!session) return
    const store = deps.readStoreSettings()
    if (!store.legal || missingLegalDetails(store).length > 0) return sendJson(res, 409, { reason: 'legalDetailsMissing' })
    if (trainingActive(deps.journal.read(), session.register)) return sendJson(res, 409, { reason: 'training' })
    const order = deps.readRegisterOrders().find((candidate) => candidate.id === body.orderId)
    if (!order) return sendJson(res, 404, { reason: 'unknownOrder' })
    const plan = planReturn(order, Array.isArray(body.lines) ? body.lines : [], body.reason, body.note)
    if (!plan.ok) return sendJson(res, 400, plan)
    const target = destination(deps.readPrinterSettings(), body.printerId)

    const register = deps.cashRegister(body.deviceId)
    const entry = deps.journal.append(returnJournalInput(order, plan, register.number, session.staffId))
    const done: OrderReturn = {
      number: entry.receiptNumber ?? 0,
      journalSeq: entry.seq,
      at: entry.at,
      lines: plan.lines.map(({ itemID, quantity }) => ({ itemID, quantity })),
      totalOre: entry.data.totalOre as number,
      reason: plan.reason,
      method: (order as Required<Pick<OrderRecord, 'payment'>>).payment.method,
    }
    deps.addReturn(order.id, done)
    if (plan.lines.some((line) => deps.readProducts().some((product) => product.itemID === line.itemID && product.trackStock))) {
      deps.writeProducts(restockReturn(deps.readProducts(), plan.lines), session.staffId)
    }
    console.log(`[register] ${session.name} returned ${done.totalOre / 100} kr of ${order.displayNumber} (${plan.reason})`)

    // Printed like every legal receipt; with no printer, the return still stands and says so.
    if (target.kind === 'none') return sendJson(res, 200, { ok: true, return: done, printed: false, reason: 'noPrinter' })
    const language = resolveReceiptLanguage(deps.readPrinterSettings())
    const reasonText = `${translate(language, `receipt.reason.${plan.reason}`)}${plan.note ? `: ${plan.note}` : ''}`
    await deliver(
      res,
      deps,
      target,
      {
        kind: 'return',
        legal: store.legal,
        storeName: store.name,
        register: { number: register.number, name: register.name },
        cashier: session.name,
        receiptNumber: done.number,
        originalReceiptNumber: order.receipt?.number,
        returnReason: reasonText,
        at: new Date(entry.at),
        displayNumber: order.displayNumber,
        lines: plan.lines,
        totalOre: done.totalOre,
        vat: entry.data.vat as never,
        payments: entry.data.payments as never,
      },
      { return: done, printed: true },
    )
  })
  return true
}
