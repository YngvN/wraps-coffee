import type { DialogFocus } from '../dialogFocus'
import type { PostCheck } from './framework'

export interface FillFieldsCheckContext {
  entityKey: string
  message: string
  uiLanguage: 'no' | 'en'
  posture: 'safe' | 'full'
  /** See `AssistantEntity.confabulationRiskFields` — passed straight through from the entity being filled. */
  confabulationRiskFields: string[]
  dialogFocus: DialogFocus | null
}

type Fields = Record<string, unknown>

/**
 * Best-effort keyword lists for recognizing whether an allergen/dietary-tag
 * value is actually grounded in the admin's own message — deliberately
 * separate from `ALLERGEN_OPTIONS`/`DIETARY_TAG_ORDER`'s own i18n keys
 * (`src/types/product.ts`), which are display labels, not necessarily words
 * that would literally appear in a Norwegian/English sentence (e.g. the
 * `'N'` allergen's own i18n key is `"cashews"`, but its schema enum value is
 * just `"N"` — neither is something a message would contain verbatim). Only
 * used for this one check's own "was this actually mentioned" heuristic.
 */
const ALLERGEN_CODE_KEYWORDS: Record<string, { no: string[]; en: string[] }> = {
  G: { no: ['gluten', 'hvete'], en: ['gluten', 'wheat'] },
  M: { no: ['melk', 'melke', 'laktose'], en: ['milk', 'dairy', 'lactose'] },
  F: { no: ['fisk', 'skalldyr'], en: ['fish', 'shellfish'] },
  N: { no: ['nøtt', 'nøtter', 'cashew'], en: ['nut', 'nuts', 'cashew'] },
  E: { no: ['egg'], en: ['egg', 'eggs'] },
  P: { no: ['peanøtt', 'peanøtter'], en: ['peanut', 'peanuts'] },
  S: { no: ['soya'], en: ['soy', 'soya'] },
  C: { no: ['selleri'], en: ['celery'] },
  MU: { no: ['sennep'], en: ['mustard'] },
  SE: { no: ['sesam', 'sesamfrø'], en: ['sesame'] },
  SU: { no: ['sulfitt', 'sulfitter'], en: ['sulphite', 'sulphites', 'sulfite', 'sulfites'] },
  L: { no: ['lupin'], en: ['lupin'] },
  MO: { no: ['bløtdyr', 'blåskjell', 'blekksprut'], en: ['mollusc', 'molluscs', 'mussel', 'mussels', 'squid'] },
}

const DIETARY_TAG_KEYWORDS: Record<string, { no: string[]; en: string[] }> = {
  vegetarian: { no: ['vegetar'], en: ['vegetarian'] },
  vegan: { no: ['vegansk', 'vegan'], en: ['vegan'] },
  halal: { no: ['halal'], en: ['halal'] },
  glutenFree: { no: ['glutenfri'], en: ['gluten-free', 'gluten free'] },
  dairyFree: { no: ['melkefri', 'laktosefri'], en: ['dairy-free', 'dairy free', 'lactose-free'] },
}

function keepMentioned(values: unknown, keywordTable: Record<string, { no: string[]; en: string[] }>, lowerMessage: string, uiLanguage: 'no' | 'en'): unknown[] | null {
  if (!Array.isArray(values)) return null
  const kept = values.filter((value) => (keywordTable[String(value)]?.[uiLanguage] ?? []).some((word) => lowerMessage.includes(word)))
  return kept.length === values.length ? null : kept
}

/**
 * Belt-and-suspenders on top of `stripSchemaFields` (`types.ts`) — under
 * `'safe'` posture, a confabulation-risk field is never even offered in the
 * schema, so this should structurally never find anything to fix. Kept for
 * the "what if a future `mergeDraft` default reintroduces a value after the
 * fact" case rather than expecting it to catch anything today (see the plan
 * behind this feature) — a near-zero fire rate here is expected, not a sign
 * the check is broken.
 */
const noHallucinatedValuesInSafeMode: PostCheck<Fields, FillFieldsCheckContext> = {
  name: 'no-hallucinated-values-in-safe-mode',
  check: (fields, context) => {
    if (context.posture !== 'safe') return { ok: true }
    const leaked = context.confabulationRiskFields.filter((field) => fields[field] != null)
    if (leaked.length === 0) return { ok: true }
    return {
      ok: false,
      action: 'auto-fix',
      reason: `Confabulation-risk field(s) ${leaked.join(', ')} carried a value under 'safe' posture despite the schema stripping them — nulled defensively.`,
      autoFix: (out) => {
        const next = { ...out }
        for (const field of leaked) next[field] = null
        return next
      },
    }
  },
}

/**
 * For allergens/dietary tags specifically — independent of ingestion
 * posture, so it also catches the "Cashew nuts" class of bug under `'full'`
 * (this is exactly the flagship confabulation bug that motivated this whole
 * check family: a fabricated allergen value with nothing in the message to
 * support it). Strips only the unmentioned array elements, not the whole
 * field — a real, message-grounded value alongside an unmentioned one should
 * survive.
 */
const inputMentionedValuesOnly: PostCheck<Fields, FillFieldsCheckContext> = {
  name: 'input-mentioned-values-only',
  check: (fields, context) => {
    const lowerMessage = context.message.toLowerCase()
    const nextAllergens = keepMentioned(fields.allergens, ALLERGEN_CODE_KEYWORDS, lowerMessage, context.uiLanguage)
    const nextDietaryTags = keepMentioned(fields.dietaryTags, DIETARY_TAG_KEYWORDS, lowerMessage, context.uiLanguage)
    if (nextAllergens === null && nextDietaryTags === null) return { ok: true }
    return {
      ok: false,
      action: 'auto-fix',
      reason: 'One or more allergen/dietary-tag values had no grounding in the message text — stripped.',
      autoFix: (out) => ({
        ...out,
        ...(nextAllergens !== null ? { allergens: nextAllergens } : {}),
        ...(nextDietaryTags !== null ? { dietaryTags: nextDietaryTags } : {}),
      }),
    }
  },
}

/**
 * `priceMode: 'dual'` with only one of `takeawayPrice`/`eatInPrice` filled is
 * an incomplete draft, not a valid one — real testing found a dual-price
 * draft silently dropping one of the two prices. Purely structural (checks
 * field presence, not a specific entity key) since both `product` and
 * `category` share this exact same three-field shape.
 */
const dualPriceBothFields: PostCheck<Fields, FillFieldsCheckContext> = {
  name: 'dual-price-both-fields',
  check: (fields) => {
    if (fields.priceMode !== 'dual') return { ok: true }
    if (fields.takeawayPrice != null && fields.eatInPrice != null) return { ok: true }
    return { ok: false, action: 'reject-retry', reason: '"priceMode" is "dual" but takeawayPrice/eatInPrice were not both filled in.' }
  },
}

/**
 * Category-creation-specific — resolved `catalogueId` should match whatever
 * catalogue the conversation was actually just about, catching the qwen3:8b
 * flagship bug (a category create always landing in the default "food menu"
 * catalogue regardless of what was discussed). Deliberately narrower than a
 * full "scan the last N messages for any catalogue name" — that would need
 * live catalogue-name lookups this check framework has no plumbing for yet
 * (checks are pure functions over already-fetched context, not live data).
 * Grounded instead in `DialogFocus` (`dialogFocus.ts`), which already tracks
 * exactly this "what was just discussed" fact whenever a prior lookup reply
 * focused on one specific catalogue — no new data source, reuses what's
 * already computed. A conversation with no such catalogue-focused turn has
 * nothing to contradict against, so the check simply doesn't fire.
 */
const catalogueIdContextConsistency: PostCheck<Fields, FillFieldsCheckContext> = {
  name: 'catalogueId-context-consistency',
  check: (fields, context) => {
    if (context.entityKey !== 'category') return { ok: true }
    const catalogueId = fields.catalogueId
    if (typeof catalogueId !== 'string') return { ok: true }
    const focus = context.dialogFocus?.lastItem
    if (!focus || focus.entity !== 'catalogue' || focus.id === catalogueId) return { ok: true }
    return {
      ok: false,
      action: 'reject-clarify',
      reason: `Resolved catalogueId "${catalogueId}" doesn't match the catalogue ("${focus.label}") the recent conversation was actually about.`,
    }
  },
}

export const fillFieldsChecks: PostCheck<Fields, FillFieldsCheckContext>[] = [
  noHallucinatedValuesInSafeMode,
  inputMentionedValuesOnly,
  dualPriceBothFields,
  catalogueIdContextConsistency,
]
