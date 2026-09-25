// Tests for register cart pricing, the kanban placement rule and counter numbers.
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import type { Catalogue } from '../types/category'
import type { OrderRecord } from '../types/order'
import type { Product } from '../types/product'
import { initialRegisterStatus, nextDisplayNumber, priceCart, type PricingCatalogue } from './registerPricing'

function product(itemID: string, extra: Partial<Product> = {}): Product {
  return {
    itemID,
    category: 'wraps',
    name: { no: `Navn ${itemID}`, en: `Name ${itemID}` },
    description: { no: '', en: '' },
    allergens: [],
    dietaryTags: [],
    available: true,
    ...extra,
  }
}

const catalogues = [{ id: 'menu', name: { no: 'Meny', en: 'Menu' }, categories: [{ id: 'wraps', name: { no: 'Wraps', en: 'Wraps' } }], price: 100 }] as unknown as Catalogue[]

function catalogue(products: Product[]): PricingCatalogue {
  return { products, catalogues, categoryPrices: { wraps: 120 } }
}

test('prices from the live catalogue, with category fallback and discount', () => {
  const result = priceCart(
    [
      { productId: 'a', quantity: 2 },
      { productId: 'b', quantity: 1 },
    ],
    catalogue([product('a', { price: 50 }), product('b', { discount: { type: 'percentage', percentage: 50 } })]),
    'takeaway',
  )
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.deepEqual(
    result.cart.items.map((item) => [item.itemID, item.unitPrice, item.quantity]),
    [
      ['a', 50, 2],
      ['b', 60, 1],
    ],
  )
  assert.equal(result.cart.totalPrice, 160)
})

test('dual prices follow the serving choice', () => {
  const products = [product('a', { price: { takeaway: 40, eatIn: 50 } })]
  const takeaway = priceCart([{ productId: 'a', quantity: 1 }], catalogue(products), 'takeaway')
  const eatIn = priceCart([{ productId: 'a', quantity: 1 }], catalogue(products), 'eatIn')
  assert.equal(takeaway.ok && takeaway.cart.totalPrice, 40)
  assert.equal(eatIn.ok && eatIn.cart.totalPrice, 50)
})

test('duplicate lines merge', () => {
  const result = priceCart(
    [
      { productId: 'a', quantity: 1 },
      { productId: 'a', quantity: 2 },
    ],
    catalogue([product('a', { price: 10 })]),
    'takeaway',
  )
  assert.equal(result.ok && result.cart.items.length, 1)
  assert.equal(result.ok && result.cart.items[0].quantity, 3)
})

test('rejects empty, bad quantity, unknown, priceless and sold-out lines', () => {
  const products = [product('a', { price: 10, trackStock: true, stockQuantity: 0 }), { ...product('p'), category: 'missing' }]
  assert.equal(priceCart([], catalogue(products), 'takeaway').ok, false)
  const reason = (lines: Parameters<typeof priceCart>[0]) => {
    const result = priceCart(lines, catalogue(products), 'takeaway')
    return result.ok ? 'ok' : result.reason
  }
  assert.equal(reason([{ productId: 'a', quantity: 0 }]), 'badQuantity')
  assert.equal(reason([{ productId: 'a', quantity: 1.5 }]), 'badQuantity')
  assert.equal(reason([{ productId: 'zzz', quantity: 1 }]), 'unknownProduct')
  assert.equal(reason([{ productId: 'p', quantity: 1 }]), 'noPrice')
  assert.equal(reason([{ productId: 'a', quantity: 1 }]), 'soldOut')
  assert.equal(reason([{ productId: 'a', quantity: 1, allowSoldOut: true }]), 'ok')
})

test('placement: only ready-to-serve goes to History, anything else to Incoming', () => {
  assert.equal(initialRegisterStatus([product('soda', { readyToServe: true })]), 'completed')
  assert.equal(initialRegisterStatus([product('soda', { readyToServe: true }), product('wrap')]), 'received')
  assert.equal(initialRegisterStatus([]), 'received')
  const result = priceCart(
    [
      { productId: 'soda', quantity: 1 },
      { productId: 'wrap', quantity: 1 },
    ],
    catalogue([product('soda', { price: 30, readyToServe: true }), product('wrap', { price: 120 })]),
    'takeaway',
  )
  assert.equal(result.ok && result.cart.status, 'received')
  assert.deepEqual(result.ok && result.cart.servedAtCounter, ['soda'])
})

test('counter numbers count up per day and restart the next day', () => {
  const order = (displayNumber: string, createdAt: string) => ({ displayNumber, createdAt }) as OrderRecord
  const now = new Date(2026, 8, 25, 12, 0)
  assert.equal(nextDisplayNumber([], now), 'K1')
  const existing = [
    order('K1', new Date(2026, 8, 25, 9, 0).toISOString()),
    order('K7', new Date(2026, 8, 25, 11, 0).toISOString()),
    order('K40', new Date(2026, 8, 24, 11, 0).toISOString()),
  ]
  assert.equal(nextDisplayNumber(existing, now), 'K8')
  assert.equal(nextDisplayNumber(existing, new Date(2026, 8, 26, 8, 0)), 'K1')
})
