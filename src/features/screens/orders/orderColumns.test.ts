// Tests for the order board's pure column/status/lane/label helpers.
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import type { OrderRecord, OrderStatus } from '../../../types/order'
import {
  ageLevel,
  columnOf,
  customerOrderLabel,
  filterBySources,
  historyOrders,
  laneOf,
  matchesNoteKeyword,
  minutesSince,
  nextStatus,
  prevStatus,
  sortByPickup,
  summariseItems,
} from './orderColumns'

function order(id: string, status: OrderStatus = 'received', extra: Partial<OrderRecord> = {}): OrderRecord {
  return { id, items: [], totalPrice: 0, customerName: 'A', customerPhone: '', pickupTime: '12:00', status, createdAt: '2026-09-25T10:00:00.000Z', ...extra }
}

test('columnOf maps every status', () => {
  assert.deepEqual((['received', 'accepted', 'preparing', 'ready', 'completed', 'cancelled'] as OrderStatus[]).map(columnOf), [
    'incoming',
    'incoming',
    'doing',
    'done',
    'history',
    'history',
  ])
})

test('nextStatus and prevStatus walk the board, and stop at the ends', () => {
  const all: OrderStatus[] = ['received', 'accepted', 'preparing', 'ready', 'completed', 'cancelled']
  assert.deepEqual(all.map(nextStatus), ['preparing', 'preparing', 'ready', 'completed', undefined, undefined])
  assert.deepEqual(all.map(prevStatus), [undefined, undefined, 'received', 'preparing', 'ready', 'ready'])
})

test('laneOf puts delivery platforms in the delivery lane', () => {
  assert.equal(laneOf(order('a')), 'pickup')
  assert.equal(laneOf(order('a', 'received', { source: 'website' })), 'pickup')
  assert.equal(laneOf(order('a', 'received', { source: 'wolt' })), 'delivery')
  assert.equal(laneOf(order('a', 'received', { source: 'foodora' })), 'delivery')
})

test('filterBySources: unset or empty keeps all, missing source counts as website', () => {
  const orders = [order('w'), order('x', 'received', { source: 'wolt' })]
  assert.equal(filterBySources(orders, undefined).length, 2)
  assert.equal(filterBySources(orders, []).length, 2)
  assert.deepEqual(
    filterBySources(orders, ['website']).map((o) => o.id),
    ['w'],
  )
})

test('sortByPickup sorts by pickup then createdAt, without mutating', () => {
  const input = [
    order('late', 'received', { pickupTime: '13:00' }),
    order('tie-b', 'received', { pickupTime: '12:00', createdAt: '2026-09-25T10:05:00.000Z' }),
    order('tie-a', 'received', { pickupTime: '12:00', createdAt: '2026-09-25T10:01:00.000Z' }),
  ]
  const before = input.map((o) => o.id)
  assert.deepEqual(
    sortByPickup(input).map((o) => o.id),
    ['tie-a', 'tie-b', 'late'],
  )
  assert.deepEqual(
    input.map((o) => o.id),
    before,
  )
})

test('historyOrders keeps finished orders since the later of midnight and now - hours, newest first', () => {
  const now = new Date(2026, 8, 25, 14, 0)
  const at = (h: number, m = 0, day = 25) => new Date(2026, 8, day, h, m).toISOString()
  const orders = [
    order('early-today', 'completed', { createdAt: at(3) }),
    order('before-cutoff', 'completed', { createdAt: at(1) }),
    order('yesterday', 'completed', { createdAt: at(23, 0, 24) }),
    order('still-ready', 'ready', { createdAt: at(13) }),
    order('eleven', 'cancelled', { createdAt: at(11) }),
    order('half-twelve', 'cancelled', { createdAt: at(12, 30) }),
  ]
  assert.deepEqual(
    historyOrders(orders, now, 12).map((o) => o.id),
    ['half-twelve', 'eleven', 'early-today'],
  )
  assert.deepEqual(
    historyOrders(orders, now, 2).map((o) => o.id),
    ['half-twelve'],
  )
})

test('minutesSince floors and never goes negative', () => {
  const now = new Date('2026-09-25T12:00:00.000Z')
  assert.equal(minutesSince('2026-09-25T11:58:30.000Z', now), 1)
  assert.equal(minutesSince('2026-09-25T12:05:00.000Z', now), 0)
})

test('ageLevel thresholds are inclusive', () => {
  assert.deepEqual(
    [9, 10, 19, 20].map((m) => ageLevel(m, [10, 20])),
    ['ok', 'warn', 'warn', 'late'],
  )
})

test('matchesNoteKeyword is a case-insensitive substring match that ignores blank keywords', () => {
  assert.equal(matchesNoteKeyword('Nut ALLERGY', ['allergy']), true)
  assert.equal(matchesNoteKeyword('Nøtteallergi!', ['nøtt']), true)
  assert.equal(matchesNoteKeyword(undefined, ['allergy']), false)
  assert.equal(matchesNoteKeyword('anything', ['  ']), false)
  assert.equal(matchesNoteKeyword('extra shot', ['allergy']), false)
})

test('summariseItems sums by trimmed name, most first, ties by name', () => {
  const item = (name: string, quantity: number) => ({ itemID: name, name, quantity, unitPrice: 0 })
  const orders = [order('a', 'preparing', { items: [item(' Latte ', 2), item('Wrap', 3)] }), order('b', 'preparing', { items: [item('Latte', 1)] })]
  assert.deepEqual(summariseItems(orders), [
    { name: 'Latte', quantity: 3 },
    { name: 'Wrap', quantity: 3 },
  ])
})

test('customerOrderLabel shortens the surname and takes the id tail', () => {
  assert.deepEqual(customerOrderLabel(order('abc123xyz', 'ready', { customerName: 'Ola Nordmann' })), { name: 'Ola N.', number: '3XYZ' })
  assert.equal(customerOrderLabel(order('x', 'ready', { customerName: 'Kari' })).name, 'Kari')
  assert.equal(customerOrderLabel(order('x', 'ready', { customerName: '  ' })).name, '')
  assert.equal(customerOrderLabel(order('x', 'ready', { customerName: 'anne marie berg' })).name, 'anne B.')
  assert.equal(customerOrderLabel(order('ab')).number, 'AB')
})

test('register orders: counter number as label, counter-served items not in To make', () => {
  const base = { items: [], totalPrice: 0, customerName: '', customerPhone: '', pickupTime: '', status: 'preparing' as const, createdAt: '2026-09-25T10:00:00Z' }
  assert.equal(customerOrderLabel({ ...base, id: 'abcdef', displayNumber: 'K12' }).number, 'K12')
  const order = {
    ...base,
    id: 'r1',
    servedAtCounter: ['soda'],
    items: [
      { itemID: 'soda', name: 'Brus', quantity: 2, unitPrice: 30 },
      { itemID: 'wrap', name: 'Wrap', quantity: 1, unitPrice: 120 },
    ],
  }
  assert.deepEqual(summariseItems([order]), [{ name: 'Wrap', quantity: 1 }])
})
