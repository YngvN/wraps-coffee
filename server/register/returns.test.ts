// Tests for returns against a register sale.
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import type { OrderRecord } from '../../src/types/order'
import { planReturn, returnableQuantities, returnJournalInput } from './returns'

const sale = {
  id: 'o1',
  source: 'register',
  registerNumber: 1,
  items: [
    { itemID: 'wrap', name: 'Wrap', quantity: 2, unitPrice: 149, vatRate: 15 },
    { itemID: 'mug', name: 'Krus', quantity: 1, unitPrice: 99, vatRate: 25 },
  ],
  totalPrice: 397,
  payment: { method: 'card', amount: 397, paidAt: '' },
  receipt: { number: 12, journalSeq: 40, at: '' },
} as unknown as OrderRecord

test('a partial return is priced from the sale, with negative amounts and VAT', () => {
  const plan = planReturn(sale, [{ itemID: 'wrap', quantity: 1 }], 'complaint', '')
  assert.equal(plan.ok, true)
  if (!plan.ok) return
  const input = returnJournalInput(sale, plan, 1, 'ola')
  assert.equal(input.type, 'return')
  assert.equal(input.data.totalOre, -14900)
  assert.equal(input.data.originalReceiptNumber, 12)
  // 14900 at 15 %: VAT 1943
  assert.deepEqual(input.amounts, { inOre: -14900, exOre: -14900 + 1943 })
  assert.deepEqual(input.data.payments, [{ method: 'card', provider: undefined, reference: undefined, amountOre: -14900 }])
})

test('never more of a line than is left, counting earlier returns', () => {
  const partly = {
    ...sale,
    returns: [{ number: 1, journalSeq: 41, at: '', lines: [{ itemID: 'wrap', quantity: 1 }], totalOre: -14900, reason: 'complaint', method: 'card' }],
  } as OrderRecord
  assert.equal(returnableQuantities(partly).get('wrap'), 1)
  assert.deepEqual(planReturn(partly, [{ itemID: 'wrap', quantity: 2 }], 'complaint', ''), { ok: false, reason: 'tooMany', itemID: 'wrap' })
  assert.equal(planReturn(partly, [{ itemID: 'wrap', quantity: 1 }], 'complaint', '').ok, true)
})

test('refuses nothing, unknown lines, a missing reason, and "other" without a note', () => {
  assert.deepEqual(planReturn(sale, [{ itemID: 'wrap', quantity: 0 }], 'complaint', ''), { ok: false, reason: 'nothingToReturn' })
  assert.deepEqual(planReturn(sale, [{ itemID: 'soda', quantity: 1 }], 'complaint', ''), { ok: false, reason: 'unknownLine', itemID: 'soda' })
  assert.deepEqual(planReturn(sale, [{ itemID: 'wrap', quantity: 1 }], 'because', ''), { ok: false, reason: 'badReason' })
  assert.deepEqual(planReturn(sale, [{ itemID: 'wrap', quantity: 1 }], 'other', '  '), { ok: false, reason: 'badReason' })
  assert.equal(planReturn(sale, [{ itemID: 'wrap', quantity: 1 }], 'other', 'Kald').ok, true)
})

test('only a receipted register sale can be returned', () => {
  assert.deepEqual(planReturn({ ...sale, source: 'website' }, [{ itemID: 'wrap', quantity: 1 }], 'complaint', ''), { ok: false, reason: 'notReturnable' })
  assert.deepEqual(planReturn({ ...sale, receipt: undefined }, [{ itemID: 'wrap', quantity: 1 }], 'complaint', ''), { ok: false, reason: 'notReturnable' })
})

test('a return puts stock back, only for products that track it', async () => {
  const { restockReturn } = await import('./returnRoutes')
  const products = [
    { itemID: 'wrap', trackStock: true, stockQuantity: 3 },
    { itemID: 'mug', stockQuantity: 5 },
  ] as never
  const lines = [
    { itemID: 'wrap', name: 'Wrap', quantity: 2, unitPriceOre: 14900, vatRate: 15 },
    { itemID: 'mug', name: 'Krus', quantity: 1, unitPriceOre: 9900, vatRate: 25 },
  ]
  const next = restockReturn(products, lines) as unknown as { itemID: string; stockQuantity?: number }[]
  assert.deepEqual(
    next.map((product) => [product.itemID, product.stockQuantity]),
    [
      ['wrap', 5],
      ['mug', 5],
    ],
  )
})
