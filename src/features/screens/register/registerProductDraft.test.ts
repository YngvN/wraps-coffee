// Tests for how the register's product editor is prefilled and turned into a save request.
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import type { BarcodeEntry } from '../../../types/barcode'
import type { Product } from '../../../types/product'
import { draftToInput, initialDraft } from './registerProductDraft'

const entry: BarcodeEntry = {
  barcode: '5449000000996',
  source: 'openFoodFacts',
  name: { no: 'Coca-Cola', en: 'Coca-Cola' },
  quantity: '330 ml',
  image: 'http://s/uploads/a.jpg',
  imageCredit: 'Open Food Facts contributors, CC BY-SA',
  allergens: [],
  allergensToCheck: ['en:caffeine'],
  updatedAt: '2026-09-25T10:00:00Z',
}

test('an Open Food Facts draft is ready-to-serve, named with its size, and still needs a price', () => {
  const draft = initialDraft({ mode: 'draft', entry }, 'category:drinks')
  assert.equal(draft.nameNo, 'Coca-Cola 330 ml')
  assert.equal(draft.readyToServe, true)
  assert.equal(draft.fromOpenFoodFacts, true)
  assert.deepEqual(draft.allergensToCheck, ['en:caffeine'])
  assert.deepEqual(draftToInput(draft), { ok: false, reason: 'noPrice' })
})

test('a quick-add keeps its barcode', () => {
  const draft = initialDraft({ mode: 'quickAdd', barcode: '96385074' }, 'catalogue:menu')
  assert.equal(draft.barcode, '96385074')
  const result = draftToInput({ ...draft, nameNo: 'Solo', price: '35' })
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.input.catalogueId, 'menu')
  assert.equal(result.input.category, undefined)
  assert.equal(result.input.price, 35)
})

test('an existing product round-trips, including a dual price', () => {
  const product: Product = {
    itemID: 'latte',
    category: 'coffee',
    name: { no: 'Latte', en: 'Latte' },
    description: { no: '', en: '' },
    allergens: ['M'],
    dietaryTags: [],
    available: true,
    price: { takeaway: 45, eatIn: 55 },
    trackStock: true,
    stockQuantity: 12,
  }
  const draft = initialDraft({ mode: 'edit', product }, 'category:x')
  assert.equal(draft.price, '45')
  assert.equal(draft.eatInPrice, '55')
  const result = draftToInput(draft)
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.deepEqual(result.input.price, { takeaway: 45, eatIn: 55 })
  assert.equal(result.input.category, 'coffee')
  assert.equal(result.input.stockQuantity, 12)
})

test('comma decimals and an equal eat-in price collapse to one price', () => {
  const draft = { ...initialDraft({ mode: 'create' }, 'category:c'), nameNo: 'Bolle', price: '29,5', eatInPrice: '29.5' }
  const result = draftToInput(draft)
  assert.equal(result.ok && result.input.price, 29.5)
})
