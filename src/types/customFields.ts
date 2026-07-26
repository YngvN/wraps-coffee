import type { BilingualText } from './bilingual'

/** The 4 supported custom-field input shapes — enough to cover structured specs like a house's bedroom count or a car's mileage without an unbounded type list. More can be added the same way later if needed. */
export type CustomFieldType = 'text' | 'number' | 'boolean' | 'select'

/** One choice inside a `'select'`-type custom field (e.g. "Petrol" for a car's fuel type). */
export interface CustomFieldOption {
  id: string
  label: BilingualText
}

/** One admin-defined field on a `Category` (see `Category.customFields`) — e.g. "Bedrooms" (number) on a "Houses" category, or "Fuel type" (select) on a "Cars" category. Every `Product` in that category can optionally carry a value for it, keyed by this field's own `id` (see `Product.customFieldValues`). */
export interface CustomFieldDefinition {
  id: string
  label: BilingualText
  type: CustomFieldType
  /** Only meaningful (and only ever set) when `type === 'select'`. */
  options?: CustomFieldOption[]
}
