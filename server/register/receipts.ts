/**
 * The register's legal receipts on the server side: what a print of a sale is allowed to be, and the
 * receipt's content, taken from the sale's journal entry (never from the live product list or the
 * editable order). A sale's first print is its original ("Salgskvittering"); the next is its one
 * allowed copy ("KOPI", journaled as its own signed `copy` transaction); after that the register
 * refuses (kassasystemforskrifta § 2-6: no more than one copy).
 */
import type { LegalReceiptData } from '../../src/lib/receipt/legalReceipt'
import type { VatLine } from '../../src/lib/vat'
import type { JournalEntry } from '../../src/types/journal'
import type { OrderRecord, PaymentMethod } from '../../src/types/order'
import type { StoreLegalDetails } from '../../src/types/storeSettings'

/** What printing a sale's receipt now would be. */
export type ReceiptPrintKind = 'original' | 'copy' | 'copyLimit'

/** The original first, then one copy, then no more. */
export function nextReceiptPrint(order: OrderRecord): ReceiptPrintKind {
  if (!order.receipt?.printedAt) return 'original'
  if (!order.receipt.copyPrintedAt) return 'copy'
  return 'copyLimit'
}

/** A sale journal entry's `data`, as `saleJournalInput` wrote it. */
interface SaleData {
  displayNumber?: string
  lines: { name: string; quantity: number; unitPriceOre: number; vatRate: number }[]
  payments: { method: PaymentMethod; amountOre: number; reference?: string }[]
  totalOre: number
  vat: VatLine[]
}

/** The receipt for sale `entry`: the original, or (with `copy`) the copy numbered `copy.number`. */
export function saleReceiptData(
  entry: JournalEntry,
  context: { legal: StoreLegalDetails; storeName: string; register: { number: number; name: string }; cashier: string },
  copy?: { number: number; printedAt: Date },
): LegalReceiptData {
  const data = entry.data as unknown as SaleData
  return {
    kind: copy ? 'copy' : 'sale',
    legal: context.legal,
    storeName: context.storeName,
    register: context.register,
    cashier: context.cashier,
    receiptNumber: copy ? copy.number : (entry.receiptNumber ?? 0),
    originalReceiptNumber: copy ? entry.receiptNumber : undefined,
    at: new Date(entry.at),
    printedAt: copy?.printedAt,
    displayNumber: data.displayNumber,
    lines: data.lines,
    totalOre: data.totalOre,
    vat: data.vat,
    payments: data.payments,
  }
}
