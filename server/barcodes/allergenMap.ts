/**
 * Maps Open Food Facts' allergen tags onto our own `AllergenCode`s. Only tags that name one of the
 * EU's 14 allergens exactly are mapped; everything else (other languages' tags, "traces", vague
 * tags) goes into a to-check list for staff, because a wrong allergen on a menu is worse than a
 * missing suggestion. Open Food Facts data is crowd-sourced, so even mapped codes are only a
 * suggestion — the register always tells staff to check the packaging.
 */
import type { AllergenCode } from '../../src/types/product'

/** Open Food Facts' own English tag for each EU allergen, and our code for it. Fish and crustaceans share `F` (`fishShellfish`). */
const OFF_ALLERGEN_TAGS: Record<string, AllergenCode> = {
  'en:gluten': 'G',
  'en:milk': 'M',
  'en:fish': 'F',
  'en:crustaceans': 'F',
  'en:nuts': 'N',
  'en:eggs': 'E',
  'en:peanuts': 'P',
  'en:soybeans': 'S',
  'en:celery': 'C',
  'en:mustard': 'MU',
  'en:sesame-seeds': 'SE',
  'en:sulphur-dioxide-and-sulphites': 'SU',
  'en:lupin': 'L',
  'en:molluscs': 'MO',
}

/** Tags that carry no allergen at all, so there's nothing to check. */
const NO_ALLERGEN_TAGS = new Set(['en:none'])

/** Splits Open Food Facts `allergens_tags` into our codes and the tags staff must check by hand. */
export function mapOffAllergens(tags: unknown): { allergens: AllergenCode[]; allergensToCheck: string[] } {
  const allergens = new Set<AllergenCode>()
  const allergensToCheck: string[] = []
  for (const tag of Array.isArray(tags) ? tags : []) {
    if (typeof tag !== 'string') continue
    const normalized = tag.trim().toLowerCase()
    const code = OFF_ALLERGEN_TAGS[normalized]
    if (code) allergens.add(code)
    else if (normalized && !NO_ALLERGEN_TAGS.has(normalized)) allergensToCheck.push(tag.trim())
  }
  return { allergens: [...allergens], allergensToCheck }
}
