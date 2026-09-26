// Tests for adding and editing products from a register, by a manager.
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import type { Catalogue } from '../../src/types/category'
import type { Product } from '../../src/types/product'
import { upsertRegisterProduct } from './products'

const catalogues = [{ id: 'drinks', name: { no: 'Drikke', en: 'Drinks' }, categories: [{ id: 'soda', name: { no: 'Brus', en: 'Soda' } }] }] as unknown as Catalogue[]

const cola: Product = {
  itemID: 'cola',
  category: 'soda',
  name: { no: 'Cola', en: 'Cola' },
  description: { no: 'Kald', en: 'Cold' },
  allergens: [],
  dietaryTags: ['vegan'] as Product['dietaryTags'],
  available: true,
  price: 30,
  barcode: '5449000000996',
}

const newId = () => 'new-1'

test('creates a product with safe defaults', () => {
  const result = upsertRegisterProduct([cola], catalogues, { name: { no: 'Solo', en: '' }, price: 35, barcode: '96385074', category: 'soda', readyToServe: true }, newId)
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.products.length, 2)
  assert.deepEqual(result.product, {
    itemID: 'new-1',
    name: { no: 'Solo', en: '' },
    description: { no: '', en: '' },
    allergens: [],
    dietaryTags: [],
    available: true,
    price: 35,
    barcode: '96385074',
    readyToServe: true,
    category: 'soda',
  })
})

test('editing keeps the fields a register cannot touch', () => {
  const result = upsertRegisterProduct(
    [cola],
    catalogues,
    { itemID: 'cola', name: { no: 'Cola Zero', en: 'Cola Zero' }, price: 32, category: 'soda', barcode: '5449000000996' },
    newId,
  )
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.deepEqual(result.product.description, cola.description)
  assert.deepEqual(result.product.dietaryTags, cola.dietaryTags)
  assert.equal(result.product.price, 32)
})

test('refuses bad input', () => {
  const reason = (input: Parameters<typeof upsertRegisterProduct>[2]) => {
    const result = upsertRegisterProduct([cola], catalogues, input, newId)
    return result.ok ? 'ok' : result.reason
  }
  assert.equal(reason({ itemID: 'nope', name: { no: 'X', en: '' }, category: 'soda' }), 'unknownProduct')
  assert.equal(reason({ name: { no: '  ', en: '' }, category: 'soda' }), 'noName')
  assert.equal(reason({ name: { no: 'X', en: '' }, price: -1, category: 'soda' }), 'badPrice')
  assert.equal(reason({ name: { no: 'X', en: '' }, price: { takeaway: 10 } as never, category: 'soda' }), 'badPrice')
  assert.equal(reason({ name: { no: 'X', en: '' }, barcode: '5449000000997', category: 'soda' }), 'badBarcode')
  assert.equal(reason({ name: { no: 'X', en: '' }, barcode: '5449000000996', category: 'soda' }), 'duplicateBarcode')
  assert.equal(reason({ name: { no: 'X', en: '' } }), 'badPlacement')
  assert.equal(reason({ name: { no: 'X', en: '' }, category: 'soda', catalogueId: 'drinks' }), 'badPlacement')
  assert.equal(reason({ name: { no: 'X', en: '' }, category: 'missing' }), 'badPlacement')
  assert.equal(reason({ name: { no: 'X', en: '' }, category: 'soda', allergens: ['XX' as never] }), 'badAllergens')
  assert.equal(reason({ name: { no: 'X', en: '' }, category: 'soda', stockQuantity: -2 }), 'badStock')
  assert.equal(reason({ name: { no: 'X', en: '' }, catalogueId: 'drinks' }), 'ok')
})

test('VAT category: food is stored as absent, others are kept, junk is refused', () => {
  const standard = upsertRegisterProduct([cola], catalogues, { itemID: 'cola', name: cola.name, category: 'soda', vatCategory: 'standard' }, newId)
  assert.equal(standard.ok && standard.product.vatCategory, 'standard')
  const food = upsertRegisterProduct([{ ...cola, vatCategory: 'standard' }], catalogues, { itemID: 'cola', name: cola.name, category: 'soda', vatCategory: 'food' }, newId)
  assert.equal(food.ok && 'vatCategory' in food.product, false)
  const junk = upsertRegisterProduct([cola], catalogues, { itemID: 'cola', name: cola.name, category: 'soda', vatCategory: 'luxury' as never }, newId)
  assert.deepEqual(junk, { ok: false, reason: 'badVatCategory' })
})
