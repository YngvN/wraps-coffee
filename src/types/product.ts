import type { BilingualText } from './bilingual'

/** A price in NOK: either a single amount, or separate takeaway / eat-in amounts. */
export type Price = number | { takeaway: number; eatIn: number }

/** Abbreviated allergen code shown under a menu item, expanded in the legend at the end of the menu page. */
export type AllergenCode = 'G' | 'M' | 'F' | 'N'

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
  available: boolean
}
