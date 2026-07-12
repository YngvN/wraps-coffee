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

/** The site's fixed menu categories. Categories themselves are not admin-editable, only the products within them. */
export type ProductCategory = 'salads' | 'wraps' | 'baguettes' | 'pizza' | 'nachos' | 'drinks' | 'smoothies'

/** Each category's admin-editable default price, shown in its menu header and used as the fallback for products without their own price. */
export type CategoryPrices = Partial<Record<ProductCategory, Price>>

/** A single sellable menu product, editable via the admin Products view and rendered on the public Menu page. */
export interface Product {
  itemID: string
  category: ProductCategory
  name: BilingualText
  description: BilingualText
  /** Price override for this item. Falls back to the category's default price when omitted. */
  price?: Price
  allergens: AllergenCode[]
  dietaryTags: DietaryTag[]
  available: boolean
}
