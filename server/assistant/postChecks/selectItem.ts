import type { AssistantCandidate } from '../types'
import type { PostCheck } from './framework'

export interface SelectItemCheckContext {
  message: string
  candidates: AssistantCandidate[]
}

type SelectItemOutput = { itemID: string | null }

/**
 * `itemID` must be `null` or a real id from `candidates` — the model's
 * schema already constrains this via `enum: candidates.map(c => c.id)`
 * (`selectItem`, `steps.ts`), but this is the direct, zero-trust backstop for
 * a weaker provider's own parse/repair path letting something else through
 * anyway (mirrors `lookup_query`'s `filter-field-exists` for the same class
 * of "schema enum should have caught this but don't just assume it did").
 */
const noFabricatedSelection: PostCheck<SelectItemOutput, SelectItemCheckContext> = {
  name: 'no-fabricated-selection',
  check: (output, context) => {
    if (output.itemID === null) return { ok: true }
    if (context.candidates.some((candidate) => candidate.id === output.itemID)) return { ok: true }
    return { ok: false, action: 'reject-retry', reason: `Selected itemID "${output.itemID}" is not one of the real candidates offered.` }
  },
}

/**
 * A narrower, different net than `hasUnresolvableAmbiguity` (`steps.ts`),
 * which already deterministically forces `itemID: null` *before the model is
 * ever called* when two real candidates share a base name and the message
 * doesn't name either one's distinguishing suffix — by the time this check
 * runs, that pre-filter has already passed (this call only happens when it
 * didn't fire), so this targets a case it structurally can't catch: the
 * model confidently returned a non-null `itemID` even though *no* candidate's
 * own label appears anywhere in the message (case-insensitive substring) —
 * i.e. it picked something the message gives no textual grounding for at
 * all, not two candidates that happen to share a name. Real testing showed
 * exactly this: a small model confidently guessing one of several
 * candidates with no real signal favoring any of them.
 */
const realAmbiguityForcesClarify: PostCheck<SelectItemOutput, SelectItemCheckContext> = {
  name: 'real-ambiguity-forces-clarify',
  check: (output, context) => {
    if (output.itemID === null) return { ok: true }
    if (context.candidates.length < 2) return { ok: true }
    const lowerMessage = context.message.toLowerCase()
    const hasGrounding = context.candidates.some((candidate) => lowerMessage.includes(candidate.label.toLowerCase()))
    if (hasGrounding) return { ok: true }
    return {
      ok: false,
      action: 'reject-clarify',
      reason: `Selected "${output.itemID}" from ${context.candidates.length} candidates, but none of their labels appear anywhere in the message — no real textual grounding for this pick.`,
    }
  },
}

export const selectItemChecks: PostCheck<SelectItemOutput, SelectItemCheckContext>[] = [noFabricatedSelection, realAmbiguityForcesClarify]
