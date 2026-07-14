import type { BilingualText } from './bilingual'
import type { Price } from './product'

/**
 * A named grouping of products within a catalogue (e.g. "Salads", "T-shirts")
 * — fully admin-created/renameable, unlike the old fixed `ProductCategory`
 * union it replaces. Its position within the owning `Catalogue.categories`
 * array is its own display order (drag-reorderable in the admin UI, see
 * `SortableList`).
 */
export interface Category {
  id: string
  name: BilingualText
  description?: BilingualText
  /** Optional illustration/photo, set via `ImageUploadField` — shown as a small thumbnail in the admin category list and as a header image on the kiosk "Catalogue" slide. Omitted entirely for a category with no image. */
  image?: string
}

/**
 * A top-level named group of categories (e.g. "Food menu", "Merch") — the
 * top level of the admin Products hierarchy, letting a cafe sell things
 * that don't belong in its own food menu (merch, gift cards, etc.) without
 * mixing them into it. Categories live inside their own catalogue's
 * `categories` array; there is no cross-catalogue sharing of a category.
 */
export interface Catalogue {
  id: string
  name: BilingualText
  categories: Category[]
  /** This catalogue's own default price — the bottom of the fallback chain beneath a category's own default (`CategoryPrices`) and a product's own override (`Product.price`), for a catalogue where every category shares the same price (e.g. a "Merch" catalogue with no need for per-category pricing). */
  price?: Price
}
