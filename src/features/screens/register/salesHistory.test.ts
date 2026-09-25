// Tests for filtering, searching and grouping the register's order history.
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import type { OrderRecord } from '../../../types/order'
import { historyByDay } from './salesHistory'

function order(id: string, createdAt: Date, extra: Partial<OrderRecord> = {}): OrderRecord {
  return {
    id,
    items: [{ itemID: 'x', name: 'Kyllingwrap', quantity: 1, unitPrice: 129 }],
    totalPrice: 129,
    customerName: '',
    customerPhone: '',
    pickupTime: '',
    status: 'completed',
    createdAt: createdAt.toISOString(),
    ...extra,
  }
}

const orders = [
  order('r1', new Date(2026, 8, 24, 10, 0), { source: 'register', displayNumber: 'K1' }),
  order('w1', new Date(2026, 8, 25, 9, 0), { customerName: 'Kari Nordmann' }),
  order('r2', new Date(2026, 8, 25, 11, 0), { source: 'register', displayNumber: 'K7', items: [{ itemID: 's', name: 'Solo', quantity: 1, unitPrice: 35 }] }),
  order('d1', new Date(2026, 8, 25, 12, 0), { source: 'wolt' }),
]

test('groups by day, newest first', () => {
  const { days, total } = historyByDay(orders, 'all', '', 100)
  assert.equal(total, 4)
  assert.deepEqual(
    days.map((day) => [day.day, day.orders.map((o) => o.id)]),
    [
      ['2026-09-25', ['d1', 'r2', 'w1']],
      ['2026-09-24', ['r1']],
    ],
  )
})

test('filters by source', () => {
  const ids = (source: Parameters<typeof historyByDay>[1]) => historyByDay(orders, source, '', 100).days.flatMap((day) => day.orders.map((o) => o.id))
  assert.deepEqual(ids('register'), ['r2', 'r1'])
  assert.deepEqual(ids('website'), ['w1'])
  assert.deepEqual(ids('delivery'), ['d1'])
})

test('searches number, name, receipt id and items', () => {
  const ids = (search: string) => historyByDay(orders, 'all', search, 100).days.flatMap((day) => day.orders.map((o) => o.id))
  assert.deepEqual(ids('k7'), ['r2'])
  assert.deepEqual(ids('kari'), ['w1'])
  assert.deepEqual(ids('solo'), ['r2'])
  assert.deepEqual(ids('W1'), ['w1'])
})

test('the limit caps the list but the total counts every match', () => {
  const result = historyByDay(orders, 'all', '', 2)
  assert.equal(result.total, 4)
  assert.equal(
    result.days.reduce((sum, day) => sum + day.orders.length, 0),
    2,
  )
})
