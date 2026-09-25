// Tests for clearing customer details from orders older than seven days.
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import type { OrderRecord } from '../types/order'
import { ORDER_PERSONAL_DATA_RETENTION_MS, anonymiseExpiredOrders, anonymiseIfExpired } from './orderRetention'

const now = new Date('2026-09-25T12:00:00Z')

function order(ageMs: number, extra: Partial<OrderRecord> = {}): OrderRecord {
  return {
    id: 'o1',
    items: [{ itemID: 'wrap', name: 'Wrap', quantity: 1, unitPrice: 120 }],
    totalPrice: 120,
    customerName: 'Kari Nordmann',
    customerPhone: '+47 912 34 567',
    notes: 'Ring Kari på 912 34 567',
    pickupTime: '12:00',
    status: 'completed',
    createdAt: new Date(now.getTime() - ageMs).toISOString(),
    ...extra,
  }
}

test('an order younger than seven days is untouched', () => {
  const recent = order(ORDER_PERSONAL_DATA_RETENTION_MS - 60 * 60_000)
  assert.equal(anonymiseIfExpired(recent, now), recent)
})

test('an older order loses name, phone and notes but keeps the sale', () => {
  const old = order(8 * 24 * 60 * 60_000)
  const cleared = anonymiseIfExpired(old, now)
  assert.equal(cleared.customerName, '')
  assert.equal(cleared.customerPhone, '')
  assert.equal('notes' in cleared, false)
  assert.equal(cleared.anonymisedAt, now.toISOString())
  assert.deepEqual(cleared.items, old.items)
  assert.equal(cleared.totalPrice, 120)
  assert.equal(cleared.status, 'completed')
})

test('re-running is a no-op, whatever the status', () => {
  const cleared = anonymiseIfExpired(order(8 * 24 * 60 * 60_000, { status: 'preparing' }), now)
  assert.equal(cleared.customerName, '')
  assert.equal(anonymiseIfExpired(cleared, new Date(now.getTime() + 60_000)), cleared)
})

test('a list is only replaced when something changed', () => {
  const recent = [order(1000)]
  assert.equal(anonymiseExpiredOrders(recent, now), recent)
  const mixed = [order(1000), order(9 * 24 * 60 * 60_000, { id: 'o2' })]
  const next = anonymiseExpiredOrders(mixed, now)
  assert.notEqual(next, mixed)
  assert.equal(next[0], mixed[0])
  assert.equal(next[1].customerName, '')
})

test('an unparseable date is left alone rather than guessed', () => {
  const odd = order(0, { createdAt: 'not a date' })
  assert.equal(anonymiseIfExpired(odd, now), odd)
})
