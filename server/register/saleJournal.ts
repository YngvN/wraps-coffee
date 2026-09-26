/**
 * Turns a paid register order into its journal entry: a signed `sale` with every line, the payment
 * and the VAT per rate, all in øre. The journal entry, not the order, is the legal record; the order in
 * `admin.registerOrders` only drives the kanban and the history. No customer name goes in.
 */
import type { OrderRecord } from '../../src/types/order'
import { toOre, vatBreakdown } from '../../src/lib/vat'
import type { JournalInput } from '../journal/journal'

/** A product group for the X/Z reports: the product's category (or its catalogue when it has none). */
export interface ProductGroup {
  id: string
  name: string
}

/**
 * The journal entry for `order`, sold by `staffId` on `register`. `groupOf` names each line's product
 * group as it is at the moment of sale, so a report never changes when a product is moved later.
 */
export function saleJournalInput(order: OrderRecord, register: number, staffId: string | null, groupOf: (itemID: string) => ProductGroup | undefined = () => undefined): JournalInput {
  const lines = order.items.map((item) => ({
    itemID: item.itemID,
    name: item.name,
    quantity: item.quantity,
    unitPriceOre: toOre(item.unitPrice),
    vatRate: item.vatRate ?? 0,
    group: groupOf(item.itemID),
  }))
  const vat = vatBreakdown(lines.map((line) => ({ grossOre: line.unitPriceOre * line.quantity, ratePercent: line.vatRate })))
  const totalOre = vat.reduce((sum, line) => sum + line.grossOre, 0)
  const vatOre = vat.reduce((sum, line) => sum + line.vatOre, 0)
  const payments = order.payment ? [{ method: order.payment.method, provider: order.payment.provider, reference: order.payment.reference, amountOre: totalOre }] : []
  return {
    register,
    actor: staffId,
    type: 'sale',
    data: { orderId: order.id, displayNumber: order.displayNumber, serving: order.serving, lines, payments, totalOre, vat },
    amounts: { inOre: totalOre, exOre: totalOre - vatOre },
  }
}
