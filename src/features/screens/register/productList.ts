/**
 * The register's product list rules as pure functions: searching, sorting (menu order, A–Å, most
 * popular), grouping by category and counting popularity from recent sales. Kept out of the grid so they're testable.
 */
import { fold } from '../../../lib/textFold'
import type { OrderRecord } from '../../../types/order'
import type { Product } from '../../../types/product'
import type { ProductOrderRank } from '../../../utils/productCatalogue'

/** How the tiles are ordered. */
export type ProductSort = 'menu' | 'name' | 'popular'

/** Popularity counts sales from this many days back. */
export const POPULARITY_DAYS = 30

/** Units sold per product (`itemID`) in the last `days` days, across every order source; cancelled orders don't count. */
export function productPopularity(orders: OrderRecord[], now: Date, days = POPULARITY_DAYS): Map<string, number> {
  const since = now.getTime() - days * 24 * 60 * 60_000
  const counts = new Map<string, number>()
  for (const order of orders) {
    if (order.status === 'cancelled' || new Date(order.createdAt).getTime() < since) continue
    for (const item of order.items) counts.set(item.itemID, (counts.get(item.itemID) ?? 0) + item.quantity)
  }
  return counts
}

/** Whether `product` matches the search text: its Norwegian or English name (ignoring case and accents, so "cafe" finds "Caffè"), or the start of its barcode. */
export function matchesProductSearch(product: Product, query: string): boolean {
  const needle = fold(query.trim())
  if (!needle) return true
  if (fold(product.name.no).includes(needle) || fold(product.name.en).includes(needle)) return true
  return Boolean(product.barcode && /^\d+$/.test(query.trim()) && product.barcode.startsWith(query.trim()))
}

/**
 * Sorts products for display. `menu` keeps the order set up in the admin Products view (catalogue →
 * category → product, via `ranks`; products outside a category keep their list order at the end);
 * `name` is alphabetical in Norwegian order (Æ, Ø, Å last); `popular` puts the best sellers first,
 * then alphabetical.
 */
export function sortProducts(products: Product[], sort: ProductSort, ranks: Map<string, ProductOrderRank>, popularity: Map<string, number>, language: 'no' | 'en'): Product[] {
  const name = (product: Product) => product.name[language] || product.name.no || product.name.en
  const byName = (a: Product, b: Product) => name(a).localeCompare(name(b), 'nb')
  const indexed = products.map((product, index) => ({ product, index }))
  if (sort === 'name') return [...products].sort(byName)
  if (sort === 'popular') return [...products].sort((a, b) => (popularity.get(b.itemID) ?? 0) - (popularity.get(a.itemID) ?? 0) || byName(a, b))
  const unranked = Number.MAX_SAFE_INTEGER
  return indexed
    .sort((a, b) => {
      const rankA = ranks.get(a.product.itemID)
      const rankB = ranks.get(b.product.itemID)
      return (rankA?.categoryOrder ?? unranked) - (rankB?.categoryOrder ?? unranked) || (rankA?.productOrder ?? unranked) - (rankB?.productOrder ?? unranked) || a.index - b.index
    })
    .map(({ product }) => product)
}

/** A run of products from one category (or, for products outside any category, one catalogue). */
export interface ProductGroup {
  key: string
  products: Product[]
}

/**
 * Splits an already sorted list into runs of the same category, keeping the order. Meant for menu
 * order, where each category's products are already together; products outside any category are
 * grouped by their catalogue.
 */
export function groupByCategory(products: Product[]): ProductGroup[] {
  const groups: ProductGroup[] = []
  for (const product of products) {
    const key = product.category ?? `catalogue:${product.catalogueId ?? ''}`
    const last = groups[groups.length - 1]
    if (last && last.key === key) last.products.push(product)
    else groups.push({ key, products: [product] })
  }
  return groups
}
