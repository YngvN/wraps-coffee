import type { BilingualText } from './bilingual'
import type { AllergenCode, Product } from './product'

/** Where a barcode catalogue entry came from: looked up on Open Food Facts, or typed in by staff at the register. */
export type BarcodeSource = 'openFoodFacts' | 'manual'

/**
 * What the server knows about one barcode, kept in its own server-only catalogue
 * (`server/data/barcode-catalogue.json`, see `server/barcodes/`) so every barcode is looked up on
 * Open Food Facts at most once. An entry is only a *draft*: nothing is sold until staff confirm it
 * as a `Product` with a price, and `productId` then points at that product.
 */
export interface BarcodeEntry {
  barcode: string
  source: BarcodeSource
  name: BilingualText
  brand?: string
  /** Pack size as printed, e.g. `"330 ml"`. */
  quantity?: string
  /** Our own upload URL (the Open Food Facts photo re-hosted through the upload pipeline, or a staff photo). */
  image?: string
  /** Attribution the photo's licence requires, e.g. `"Open Food Facts contributors, CC BY-SA"`. Absent for staff photos. */
  imageCredit?: string
  /** Allergens that mapped cleanly onto our own codes. Still to be checked against the packaging. */
  allergens: AllergenCode[]
  /** Open Food Facts allergen tags with no clear match in `ALLERGEN_OPTIONS` — staff must decide these by hand. */
  allergensToCheck: string[]
  /** Open Food Facts category tags (e.g. `en:sodas`), kept as a hint for placing the product. */
  categoriesTags?: string[]
  /** The product this barcode was confirmed as, once staff did so. */
  productId?: string
  /** ISO date-time of the Open Food Facts lookup, for entries that came from there. */
  fetchedAt?: string
  /** ISO date-time of the last change. */
  updatedAt: string
}

/** The answer to a barcode lookup, in the order it's tried: our own products, the saved catalogue, then Open Food Facts. */
export type BarcodeLookupResult =
  /** One of our own products carries this barcode — ready to sell. */
  | { kind: 'product'; product: Product }
  /** A saved or just-fetched catalogue entry: a draft for staff to confirm with a price. */
  | { kind: 'entry'; entry: BarcodeEntry }
  /** Nobody knows this barcode (possibly a remembered miss) — offer the quick-add form. */
  | { kind: 'unknown' }
  /** Open Food Facts couldn't be asked right now (offline, slow, or our rate limit). Not remembered; try again or quick-add. */
  | { kind: 'unavailable'; retryAfterMs?: number }
  /** Not a valid GTIN — a misread. */
  | { kind: 'invalid' }
