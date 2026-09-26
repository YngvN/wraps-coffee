// Tests for the journal entry of a register sale.
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import type { OrderRecord } from '../../src/types/order'
import { saleJournalInput } from './saleJournal'

const order = {
  id: 'o1',
  source: 'register',
  displayNumber: 'K3',
  serving: 'takeaway',
  customerName: 'Kari Nordmann',
  customerPhone: '',
  items: [
    { itemID: 'wrap', name: 'Wrap', quantity: 2, unitPrice: 149, vatRate: 15 },
    { itemID: 'mug', name: 'Krus', quantity: 1, unitPrice: 99, vatRate: 25 },
  ],
  totalPrice: 397,
  payment: { method: 'card', amount: 397, paidAt: '' },
} as unknown as OrderRecord

test('a sale records øre, VAT per rate and the payment, and signs gross and net amounts', () => {
  const input = saleJournalInput(order, 1, 'kari')
  assert.equal(input.type, 'sale')
  assert.equal(input.register, 1)
  assert.equal(input.actor, 'kari')
  assert.equal(input.data.totalOre, 39700)
  // 29800 at 15 % → VAT 3887; 9900 at 25 % → VAT 1980
  assert.deepEqual(input.data.vat, [
    { ratePercent: 25, basisOre: 7920, vatOre: 1980, grossOre: 9900 },
    { ratePercent: 15, basisOre: 25913, vatOre: 3887, grossOre: 29800 },
  ])
  assert.deepEqual(input.amounts, { inOre: 39700, exOre: 39700 - 1980 - 3887 })
})

test('no customer name or phone goes into the journal', () => {
  assert.equal(JSON.stringify(saleJournalInput(order, 1, 'kari')).includes('Nordmann'), false)
})
