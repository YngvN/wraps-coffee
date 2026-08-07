import type { Catalogue } from '../../../src/types/category'
import type { Product } from '../../../src/types/product'
import { DIAG_ID_PREFIX } from './seedClient'

/**
 * Backing data for the three catalogue-bearing scenario variants (`emptied` needs none — its panes
 * are `{kind:'none'}`). Each variant gets its own catalogue id so the three are fully independent —
 * no shared products to accidentally cross-contaminate a measurement — and all cleaned up together by
 * `01-seed-screens.ts --remove` purely off the `DIAG_ID_PREFIX` on every id.
 *
 * `emptycatalogue` and `textblock` both keep `useShrinkToFitFontScale` active (same hook, same
 * measurement code path as `as-is`) — see the plan's verified "P2.2 needs FOUR variants" fix. Only the
 * *content* backing that hook differs:
 *  - `as-is`: realistic product names/descriptions, long enough to wrap onto multiple lines.
 *  - `textblock`: same product COUNT per category as as-is (same DOM node count/shape), but single
 *    fixed-width names and empty descriptions — minimizes (not eliminates) text line-breaking cost.
 *  - `emptycatalogue`: one near-trivial product per category — the font-scale hook still runs its full
 *    8-iteration binary search each time, just against almost nothing.
 */
export type CatalogueVariant = 'as-is' | 'textblock' | 'emptycatalogue'

export interface DiagCatalogueData {
  catalogue: Catalogue
  products: Product[]
  categoryAId: string
  categoryBId: string
}

const LONG_DESCRIPTIONS_NO = [
  'Ristede kaffebønner fra høylandet, malt fersk for hver kopp og traktet sakte for en rund, syrlig smak med toner av mørk sjokolade og bær.',
  'Krem laget av lokal melk, pisket til myk konsistens og lagt over en dobbel espresso — akkurat søtt nok til å balansere den bitre bunnen.',
  'Nybakt surdeigsbrød med sprø skorpe og luftig, syrlig krumme, servert varmt med saltet smør ved siden av.',
  'Håndlaget wrap med grillede grønnsaker, hummus og friske urter, rullet stramt i en myk tortilla og skåret i to.',
]

const SHORT_NAMES = ['X', 'Y', 'Z', 'W', 'Q', 'R']

function baseProduct(id: string, category: string, name: string, description: string): Product {
  return {
    itemID: id,
    category,
    name: { no: name, en: name },
    description: { no: description, en: description },
    allergens: [],
    dietaryTags: [],
    available: true,
  }
}

export function buildDiagCatalogueData(variant: CatalogueVariant): DiagCatalogueData {
  const catalogueId = `${DIAG_ID_PREFIX}catalogue-${variant}`
  const categoryAId = `${DIAG_ID_PREFIX}cat-a-${variant}`
  const categoryBId = `${DIAG_ID_PREFIX}cat-b-${variant}`

  const itemsPerCategory = variant === 'emptycatalogue' ? 1 : 6
  const products: Product[] = []
  for (const categoryId of [categoryAId, categoryBId]) {
    for (let index = 0; index < itemsPerCategory; index++) {
      const id = `${DIAG_ID_PREFIX}product-${variant}-${categoryId}-${index}`
      if (variant === 'as-is') {
        products.push(baseProduct(id, categoryId, `Diagnostic item ${index + 1}`, LONG_DESCRIPTIONS_NO[index % LONG_DESCRIPTIONS_NO.length]))
      } else if (variant === 'textblock') {
        products.push(baseProduct(id, categoryId, SHORT_NAMES[index % SHORT_NAMES.length], ''))
      } else {
        products.push(baseProduct(id, categoryId, 'X', ''))
      }
    }
  }

  const catalogue: Catalogue = {
    id: catalogueId,
    name: { no: `Diagnostikk (${variant})`, en: `Diagnostic (${variant})` },
    categories: [
      { id: categoryAId, name: { no: 'Kategori A', en: 'Category A' } },
      { id: categoryBId, name: { no: 'Kategori B', en: 'Category B' } },
    ],
  }

  return { catalogue, products, categoryAId, categoryBId }
}
