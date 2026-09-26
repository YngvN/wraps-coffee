/**
 * `POST /register/cart-events` — what happened to the cart before payment, for the journal
 * (kassasystemforskrifta § 2-7 and the X/Z report's "line corrections" and "voided transactions"):
 * - `{ kind: 'lineCorrection', correction: 'removed' | 'decreased', lines: [{ productId, quantity }], serving }`
 *   — a line taken out, or its quantity lowered (`quantity` is how many came off);
 * - `{ kind: 'void', lines, serving }` — a cart with items in it cleared without a sale.
 * The server prices the lines itself from the live product list (never the tablet's numbers); a line
 * that can't be priced any more is still journaled, with no amount. A signed-in staff member only.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { unitPriceFor, type PricingCatalogue, type Serving } from '../../src/lib/registerPricing'
import { toOre } from '../../src/lib/vat'
import { sendJson } from '../http'
import { checkDevice, requireSession, type RegisterAccess } from './access'
import { withJsonBody } from './routeHelpers'

export interface CartEventRouteDeps extends RegisterAccess {
  readCatalogue: () => PricingCatalogue
}

/** The journal's view of cart lines: name, quantity and price from the live catalogue, and their total. */
export function priceCartLines(lines: unknown, catalogue: PricingCatalogue, serving: Serving) {
  const priced = (Array.isArray(lines) ? lines : [])
    .filter((line): line is { productId: string; quantity: number } => typeof line?.productId === 'string' && Number.isInteger(line?.quantity) && line.quantity > 0)
    .map((line) => {
      const product = catalogue.products.find((candidate) => candidate.itemID === line.productId)
      const price = product ? unitPriceFor(product, catalogue, serving) : undefined
      return {
        itemID: line.productId,
        name: product ? product.name.no || product.name.en : line.productId,
        quantity: line.quantity,
        unitPriceOre: price === undefined ? null : toOre(price),
      }
    })
  const amountOre = priced.reduce((sum, line) => sum + (line.unitPriceOre ?? 0) * line.quantity, 0)
  return { lines: priced, amountOre }
}

/** Handles `POST /register/cart-events`; `false` for anything else. */
export function handleCartEventRoute(req: IncomingMessage, res: ServerResponse, url: URL, deps: CartEventRouteDeps): boolean {
  if (req.method !== 'POST' || url.pathname !== '/register/cart-events') return false
  withJsonBody(req, res, (body) => {
    if (!checkDevice(res, deps, body.deviceId)) return
    const session = requireSession(res, deps, body.deviceId, body.sessionToken)
    if (!session) return
    if (body.kind !== 'lineCorrection' && body.kind !== 'void') return sendJson(res, 400, { error: 'Expected kind "lineCorrection" or "void"' })
    if (body.kind === 'lineCorrection' && body.correction !== 'removed' && body.correction !== 'decreased')
      return sendJson(res, 400, { error: 'Expected correction "removed" or "decreased"' })
    const { lines, amountOre } = priceCartLines(body.lines, deps.readCatalogue(), body.serving === 'eatIn' ? 'eatIn' : 'takeaway')
    if (lines.length === 0) return sendJson(res, 400, { error: 'Expected at least one line' })
    deps.journal.append({
      register: session.register,
      actor: session.staffId,
      type: body.kind,
      data: body.kind === 'void' ? { lines, amountOre } : { correction: body.correction, lines, amountOre },
    })
    sendJson(res, 200, { ok: true })
  })
  return true
}
