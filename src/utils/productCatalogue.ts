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
