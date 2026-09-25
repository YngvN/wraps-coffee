// Tests for the pickup QR format and how a scan is matched and decided.
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import type { OrderRecord, OrderStatus } from '../../src/types/order'
import { normalizePickupCode, parsePickupRequest } from '../../src/lib/pickupCode'
import { decidePickup, findPickupOrder } from './pickup'

const ID = '3f2b8c1e-9a4d-4c7e-8f00-1234567890ab'

function order(id: string, pickupCode: string | undefined, status: OrderStatus = 'ready'): OrderRecord {
  return { id, pickupCode, status, items: [], totalPrice: 0, customerName: 'Kari', customerPhone: '', pickupTime: '12:00', createdAt: '2026-09-25T10:00:00Z' }
}

test('parses a QR payload and a typed code, forgiving common mix-ups', () => {
  assert.deepEqual(parsePickupRequest(`WRAPS-PICKUP:${ID}:7K3M9Q2A`), { kind: 'qr', orderId: ID, code: '7K3M9Q2A' })
  assert.deepEqual(parsePickupRequest(`wraps-pickup:${ID.toUpperCase()}:7k3m9q2a`), { kind: 'qr', orderId: ID, code: '7K3M9Q2A' })
  assert.deepEqual(parsePickupRequest(' 7k3m-9q2a '), { kind: 'code', code: '7K3M9Q2A' })
  assert.equal(normalizePickupCode('O1LI2345'), '01112345')
})

test('rejects anything that is not a pickup request', () => {
  assert.equal(parsePickupRequest('5449000000996'), null)
  assert.equal(parsePickupRequest('WRAPS-PICKUP:'), null)
  assert.equal(parsePickupRequest(`WRAPS-PICKUP:${ID}`), null)
  assert.equal(parsePickupRequest('WRAPS-PICKUP:not an id:7K3M9Q2A'), null)
  assert.equal(parsePickupRequest('7K3M9Q2'), null)
  assert.equal(parsePickupRequest('7K3M9Q2U'), null)
})

test('a QR matches only when both id and code match', () => {
  const orders = [order(ID, '7K3M9Q2A')]
  assert.equal(findPickupOrder(orders, { kind: 'qr', orderId: ID, code: '7K3M9Q2A' })?.id, ID)
  assert.equal(findPickupOrder(orders, { kind: 'qr', orderId: ID, code: '7K3M9Q2B' }), undefined)
  assert.equal(findPickupOrder([order(ID, undefined)], { kind: 'qr', orderId: ID, code: '7K3M9Q2A' }), undefined)
})

test('a typed code prefers the open order', () => {
  const orders = [order('old', '7K3M9Q2A', 'completed'), order('new', '7K3M9Q2A', 'ready')]
  assert.equal(findPickupOrder(orders, { kind: 'code', code: '7K3M9Q2A' })?.id, 'new')
  assert.equal(findPickupOrder([order('old', '7K3M9Q2A', 'completed')], { kind: 'code', code: '7K3M9Q2A' })?.id, 'old')
})

test('decisions: ready completes, early needs force, repeats and cancelled change nothing', () => {
  assert.deepEqual(decidePickup(order(ID, 'X', 'ready'), false), { action: 'complete' })
  assert.deepEqual(decidePickup(order(ID, 'X', 'preparing'), false), { action: 'confirmNotReady', status: 'preparing' })
  assert.deepEqual(decidePickup(order(ID, 'X', 'preparing'), true), { action: 'complete' })
  assert.deepEqual(decidePickup(order(ID, 'X', 'completed'), true), { action: 'alreadyCompleted' })
  assert.deepEqual(decidePickup(order(ID, 'X', 'cancelled'), true), { action: 'cancelled' })
})

test('5-character codes (the current format) parse, with or without #, and 8-character ones still do', () => {
  assert.deepEqual(parsePickupRequest('#k7m2q'), { kind: 'code', code: 'K7M2Q' })
  assert.deepEqual(parsePickupRequest(`WRAPS-PICKUP:${ID}:K7M2Q`), { kind: 'qr', orderId: ID, code: 'K7M2Q' })
  assert.deepEqual(parsePickupRequest('CBGKF40T'), { kind: 'code', code: 'CBGKF40T' })
  assert.equal(parsePickupRequest('K7M2'), null)
  assert.equal(parsePickupRequest('K7M2Q9'), null)
})
