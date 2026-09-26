/**
 * Price changes the journal must record (kassasystemforskrifta § 2-7): a product's own price or
 * discount, a category's default price (`admin.categoryPrices`) and a catalogue's default price — each
 * of which changes what the register charges. Pure diffs between the value before and after a write.
 */
import type { Catalogue } from '../../src/types/category'
import type { CategoryPrices, Product } from '../../src/types/product'

/** One price that changed. `from` is `null` for something new; values are stored as they were. */
export interface PriceChange {
  scope: 'product' | 'category' | 'catalogue'
  id: string
  name?: string
  from: unknown
  to: unknown
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

/** Products whose `price` or `discount` differs (new products with a price included). */
export function productPriceChanges(before: Product[], after: Product[]): PriceChange[] {
  const previous = new Map(before.map((product) => [product.itemID, product]))
  const changes: PriceChange[] = []
  for (const product of after) {
    const old = previous.get(product.itemID)
    const from = old ? { price: old.price ?? null, discount: old.discount ?? null } : null
    const to = { price: product.price ?? null, discount: product.discount ?? null }
    if (!old && to.price === null && to.discount === null) continue
    if (from && same(from, to)) continue
    changes.push({ scope: 'product', id: product.itemID, name: product.name.no || product.name.en, from, to })
  }
  return changes
}

/** Category default prices that were set, changed or removed. */
export function categoryPriceChanges(before: CategoryPrices, after: CategoryPrices): PriceChange[] {
  const ids = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])
  return [...ids].filter((id) => !same(before?.[id], after?.[id])).map((id) => ({ scope: 'category', id, from: before?.[id] ?? null, to: after?.[id] ?? null }))
}

/** Catalogue default prices that were set, changed or removed. */
export function cataloguePriceChanges(before: Catalogue[], after: Catalogue[]): PriceChange[] {
  const previous = new Map(before.map((catalogue) => [catalogue.id, catalogue]))
  return after
    .filter((catalogue) => !same(previous.get(catalogue.id)?.price, catalogue.price))
    .map((catalogue) => ({
      scope: 'catalogue',
      id: catalogue.id,
      name: catalogue.name.no || catalogue.name.en,
      from: previous.get(catalogue.id)?.price ?? null,
      to: catalogue.price ?? null,
    }))
}
