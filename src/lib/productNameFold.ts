import type { Product } from '../types/product'
import { fold } from './textFold'

/**
 * Recomputes every product's `nameFolded` from its current `name` — called
 * from `server/index.ts`'s `applyUpdate` on every `admin.products` write
 * (so it's never stale) and once from `server/store.ts`'s boot-time `load()`
 * (to backfill products written before this field existed). Pure — does not
 * touch storage itself.
 */
export function withRecomputedNameFolded(products: Product[]): Product[] {
  return products.map((product) => ({ ...product, nameFolded: { no: fold(product.name.no), en: fold(product.name.en) } }))
}

/**
 * Two distinct products with *different real names* can legitimately fold to
 * the same value (e.g. two unrelated words that happen to collapse under the
 * fold's own rules) — this isn't corrected automatically (tier 2 of the
 * resolution ladder just returns both, which is acceptable), but it's worth a
 * human noticing rather than silently confusing an admin who gets an
 * unexpected extra match. Logs once per boot/write, never throws.
 *
 * Two cases are deliberately *not* reported, both confirmed by running this
 * against the real seed catalog:
 * - A single product's own Norwegian and English names folding to the same
 *   (or similar) value, e.g. "Caffè Latte" / "Café Latte" — expected, not a
 *   collision between two different things. Grouped by `itemID` so a
 *   product's own two language slots collapse into one entry rather than
 *   counting as two independent "products" sharing a fold.
 * - Several genuinely different products sharing the exact same real name
 *   across categories, e.g. "Kylling Tandoori" in both Wraps and Baguetter —
 *   this is tier 1's legitimate "return every exact match" case, not a fold
 *   collision at all. Only reported when the colliding products' real names
 *   actually differ, matching the spec's own "shared by products with
 *   different name values" wording.
 */
export function logProductNameFoldedCollisions(products: Product[]): void {
  // folded value -> itemID -> the one real name that produced it (last language wins if a single
  // product's own no/en both fold here — see this function's own doc comment).
  const namesByFolded = new Map<string, Map<string, string>>()
  for (const product of products) {
    for (const lang of ['no', 'en'] as const) {
      const folded = product.nameFolded?.[lang]
      const realName = product.name[lang]
      if (!folded || !realName) continue
      const entries = namesByFolded.get(folded) ?? new Map<string, string>()
      entries.set(product.itemID, realName)
      namesByFolded.set(folded, entries)
    }
  }

  for (const [folded, entries] of namesByFolded) {
    const distinctNames = new Set(entries.values())
    if (distinctNames.size <= 1) continue
    console.warn(`[productNameFold] "${folded}" is shared by products with different names: ${[...distinctNames].join(', ')}`)
  }
}
