import type { DialogFocus } from './dialogFocus'
import type { LookupQueryFilterInput } from './lookupQuery'

/** The shape `selectIntentCascaded` already returns early for its own deterministic prefilters (see `detectBulkListQuestion`) — `baseFilters` is the one addition this prefilter needs beyond that existing shape. */
export interface PronounFocusResult {
  entity: 'chat'
  action: null
  searchText: string | null
  reply: null
  lookupEntities: string[]
  baseFilters?: LookupQueryFilterInput[]
}

/**
 * Unambiguous singular referring pronouns only — deliberately excludes "det"/"it", both of
 * which are just as commonly a dummy subject ("det er 5 produkter"/"there are 5 products") as a
 * real referring pronoun ("er det på tilbud?"/"is it on sale?"). Reliably telling those two
 * apart is exactly the kind of judgment call this codebase's deterministic prefilters are meant
 * to avoid (see `steps.ts`'s `ENTITY_KEYWORDS`/`detectBulkListQuestion` for the same philosophy)
 * — "den" has no such dummy-subject reading in Norwegian, so it's the only safe singular trigger
 * for now. No English singular pronoun is included for the same reason ("it" is exactly as
 * ambiguous as "det").
 */
export const SINGULAR_REFERRING_WORDS: Record<'no' | 'en', string[]> = { no: ['den'], en: [] }

/** Plural referring pronouns — "de"/"dem"/"disse" read as referring back to a just-discussed set far more reliably than "det" does for a single item, so no exclusion heuristic is needed here. */
export const PLURAL_REFERRING_WORDS: Record<'no' | 'en', string[]> = { no: ['de', 'dem', 'disse'], en: ['them', 'these', 'those'] }

/** Word-boundary match, not a plain substring check — a short pronoun like "de"/"dem" would false-positive against unrelated words otherwise (e.g. Norwegian "dem" inside a longer word). Exported for `postChecks/selectLookupTarget.ts`'s `pronoun-not-searchtext` check, which needs the exact same "is this literally a referring pronoun" test this file already uses. */
export function containsWord(message: string, words: string[]): boolean {
  const lower = message.toLowerCase()
  return words.some((word) => new RegExp(`\\b${word}\\b`).test(lower))
}

/**
 * Deterministic, code-only pronoun resolution against the conversation's own `DialogFocus` — run
 * once, near the very top of `selectIntentCascaded` (local provider only, same "bypass the LLM
 * entirely on unambiguous signal" precedent as `detectBulkListQuestion`), before any classify/
 * routing call. Returns `null` (never guesses) whenever the message has no referring pronoun, or
 * has one but the matching focus slot is empty — in both cases the caller falls through to
 * today's existing (unchanged) routing.
 */
export function resolvePronounFocus(message: string, uiLanguage: 'no' | 'en', focus: DialogFocus | null): PronounFocusResult | null {
  if (focus?.lastItem && containsWord(message, SINGULAR_REFERRING_WORDS[uiLanguage])) {
    return { entity: 'chat', action: null, searchText: focus.lastItem.label, reply: null, lookupEntities: [focus.lastItem.entity] }
  }
  if (focus?.lastSet && containsWord(message, PLURAL_REFERRING_WORDS[uiLanguage])) {
    return { entity: 'chat', action: null, searchText: null, reply: null, lookupEntities: [focus.lastSet.entity], baseFilters: focus.lastSet.filter }
  }
  return null
}
