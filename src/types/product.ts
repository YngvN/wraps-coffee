import type { BilingualText } from './bilingual'

/** A price in NOK: either a single amount, or separate takeaway / eat-in amounts. */
export type Price = number | { takeaway: number; eatIn: number }

/** Abbreviated allergen code a product can be marked with, shown to staff (in the admin Products view and form) as a compact letter — customer-facing displays (the kiosk screens) instead show each one's full name via `ALLERGEN_OPTIONS`. Covers the Norwegian Food Safety Authority's (Mattilsynet) 14 mandatory allergens; wheat is folded into `'G'`/gluten rather than broken out on its own, since wheat is itself a gluten source. */
export type AllergenCode = 'G' | 'M' | 'F' | 'N' | 'E' | 'P' | 'S' | 'C' | 'MU' | 'SE' | 'SU' | 'L' | 'MO'

/** Every allergen code paired with its own i18n key (`menu.allergens.items.<i18nKey>.title`) — shared by the admin product form's checkboxes and anywhere a product's allergens are shown by their full name. */
export const ALLERGEN_OPTIONS: { code: AllergenCode; i18nKey: string }[] = [
  { code: 'G', i18nKey: 'gluten' },
  { code: 'M', i18nKey: 'milk' },
  { code: 'F', i18nKey: 'fishShellfish' },
  { code: 'N', i18nKey: 'cashews' },
  { code: 'E', i18nKey: 'egg' },
  { code: 'P', i18nKey: 'peanuts' },
  { code: 'S', i18nKey: 'soy' },
  { code: 'C', i18nKey: 'celery' },
  { code: 'MU', i18nKey: 'mustard' },
  { code: 'SE', i18nKey: 'sesame' },
  { code: 'SU', i18nKey: 'sulphites' },
  { code: 'L', i18nKey: 'lupin' },
  { code: 'MO', i18nKey: 'molluscs' },
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
  /** References a `Category.id` (see `src/types/category.ts`) within some `Catalogue`. Omitted for a product that lives directly in a catalogue with no category — see `catalogueId` below. Exactly one of `category`/`catalogueId` is ever set. */
  category?: string
  /** Set exactly when `category` is unset — this product lives directly in this `Catalogue.id`, not grouped under any of its categories (e.g. a one-off item that doesn't fit the catalogue's usual categories). Use `resolveProductCatalogue` (`src/utils/productCatalogue.ts`) rather than reading either field directly, since call sites need to handle both cases. */
  catalogueId?: string
  name: BilingualText
  /** `fold(name.no)`/`fold(name.en)` (see `src/lib/textFold.ts`) — recomputed server-side on every write (`applyUpdate` in `server/index.ts`), never edited directly. Powers the product-name resolution ladder's tiers 2-3 (`server/assistant/productNameResolution.ts`) so a free-text lookup like "mokka" can match a product actually named "Mocha" without a model call. Absent on a product that predates this field until the next write recomputes it. */
  nameFolded?: BilingualText
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
  /** Values for the owning category's own `customFields` (see `src/types/customFields.ts`), keyed by each field's `id` — e.g. `{ 'field-123': 3 }` for a 3-bedroom house. A missing entry just means "not set" for that field; an entry for a field the category no longer defines (removed, or the product was moved to a different category) is inert dead data, same posture as an orphaned `CategoryPrices` entry. */
  customFieldValues?: Record<string, string | number | boolean>
  /** The product's GTIN/EAN barcode (8, 12, 13 or 14 digits, check digit valid — see `server/barcodes/gtin.ts`). A register scan of this code adds the product to the cart. */
  barcode?: string
  /** Handed over at the counter as-is (a soda, a packaged snack) instead of being made in the kitchen. A register order made only of these goes straight to History; one with anything else goes to Incoming (see `initialRegisterStatus` in `src/lib/registerPricing.ts`). */
  readyToServe?: boolean
  /** How the product is taxed at the register; absent means `food`. See `vatRatePercent` in `src/lib/vat.ts`. */
  vatCategory?: VatCategory
}

/**
 * How a product is taxed. `food` (the default) is food and non-alcoholic drink: 15 % taken away, 25 %
 * eaten in (serveringsmoms). `standard` is always 25 % (merchandise, alcohol). `exempt` is 0 %.
 */
export type VatCategory = 'food' | 'standard' | 'exempt'
