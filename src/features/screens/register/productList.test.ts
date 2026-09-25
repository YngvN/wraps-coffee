// Tests for the register's product search, sorting and popularity counts.
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import type { OrderRecord } from '../../../types/order'
import type { Product } from '../../../types/product'
import { groupByCategory, matchesProductSearch, productPopularity, sortProducts } from './productList'

function product(itemID: string, no: string, extra: Partial<Product> = {}): Product {
  return { itemID, name: { no, en: '' }, description: { no: '', en: '' }, allergens: [], dietaryTags: [], available: true, ...extra }
}

const now = new Date('2026-09-25T18:00:00Z')
const order = (daysAgo: number, items: [string, number][], status: OrderRecord['status'] = 'completed'): OrderRecord => ({
  id: `o${daysAgo}`,
  items: items.map(([itemID, quantity]) => ({ itemID, name: itemID, quantity, unitPrice: 10 })),
  totalPrice: 0,
  customerName: '',
  customerPhone: '',
  pickupTime: '',
  status,
  createdAt: new Date(now.getTime() - daysAgo * 86_400_000).toISOString(),
})

test('popularity counts units from the last 30 days, not cancelled orders', () => {
  const counts = productPopularity(
    [
      order(1, [
        ['latte', 2],
        ['wrap', 1],
      ]),
      order(3, [['latte', 1]]),
      order(2, [['wrap', 5]], 'cancelled'),
      order(40, [['wrap', 9]]),
    ],
    now,
  )
  assert.deepEqual(
    [...counts],
    [
      ['latte', 3],
      ['wrap', 1],
    ],
  )
})

test('search ignores case and accents, and matches barcodes by their start', () => {
  const caffe = product('c', 'Caffè Latte', { barcode: '5449000000996' })
  assert.equal(matchesProductSearch(caffe, 'caffe'), true)
  assert.equal(matchesProductSearch(caffe, 'LATTE'), true)
  assert.equal(matchesProductSearch(caffe, '5449'), true)
  assert.equal(matchesProductSearch(caffe, '0000'), false)
  assert.equal(matchesProductSearch(caffe, 'wrap'), false)
  assert.equal(matchesProductSearch(caffe, '  '), true)
})

test('sorting: menu order by ranks, A–Å with Norwegian letters last, and best sellers first', () => {
  const products = [product('a', 'Øl'), product('b', 'Americano'), product('c', 'Ærlig kaffe'), product('d', 'Bolle')]
  const ranks = new Map([
    ['d', { categoryOrder: 0, productOrder: 0 }],
    ['b', { categoryOrder: 0, productOrder: 1 }],
    ['a', { categoryOrder: 1, productOrder: 0 }],
  ])
  const ids = (list: Product[]) => list.map((p) => p.itemID)
  assert.deepEqual(ids(sortProducts(products, 'menu', ranks, new Map(), 'no')), ['d', 'b', 'a', 'c'])
  assert.deepEqual(ids(sortProducts(products, 'name', ranks, new Map(), 'no')), ['b', 'd', 'c', 'a'])
  assert.deepEqual(
    ids(
      sortProducts(
        products,
        'popular',
        ranks,
        new Map([
          ['a', 4],
          ['d', 9],
        ]),
        'no',
      ),
    ),
    ['d', 'a', 'b', 'c'],
  )
})

test('grouping keeps the order and starts a new group at each category change', () => {
  const list = [
    product('a', 'A', { category: 'wraps' }),
    product('b', 'B', { category: 'wraps' }),
    product('c', 'C', { category: 'drinks' }),
    product('d', 'D', { catalogueId: 'menu' }),
  ]
  const groups = groupByCategory(list)
  assert.deepEqual(
    groups.map((group) => [group.key, group.products.map((p) => p.itemID)]),
    [
      ['wraps', ['a', 'b']],
      ['drinks', ['c']],
      ['catalogue:menu', ['d']],
    ],
  )
})
