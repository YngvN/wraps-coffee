import type { LookupQueryField, LookupQueryFilterInput, LookupQuerySpec } from '../lookupQuery'
import type { PostCheck } from './framework'

/** This app's own hardcoded brand string — used inline across several `steps.ts` prompt strings (e.g. "...from the ADHDisplay admin dashboard"); there is no per-tenant configurable store name to read from `store.ts` instead. Kept as its own local constant here rather than duplicating the literal at each check-inventory call site below. */
const BRAND_NAME = 'ADHDisplay'

/** Phrases that mean "match anything containing this," never "match exactly this" — used by `filterOpShapeMismatch` below, and reused by `selectCommand.ts`'s `entity-action-consistency` check as the same "this phrasing implies a lookup, not a command" signal. Kept small and literal on purpose, same "deterministic, no judgment call" posture as this whole check family; a phrase not in this list simply doesn't trigger the check; it does not fall back to guessing. */
export const KEYWORD_MATCH_PHRASES: Record<'no' | 'en', string[]> = {
  no: ['hvilke', 'vis meg alle', 'vis alle', 'list alle'],
  en: ['which', 'show me all', 'show all', 'list all'],
}

export interface LookupQueryCheckContext {
  message: string
  uiLanguage: 'no' | 'en'
  fields: LookupQueryField[]
}

/**
 * Every `filter.field` must be a real field this entity exposes. The
 * schema's own `enum: fieldKeys` (`buildLookupQuerySchema`) already
 * constrains this on Claude's strict tool-use path, but real QA testing
 * found a local (Ollama) model's own parse/repair pipeline letting a
 * fabricated field name (e.g. "discounted" instead of the real `hasDiscount`)
 * through anyway — this is the direct code-level backstop for that failure.
 */
const filterFieldExists: PostCheck<LookupQuerySpec, LookupQueryCheckContext> = {
  name: 'filter-field-exists',
  check: (spec, context) => {
    const realFieldKeys = new Set(context.fields.map((field) => field.key))
    const fabricated = spec.filters.find((filter) => !realFieldKeys.has(filter.field))
    if (!fabricated) return { ok: true }
    const realFieldList = context.fields.map((field) => field.key).join(', ')
    return {
      ok: false,
      action: 'reject-retry',
      reason: `Filter named a field "${fabricated.field}" that doesn't exist on this entity. Real fields: ${realFieldList}.`,
    }
  },
}

/**
 * A string/enum filter's value shouldn't be this app's own brand name — real
 * QA testing found a local model repeatedly hallucinating a filter against
 * the store's own name (e.g. matching a product's name against "ADHDisplay")
 * on a plain "list everything" question. `buildEntityQueryDataBlock`'s
 * own `groundedFilters` check already requires a string/enum filter's value
 * to appear somewhere in the admin's message — this catches the one case
 * that can still slip past that (the admin's own message happens to mention
 * the store's name too), so it's a narrower, additional net, not a
 * duplicate of it.
 */
const filterNotBrandName: PostCheck<LookupQuerySpec, LookupQueryCheckContext> = {
  name: 'filter-not-brand-name',
  check: (spec) => {
    const brandFilter = spec.filters.find((filter) => filter.value.trim().toLowerCase() === BRAND_NAME.toLowerCase())
    if (!brandFilter) return { ok: true }
    return {
      ok: false,
      action: 'reject-retry',
      reason: `Filter on field "${brandFilter.field}" matched this dashboard's own name ("${BRAND_NAME}"), not a real record value — the admin's question doesn't name that as something to filter on.`,
    }
  },
}

/**
 * The admin's own phrasing implies a keyword/substring match ("hvilke
 * produkter...", "vis meg alle...") but the model picked an exact-match op
 * (`'equals'`/`'is'`) on a string-type field — real QA testing showed this
 * combination reliably under-matching (or zero-matching) a "which/list"
 * question that should have used `'contains'`. Only applies to string-type
 * fields — `'equals'`/`'is'` is the *correct* op for boolean/number filters
 * regardless of phrasing (see `opsHintFor` in `lookupQuery.ts`).
 */
const filterOpShapeMismatch: PostCheck<LookupQuerySpec, LookupQueryCheckContext> = {
  name: 'filter-op-shape-mismatch',
  check: (spec, context) => {
    const impliesKeywordMatch = KEYWORD_MATCH_PHRASES[context.uiLanguage].some((phrase) => context.message.toLowerCase().includes(phrase))
    if (!impliesKeywordMatch) return { ok: true }
    const typeByKey = new Map(context.fields.map((field) => [field.key, field.type]))
    const mismatched = spec.filters.find((filter) => typeByKey.get(filter.field) === 'string' && (filter.op === 'equals' || filter.op === 'is'))
    if (!mismatched) return { ok: true }
    return {
      ok: false,
      action: 'reject-retry',
      reason: `The question's own phrasing implies a keyword/substring match, but filter on "${mismatched.field}" used an exact-match op ("${mismatched.op}") — expected "contains".`,
    }
  },
}

export const lookupQueryChecks: PostCheck<LookupQuerySpec, LookupQueryCheckContext>[] = [filterFieldExists, filterNotBrandName, filterOpShapeMismatch]

/**
 * Not a generic `PostCheck` — this needs the query actually *executed*
 * (`matches.length`), and its own "retry" is a deterministic re-query (drop
 * the single most restrictive filter, re-run in code), never a model
 * re-call. Called directly from `buildEntityQueryDataBlock` right after its
 * own `executeLookupQuery`, not through `runStepWithChecks`. Real QA testing
 * found "list all X" questions coming back with an empty result because the
 * model attached an unnecessary filter clause nobody asked for — re-running
 * without the last filter and surfacing a "showing all X, no filter matched"
 * note when that resolves it is the honest middle ground between a
 * confusing empty answer and silently discarding a real filter the admin
 * did ask for.
 */
export function reconsiderEmptyResult<TRecord>(
  filters: LookupQueryFilterInput[],
  executeQuery: (filters: LookupQueryFilterInput[]) => TRecord[],
  /**
   * The total unfiltered record count, and exactly one field key this call site can *prove* is
   * already intercepted upstream before ever reaching here (see `buildEntityQueryDataBlock`'s own
   * product-name branch) — used only by the structural guard below, never the "retry" logic itself.
   * Deliberately a single named field, not "any string-type field": a product's own `locationLabel`/
   * `allergens`/`dietaryTags` fields are also free text with no resolution ladder behind them, and
   * *should* keep today's "show the rest instead" fallback — only `name` on `product` has a ladder to
   * bounce to, so only that exact combination is a provable invariant worth throwing on. Optional so
   * any call site with no such guarantee (every entity/field other than `product`'s own `name`) just
   * gets the original, unguarded behavior — throwing there would convert a merely-suboptimal reply
   * into a live regression for something this feature was never scoped to touch.
   */
  guard?: { totalRecordCount: number; guardedFieldKey: string },
): { matches: TRecord[]; filtersUsed: LookupQueryFilterInput[]; droppedFilter: boolean } {
  const matches = executeQuery(filters)
  if (matches.length > 0 || filters.length === 0) return { matches, filtersUsed: filters, droppedFilter: false }

  const narrowedFilters = filters.slice(0, -1)
  const widerMatches = executeQuery(narrowedFilters)
  if (widerMatches.length === 0) return { matches, filtersUsed: filters, droppedFilter: false }

  // Structural backstop for the exact "Har vi mokka?" bug mechanism: the single filter that was
  // just dropped is the one field this call site can prove is already intercepted before ever
  // reaching here — so this should be provably unreachable. If it ever fires, the interception
  // upstream broke, and that's a bug worth a loud failure, not a silent 69-product dump.
  if (guard && narrowedFilters.length === 0 && widerMatches.length === guard.totalRecordCount && filters[filters.length - 1].field === guard.guardedFieldKey) {
    const droppedFilter = filters[filters.length - 1]
    throw new Error(`reconsiderEmptyResult: refusing to fall back to every record after dropping the only filter ("${droppedFilter.field}") — this field is supposed to already be intercepted before this function runs.`)
  }

  return { matches: widerMatches, filtersUsed: narrowedFilters, droppedFilter: true }
}
