import type { Catalogue, Category } from '../types/category'
import type { CategoryPrices, Price, Product } from '../types/product'

/** Where a product actually lives — either a real `category` inside `catalogue`, or (when `category` is null) directly in `catalogue` with no grouping. Scans every catalogue's own categories the same way `server/assistant/entities/category.ts`'s own `findCategory` does, since categories have no independent store of their own. */
export function resolveProductCatalogue(product: Product, catalogues: Catalogue[]): { catalogue: Catalogue; category: Category | null } | null {
  if (product.category) {
    for (const catalogue of catalogues) {
      const category = catalogue.categories.find((candidate) => candidate.id === product.category)
      if (category) return { catalogue, category }
    }
    return null
  }
  const catalogue = catalogues.find((candidate) => candidate.id === product.catalogueId)
  return catalogue ? { catalogue, category: null } : null
}

/** The same `categoryPrices[category.id] ?? catalogue.price` fallback chain used wherever a product's own price is missing — falls back straight to the catalogue's own default for a no-category product, since there's no category price to check. */
export function defaultPriceForProduct(product: Product, catalogues: Catalogue[], categoryPrices: CategoryPrices): Price | undefined {
  const resolved = resolveProductCatalogue(product, catalogues)
  if (!resolved) return undefined
  return (resolved.category ? categoryPrices[resolved.category.id] : undefined) ?? resolved.catalogue.price
}

/** One product's display rank, as pushed to the external website — see `computeProductOrderRanks`. */
export interface ProductOrderRank {
  /** This product's category's own position in the flattened catalogue → category walk. */
  categoryOrder: number
  /** This product's position among the others sharing its category. */
  productOrder: number
}

/**
 * Display rank for every product that belongs to a real category, keyed by
 * `Product.itemID` — the app's own drag-and-drop order (which is nothing but
 * array position, see `Category`'s doc comment in `src/types/category.ts`)
 * flattened into two integers the website's `products` table can actually
 * sort on. Computed fresh on every push rather than stored on the products
 * themselves, so no reorder/create/delete path has to remember to maintain it.
 *
 * `categoryOrder` walks every catalogue in order and every one of its
 * categories in order, so catalogue order is captured too without catalogues
 * ever being pushed to the website (they have no table there).
 *
 * A product with no category — either no placement at all, or living directly
 * in a catalogue via `catalogueId` — gets no rank, matching the fact that
 * `pushProducts` never pushes those anyway (the website's `category` column is
 * `NOT NULL`). A product whose `category` no longer resolves to any real
 * category (orphaned by a deleted category — see `UnassignedProductsModal`)
 * likewise gets no rank, and so is excluded from the push rather than reaching
 * the public menu with a stale category id.
 *
 * @param products Every product, in their current `admin.products` order.
 * @param catalogues Every catalogue, in their current `admin.catalogues` order.
 * @returns Ranks by `itemID`; a product absent from the map should not be pushed.
 */
export function computeProductOrderRanks(products: Product[], catalogues: Catalogue[]): Map<string, ProductOrderRank> {
  const categoryOrderById = new Map<string, number>()
  let nextCategoryOrder = 0
  for (const catalogue of catalogues) {
    for (const category of catalogue.categories) categoryOrderById.set(category.id, nextCategoryOrder++)
  }

  const productCountByCategory = new Map<string, number>()
  const ranks = new Map<string, ProductOrderRank>()
  for (const product of products) {
    const resolved = resolveProductCatalogue(product, catalogues)
    if (!resolved?.category) continue
    const categoryOrder = categoryOrderById.get(resolved.category.id)
    if (categoryOrder === undefined) continue
    const productOrder = productCountByCategory.get(resolved.category.id) ?? 0
    productCountByCategory.set(resolved.category.id, productOrder + 1)
    ranks.set(product.itemID, { categoryOrder, productOrder })
  }
  return ranks
}
