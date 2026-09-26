/**
 * The product group a sale line is reported under (X/Z reports, § 2-8-2): the product's category, or its
 * catalogue when it has none. Read at the moment of sale and stored on the journal line, so a later move
 * of the product never changes an old report.
 */
import type { Catalogue } from '../../src/types/category'
import type { Product } from '../../src/types/product'
import type { ProductGroup } from './saleJournal'

/** The group of product `itemID`, or `undefined` when it's gone or placed nowhere. */
export function productGroup(itemID: string, products: Product[], catalogues: Catalogue[]): ProductGroup | undefined {
  const product = products.find((candidate) => candidate.itemID === itemID)
  for (const catalogue of catalogues) {
    const category = catalogue.categories.find((candidate) => candidate.id === product?.category)
    if (category) return { id: category.id, name: category.name.no || category.name.en }
  }
  const owner = catalogues.find((catalogue) => catalogue.id === product?.catalogueId)
  return owner ? { id: owner.id, name: owner.name.no || owner.name.en } : undefined
}
