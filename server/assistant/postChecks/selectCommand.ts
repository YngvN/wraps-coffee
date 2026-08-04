import { KEYWORD_MATCH_PHRASES } from './lookupQuery'
import type { PostCheck } from './framework'

export interface SelectCommandCheckContext {
  message: string
  uiLanguage: 'no' | 'en'
}

type SelectCommandOutput = { entity: string; action: 'create' | 'update' | 'delete' | 'resetPassword' | 'trigger' | null; searchText: string | null }

/**
 * `action === 'create'` alongside a strong lookup-verb phrase ("hvilke",
 * "vis meg alle", "which", "show me all") is very likely a misclassification
 * — you don't "create all products," and a lookup question about an entire
 * class of records has no create-shaped reading. Reuses the exact same
 * phrase list `lookup_query`'s own `filter-op-shape-mismatch` check already
 * uses for "this phrasing implies a lookup," rather than a second, separate
 * list of near-identical phrases.
 */
const entityActionConsistency: PostCheck<SelectCommandOutput, SelectCommandCheckContext> = {
  name: 'entity-action-consistency',
  check: (output, context) => {
    if (output.action !== 'create') return { ok: true }
    const impliesLookup = KEYWORD_MATCH_PHRASES[context.uiLanguage].some((phrase) => context.message.toLowerCase().includes(phrase))
    if (!impliesLookup) return { ok: true }
    return {
      ok: false,
      action: 'reject-retry',
      reason: `Classified as a "create" command for "${output.entity}", but the message's own phrasing implies a lookup question ("which"/"show all"-shaped), not a request to create something.`,
    }
  },
}

export const selectCommandChecks: PostCheck<SelectCommandOutput, SelectCommandCheckContext>[] = [entityActionConsistency]
