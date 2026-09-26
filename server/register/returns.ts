/**
 * Returns against a register sale (kassasystemforskrifta § 2-8-5): a return is never an edit of the
 * sale. It's its own signed journal entry and "Returkvittering", with negative amounts, linked to the
 * original receipt, giving a reason, and refunded the way the sale was paid. A sale can be returned in
 * parts, but never more of a line than was sold; prices and VAT rates come from the sale itself, never
 * from today's product list.
 */
import { toOre, vatBreakdown } from '../../src/lib/vat'
import type { OrderRecord, ReturnReason } from '../../src/types/order'
import type { JournalInput } from '../journal/journal'

export const RETURN_REASONS: readonly ReturnReason[] = ['wrongItem', 'complaint', 'changedMind', 'other']
const MAX_NOTE_LENGTH = 200

/** One line of a planned return, priced from the sale. */
export interface ReturnLine {
  itemID: string
  name: string
  quantity: number
  unitPriceOre: number
  vatRate: number
}

export type ReturnError = 'notReturnable' | 'nothingToReturn' | 'tooMany' | 'unknownLine' | 'badReason'

/** How many of each line of `order` haven't been returned yet. */
export function returnableQuantities(order: OrderRecord): Map<string, number> {
  const left = new Map(order.items.map((item) => [item.itemID, item.quantity]))
  for (const done of order.returns ?? []) for (const line of done.lines) left.set(line.itemID, (left.get(line.itemID) ?? 0) - line.quantity)
  return left
}

/** Checks a requested return against what's left of the sale and prices it from the sale's own lines. */
export function planReturn(
  order: OrderRecord,
  requested: { itemID: unknown; quantity: unknown }[],
  reason: unknown,
  note: unknown,
): { ok: true; lines: ReturnLine[]; reason: ReturnReason; note: string } | { ok: false; reason: ReturnError; itemID?: string } {
  if (order.source !== 'register' || !order.receipt || !order.payment) return { ok: false, reason: 'notReturnable' }
  if (!RETURN_REASONS.includes(reason as ReturnReason)) return { ok: false, reason: 'badReason' }
  const cleanNote = typeof note === 'string' ? note.trim().slice(0, MAX_NOTE_LENGTH) : ''
  if (reason === 'other' && !cleanNote) return { ok: false, reason: 'badReason' }
  const left = returnableQuantities(order)
  const lines: ReturnLine[] = []
  for (const { itemID, quantity } of requested) {
    const item = order.items.find((candidate) => candidate.itemID === itemID)
    if (!item || typeof itemID !== 'string') return { ok: false, reason: 'unknownLine', itemID: String(itemID) }
    if (!Number.isInteger(quantity) || (quantity as number) < 1) continue
    if ((quantity as number) > (left.get(itemID) ?? 0)) return { ok: false, reason: 'tooMany', itemID }
    lines.push({ itemID, name: item.name, quantity: quantity as number, unitPriceOre: toOre(item.unitPrice), vatRate: item.vatRate ?? 0 })
  }
  if (lines.length === 0) return { ok: false, reason: 'nothingToReturn' }
  return { ok: true, lines, reason: reason as ReturnReason, note: cleanNote }
}

/** The journal entry for a planned return: negative amounts and VAT, refunded by the sale's payment method. */
export function returnJournalInput(order: OrderRecord, plan: { lines: ReturnLine[]; reason: ReturnReason; note: string }, register: number, staffId: string): JournalInput {
  const vat = vatBreakdown(plan.lines.map((line) => ({ grossOre: -line.unitPriceOre * line.quantity, ratePercent: line.vatRate })))
  const totalOre = vat.reduce((sum, line) => sum + line.grossOre, 0)
  const vatOre = vat.reduce((sum, line) => sum + line.vatOre, 0)
  return {
    register,
    actor: staffId,
    type: 'return',
    data: {
      orderId: order.id,
      originalReceiptNumber: order.receipt?.number,
      originalRegister: order.registerNumber,
      originalSeq: order.receipt?.journalSeq,
      reason: plan.reason,
      note: plan.note || undefined,
      lines: plan.lines,
      payments: [{ method: order.payment?.method, provider: order.payment?.provider, reference: order.payment?.reference, amountOre: totalOre }],
      totalOre,
      vat,
    },
    amounts: { inOre: totalOre, exOre: totalOre - vatOre },
  }
}
