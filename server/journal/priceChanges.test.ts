// Tests for the price-change diffs the journal records.
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import type { Catalogue } from '../../src/types/category'
import type { Product } from '../../src/types/product'
import { cataloguePriceChanges, categoryPriceChanges, productPriceChanges } from './priceChanges'

const product = (itemID: string, extra: Partial<Product> = {}): Product => ({
  itemID,
  name: { no: itemID, en: '' },
  description: { no: '', en: '' },
  allergens: [],
  dietaryTags: [],
  available: true,
  ...extra,
})

test('product price and discount changes are found; other edits and unpriced new products are not', () => {
  const before = [product('a', { price: 50 }), product('b', { price: 60 }), product('c', { price: 70 })]
  const after = [
    product('a', { price: 55 }),
    product('b', { price: 60, discount: { type: 'percentage', percentage: 10 } }),
    product('c', { price: 70, stockQuantity: 3 }),
    product('d', { price: 20 }),
    product('e'),
  ]
  assert.deepEqual(
    productPriceChanges(before, after).map((change) => [change.id, change.from, change.to]),
    [
      ['a', { price: 50, discount: null }, { price: 55, discount: null }],
      ['b', { price: 60, discount: null }, { price: 60, discount: { type: 'percentage', percentage: 10 } }],
      ['d', null, { price: 20, discount: null }],
    ],
  )
})

test('category and catalogue default prices', () => {
  assert.deepEqual(categoryPriceChanges({ wraps: 120, salads: 99 }, { wraps: 129, salads: 99, pizza: 150 }), [
    { scope: 'category', id: 'wraps', from: 120, to: 129 },
    { scope: 'category', id: 'pizza', from: null, to: 150 },
  ])
  const catalogue = (price?: number) => ({ id: 'menu', name: { no: 'Meny', en: '' }, categories: [], price }) as unknown as Catalogue
  assert.equal(cataloguePriceChanges([catalogue(100)], [catalogue(100)]).length, 0)
  assert.deepEqual(cataloguePriceChanges([catalogue(100)], [catalogue(110)])[0].to, 110)
})
