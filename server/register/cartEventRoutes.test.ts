// Tests for pricing cart lines for the journal's line corrections and voids.
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import type { PricingCatalogue } from '../../src/lib/registerPricing'
import { priceCartLines } from './cartEventRoutes'

const catalogue = {
  products: [
    { itemID: 'wrap', name: { no: 'Wrap', en: '' }, description: { no: '', en: '' }, allergens: [], dietaryTags: [], available: true, price: { takeaway: 149, eatIn: 159 } },
  ],
  catalogues: [],
  categoryPrices: {},
} as unknown as PricingCatalogue

test('lines are priced from the catalogue for the serving; junk is dropped; unknown products get no amount', () => {
  const result = priceCartLines([{ productId: 'wrap', quantity: 2 }, { productId: 'gone', quantity: 1 }, { productId: 'wrap', quantity: 0 }, 'junk'], catalogue, 'eatIn')
  assert.deepEqual(result, {
    lines: [
      { itemID: 'wrap', name: 'Wrap', quantity: 2, unitPriceOre: 15900 },
      { itemID: 'gone', name: 'gone', quantity: 1, unitPriceOre: null },
    ],
    amountOre: 31800,
  })
})
