// Tests for the barcode lookup order, Open Food Facts handling and request sharing — no network.
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import type { Product } from '../../src/types/product'
import { BarcodeCatalogue, type CatalogueFile } from './catalogueStore'
import { BarcodeLookup, OFF_IMAGE_CREDIT } from './lookup'
import { RateLimiter, offUserAgent } from './openFoodFacts'

const COLA = '5449000000996'

/** A fake `fetch` answering from a table of URL substrings, counting every call. */
function fakeFetch(routes: Record<string, () => Response>) {
  const calls: { url: string; userAgent: string | null }[] = []
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, userAgent: new Headers(init?.headers).get('User-Agent') })
    const match = Object.keys(routes).find((key) => url.includes(key))
    if (!match) throw new Error(`unexpected fetch ${url}`)
    return routes[match]()
  }) as typeof fetch
  return { calls, fetcher }
}

function offJson(body: unknown, status = 200) {
  return () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function setup(routes: Record<string, () => Response>, products: Product[] = [], limit = 10) {
  const file: CatalogueFile = { entries: {}, misses: {} }
  const catalogue = new BarcodeCatalogue({ read: () => file, write: () => {} })
  const { calls, fetcher } = fakeFetch(routes)
  const ingested: number[] = []
  const lookup = new BarcodeLookup({
    catalogue,
    readProducts: () => products,
    off: { fetch: fetcher, userAgent: offUserAgent('0.3.11'), limiter: new RateLimiter(limit, 60_000) },
    ingestImage: async (buffer) => {
      ingested.push(buffer.length)
      return 'photo.jpg'
    },
    now: () => new Date('2026-09-25T10:00:00Z'),
  })
  return { lookup, calls, ingested, catalogue }
}

const colaProduct = {
  code: COLA,
  product_name: 'Coca-Cola',
  brands: 'Coca-Cola, The Coca-Cola Company',
  quantity: '330 ml',
  image_front_url: 'https://images.openfoodfacts.org/images/products/544/900/000/0996/front_en.jpg',
  allergens_tags: [],
  categories_tags: ['en:beverages', 'en:sodas'],
}

test('a found product is saved with its photo re-hosted, and never fetched again', async () => {
  const { lookup, calls, ingested, catalogue } = setup({
    '/api/v2/product/': offJson({ status: 1, product: colaProduct }),
    'images.openfoodfacts.org': () => new Response(new Uint8Array(1234)),
  })
  const first = await lookup.lookup(COLA, 'server:4000')
  assert.equal(first.kind, 'entry')
  if (first.kind !== 'entry') return
  assert.deepEqual(first.entry.name, { no: 'Coca-Cola', en: 'Coca-Cola' })
  assert.equal(first.entry.brand, 'Coca-Cola')
  assert.equal(first.entry.quantity, '330 ml')
  assert.equal(first.entry.image, 'http://server:4000/uploads/photo.jpg')
  assert.equal(first.entry.imageCredit, OFF_IMAGE_CREDIT)
  assert.deepEqual(ingested, [1234])
  assert.match(calls[0].userAgent ?? '', /^ADHDisplay\/0\.3\.11 \(\+https:\/\/wrapstesting\.netlify\.app\/\)$/)

  const second = await lookup.lookup(COLA, 'server:4000')
  assert.equal(second.kind, 'entry')
  assert.equal(calls.length, 2) // one product read + one photo, nothing more
  assert.ok(catalogue.get(COLA))
})

test('own products win, and invalid codes never reach the network', async () => {
  const product = { itemID: 'cola', barcode: COLA } as Product
  const { lookup, calls } = setup({}, [product])
  assert.deepEqual(await lookup.lookup(COLA, 'h'), { kind: 'product', product })
  assert.deepEqual(await lookup.lookup('5449000000997', 'h'), { kind: 'invalid' })
  assert.equal(calls.length, 0)
})

test('an unknown code is asked once, then remembered', async () => {
  const { lookup, calls } = setup({ '/api/v2/product/': offJson({ status: 0 }, 404) })
  assert.deepEqual(await lookup.lookup('96385074', 'h'), { kind: 'unknown' })
  assert.deepEqual(await lookup.lookup('96385074', 'h'), { kind: 'unknown' })
  assert.equal(calls.length, 1)
})

test('outages and rate limits are not remembered as misses', async () => {
  let fail = true
  const { lookup, calls } = setup({ '/api/v2/product/': () => (fail ? new Response('', { status: 503 }) : new Response(JSON.stringify({ status: 0 }), { status: 404 })) })
  assert.equal((await lookup.lookup('96385074', 'h')).kind, 'unavailable')
  fail = false
  assert.equal((await lookup.lookup('96385074', 'h')).kind, 'unknown')
  assert.equal(calls.length, 2)

  const limited = setup({ '/api/v2/product/': offJson({ status: 0 }, 404) }, [], 1)
  await limited.lookup.lookup('96385074', 'h')
  const result = await limited.lookup.lookup('036000291452', 'h')
  assert.equal(result.kind, 'unavailable')
  assert.ok(result.kind === 'unavailable' && (result.retryAfterMs ?? 0) > 0)
})

test('simultaneous scans of one code share a single request', async () => {
  const { lookup, calls } = setup({ '/api/v2/product/': offJson({ status: 1, product: { ...colaProduct, image_front_url: undefined } }) })
  const results = await Promise.all([lookup.lookup(COLA, 'h'), lookup.lookup(COLA, 'h'), lookup.lookup(COLA, 'h')])
  assert.deepEqual(
    results.map((result) => result.kind),
    ['entry', 'entry', 'entry'],
  )
  assert.equal(calls.length, 1)
})

test('photos are only fetched from Open Food Facts hosts', async () => {
  const { lookup, calls } = setup({ '/api/v2/product/': offJson({ status: 1, product: { ...colaProduct, image_front_url: 'https://evil.example/x.jpg' } }) })
  const result = await lookup.lookup(COLA, 'h')
  assert.equal(result.kind === 'entry' && result.entry.image, undefined)
  assert.equal(calls.length, 1)
})
