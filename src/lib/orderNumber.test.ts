// Tests for the one short number each order is known by.
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import type { OrderRecord } from '../types/order'
import { orderNumber } from './orderNumber'

function order(extra: Partial<OrderRecord>): OrderRecord {
  return {
    id: '3f2b8c1e-9a4d-4c7e-8f00-1234567890ab',
    items: [],
    totalPrice: 0,
    customerName: '',
    customerPhone: '',
    pickupTime: '',
    status: 'received',
    createdAt: '2026-09-25T10:00:00Z',
    ...extra,
  }
}

test('each source has its own recognisable number', () => {
  assert.equal(orderNumber(order({ pickupCode: 'k7m2q' })), 'K7M2Q')
  assert.equal(orderNumber(order({ source: 'wolt', externalId: 'w-88213' })), 'W8213')
  assert.equal(orderNumber(order({ source: 'foodora', id: 'fd-7f3a' })), 'F7F3A')
  assert.equal(orderNumber(order({ source: 'register', displayNumber: 'K12' })), 'K12')
  assert.equal(orderNumber(order({})), '90AB')
})
