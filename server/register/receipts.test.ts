// Tests for which print of a sale is allowed, and the receipt built from its journal entry.
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import type { JournalEntry } from '../../src/types/journal'
import type { OrderRecord } from '../../src/types/order'
import { nextReceiptPrint, saleReceiptData } from './receipts'

const order = (receipt?: OrderRecord['receipt']) => ({ id: 'o1', receipt }) as OrderRecord

test('the original prints first, then one copy, then nothing', () => {
  const base = { number: 3, journalSeq: 9, at: '2026-09-25T12:00:00Z' }
  assert.equal(nextReceiptPrint(order(base)), 'original')
  assert.equal(nextReceiptPrint(order({ ...base, printedAt: '2026-09-25T12:00:05Z' })), 'copy')
  assert.equal(nextReceiptPrint(order({ ...base, printedAt: 'x', copyPrintedAt: 'y' })), 'copyLimit')
})

test('the receipt comes from the journal entry, and a copy points back at the original number', () => {
  const entry = {
    seq: 9,
    at: '2026-09-25T12:00:00.000Z',
    type: 'sale',
    receiptNumber: 3,
    data: {
      displayNumber: 'K2',
      lines: [{ name: 'Wrap', quantity: 1, unitPriceOre: 14900, vatRate: 15 }],
      payments: [{ method: 'cash', amountOre: 14900 }],
      totalOre: 14900,
      vat: [],
    },
  } as unknown as JournalEntry
  const context = { legal: {} as never, storeName: 'Wraps', register: { number: 1, name: 'Kasse 1' }, cashier: 'Kari' }
  const original = saleReceiptData(entry, context)
  assert.equal(original.kind, 'sale')
  assert.equal(original.receiptNumber, 3)
  assert.equal(original.displayNumber, 'K2')
  const copy = saleReceiptData(entry, context, { number: 1, printedAt: new Date('2026-09-25T13:00:00Z') })
  assert.equal(copy.kind, 'copy')
  assert.equal(copy.receiptNumber, 1)
  assert.equal(copy.originalReceiptNumber, 3)
})
