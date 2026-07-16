import type { BilingualText } from './bilingual'

/** A price in NOK: either a single amount, or separate takeaway / eat-in amounts. */
export type Price = number | { takeaway: number; eatIn: number }

/** Abbreviated allergen code a product can be marked with, shown to staff (in the admin Products view and form) as a compact letter — customer-facing displays (the kiosk screens) instead show each one's full name via `ALLERGEN_OPTIONS`. */
export type AllergenCode = 'G' | 'M' | 'F' | 'N'

/** Every allergen code paired with its own i18n key (`menu.allergens.items.<i18nKey>.title`) — shared by the admin product form's checkboxes and anywhere a product's allergens are shown by their full name. */
export const ALLERGEN_OPTIONS: { code: AllergenCode; i18nKey: string }[] = [
  { code: 'G', i18nKey: 'gluten' },
  { code: 'M', i18nKey: 'milk' },
  { code: 'F', i18nKey: 'fishShellfish' },
  { code: 'N', i18nKey: 'cashews' },
]

/**
 * A dietary/lifestyle tag a product can be marked with, independent of
 * allergens (an allergen is something to avoid; a dietary tag is a positive
 * "this fits your diet" label). Shown today as a small label on the kiosk
 * display, and intended to back a future "what can I eat" menu filter.
 */
export type DietaryTag = 'vegetarian' | 'vegan' | 'halal' | 'glutenFree' | 'dairyFree'

/** Fixed display order for dietary tags — each tag's own value doubles as its i18n key (`menu.dietaryTags.items.<tag>.title`), unlike `AllergenCode`, since there's no pre-existing single-letter convention to preserve here. */
export const DIETARY_TAG_ORDER: DietaryTag[] = ['vegetarian', 'vegan', 'halal', 'glutenFree', 'dairyFree']

/** A percentage or flat-kr amount taken off a product's own price (see `applyDiscount`/`getEffectivePrice` in `src/utils/price.ts`) — an admin picks exactly one mode, mirroring `ProductForm`'s existing price `inherit`/`flat`/`dual` radio group's UI shape. */
export type Discount = { type: 'percentage'; percentage: number } | { type: 'amount'; amount: number }

/** Each category's admin-editable default price, keyed by `Category.id` (see `src/types/category.ts`) — shown in its menu header and used as the fallback for products without their own price. */
export type CategoryPrices = Partial<Record<string, Price>>

/** A single sellable menu product, editable via the admin Products view and rendered on the public Menu page. */
export interface Product {
  itemID: string
  /** References a `Category.id` (see `src/types/category.ts`) within some `Catalogue`. */
  category: string
  name: BilingualText
  description: BilingualText
  /** Optional photo, set via `ImageUploadField` — shown as a thumbnail in the admin product list row and beside the item on the kiosk "Catalogue" slide. */
  image?: string
  /** Price override for this item. Falls back to the category's default price when omitted. */
  price?: Price
  /** Applies against `price` (or, when `price` is unset, the category's default price) at display time — never itself changes what's stored as the product's own price. */
  discount?: Discount
  allergens: AllergenCode[]
  dietaryTags: DietaryTag[]
  available: boolean
  /** Temporarily unavailable to order, independent of `available` (which controls whether it's shown at all) — a customer-facing display greys the item out and stamps a "Sold out" label over it rather than hiding it, so they can still see it exists. Ignored once `trackStock` is on — see `isProductOutOfStock` in `src/utils/productStock.ts`, the one place this and `stockQuantity` are reconciled into a single answer. */
  outOfStock?: boolean
  /** Whether this product's out-of-stock state is derived from `stockQuantity` instead of the plain manual `outOfStock` checkbox above. */
  trackStock?: boolean
  /** Only meaningful when `trackStock` is on. Decremented automatically as real orders come in (see `server/index.ts`'s `reconcileStockForOrders`), restored if an order is later cancelled, and editable directly (the product form, plus a quick inline field in the product list). */
  stockQuantity?: number
}
