// Tests for creating register orders: idempotency, price checks and what lands in the store.
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import type { Catalogue } from '../../src/types/category'
import type { OrderRecord } from '../../src/types/order'
import type { Product } from '../../src/types/product'
import { createRegisterOrder, type RegisterOrderDeps, type RegisterOrderInput } from './orders'

const products: Product[] = [
  {
    itemID: 'soda',
    category: 'c',
    name: { no: 'Brus', en: 'Soda' },
    description: { no: '', en: '' },
    allergens: [],
    dietaryTags: [],
    available: true,
    price: 30,
    readyToServe: true,
  },
  { itemID: 'wrap', category: 'c', name: { no: 'Wrap', en: 'Wrap' }, description: { no: '', en: '' }, allergens: [], dietaryTags: [], available: true, price: 120 },
]

function makeDeps(initial: OrderRecord[] = []) {
  const store = { orders: initial, writes: 0, journaled: 0 }
  let nextId = 1
  const deps: RegisterOrderDeps = {
    readOrders: () => store.orders,
    writeOrders: (orders) => {
      store.orders = orders
      store.writes++
    },
    readCatalogue: () => ({ products, catalogues: [] as Catalogue[], categoryPrices: {} }),
    now: () => new Date(2026, 8, 25, 12, 0),
    newId: () => `id-${nextId++}`,
    journalSale: () => ({ number: ++store.journaled, journalSeq: store.journaled, at: '2026-09-25T10:00:00.000Z' }),
  }
  return { store, deps }
}

function input(extra: Partial<RegisterOrderInput> = {}): RegisterOrderInput {
  return { clientOrderId: 'c1', lines: [{ productId: 'soda', quantity: 2 }], serving: 'takeaway', expectedTotal: 60, payment: { method: 'cash' }, registerNumber: 1, ...extra }
}

test('creates a paid, numbered register order straight into History when all ready-made', () => {
  const { store, deps } = makeDeps()
  const result = createRegisterOrder(deps, input())
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.created, true)
  assert.equal(store.orders.length, 1)
  const order = store.orders[0]
  assert.equal(order.source, 'register')
  assert.equal(order.status, 'completed')
  assert.equal(order.displayNumber, 'K1')
  assert.equal(order.customerPhone, '')
  assert.deepEqual(order.payment, { method: 'cash', amount: 60, paidAt: new Date(2026, 8, 25, 12, 0).toISOString() })
})

test('an order with something to make starts in Incoming', () => {
  const { store, deps } = makeDeps()
  createRegisterOrder(
    deps,
    input({
      lines: [
        { productId: 'soda', quantity: 1 },
        { productId: 'wrap', quantity: 1 },
      ],
      expectedTotal: 150,
    }),
  )
  assert.equal(store.orders[0].status, 'received')
  assert.deepEqual(store.orders[0].servedAtCounter, ['soda'])
})

test('the same clientOrderId never sells twice', () => {
  const { store, deps } = makeDeps()
  createRegisterOrder(deps, input())
  const again = createRegisterOrder(deps, input())
  assert.equal(again.ok && again.created, false)
  assert.equal(store.orders.length, 1)
  assert.equal(store.writes, 1)
})

test('a changed price sells nothing and reports the new total', () => {
  const { store, deps } = makeDeps()
  const result = createRegisterOrder(deps, input({ expectedTotal: 50 }))
  assert.deepEqual(result, { ok: false, reason: 'priceChanged', totalPrice: 60 })
  assert.equal(store.orders.length, 0)
})

test('keeps orders written before it and numbers after them', () => {
  const earlier = { id: 'x', displayNumber: 'K4', createdAt: new Date(2026, 8, 25, 9, 0).toISOString() } as OrderRecord
  const { store, deps } = makeDeps([earlier])
  createRegisterOrder(deps, input({ customerName: '  Kari  ' }))
  assert.equal(store.orders.length, 2)
  assert.equal(store.orders[1].displayNumber, 'K5')
  assert.equal(store.orders[1].customerName, 'Kari')
})

test('a new sale is journaled once, and its receipt number is saved on the order', () => {
  const { store, deps } = makeDeps()
  const first = createRegisterOrder(deps, input())
  assert.equal(first.ok && first.order.receipt?.number, 1)
  const repeat = createRegisterOrder(deps, input())
  assert.equal(repeat.ok && repeat.created, false)
  assert.equal(store.journaled, 1)
})
