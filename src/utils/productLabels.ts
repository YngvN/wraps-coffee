import { ALLERGEN_OPTIONS, DIETARY_TAG_ORDER, type AllergenCode, type DietaryTag } from '../types/product'

/** Every one of `codes`' own full allergen names (e.g. "Gluten, Milk"), in `ALLERGEN_OPTIONS`'s own fixed order regardless of the order they were checked in — the display form for a customer-facing screen, unlike the admin Products view's own compact single-letter badges. */
export function allergenNames(codes: AllergenCode[], t: (key: string) => string): string {
  return ALLERGEN_OPTIONS.filter((option) => codes.includes(option.code))
    .map((option) => t(`menu.allergens.items.${option.i18nKey}.title`))
    .join(', ')
}

/** Every one of `tags`' own full dietary-tag names (e.g. "Vegetarian, Halal"), in `DIETARY_TAG_ORDER`'s own fixed order. */
export function dietaryTagNames(tags: DietaryTag[], t: (key: string) => string): string {
  return DIETARY_TAG_ORDER.filter((tag) => tags.includes(tag))
    .map((tag) => t(`menu.dietaryTags.items.${tag}.title`))
    .join(', ')
}
