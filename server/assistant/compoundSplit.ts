import type { DialogFocusUpdate } from './dialogFocus'
import type { AssistantReplyList } from './types'

/** What resolving one half (or an un-split whole message) of a single-entity lookup question produces — see `steps.ts`'s `resolveSingleEntityLookup`. */
export interface LookupHalfResult {
  reply: string
  list?: AssistantReplyList
  focusUpdate?: DialogFocusUpdate
}

const SPLIT_WORDS: Record<'no' | 'en', string[]> = { no: [' og ', ' eller ', ' samt '], en: [' and ', ' or '] }

const INTERROGATIVE_MARKERS: Record<'no' | 'en', string[]> = {
  no: ['hvor mange', 'hvor mye', 'hvem', 'hva', 'hvor', 'hvilke', 'hvilken', 'hvordan'],
  en: ['how many', 'how much', 'who', 'what', 'which', 'how'],
}

/**
 * A bare imperative lookup request ("gi meg en liste over alle produkter", "vis meg produktene")
 * carries no WH-word at all, so `INTERROGATIVE_MARKERS` alone misses it — confirmed by a real trace
 * where "Gi meg en liste over alle produkter og vis meg hvem som er på tilbud" never split at all,
 * since its first half has no interrogative marker (only its second half, "hvem...", does). Same
 * trigger phrases `steps.ts`'s own `detectBulkListQuestion` already treats as an unambiguous lookup
 * request, reused here for the identical reason.
 */
const IMPERATIVE_REQUEST_MARKERS: Record<'no' | 'en', string[]> = {
  no: ['gi meg', 'vis meg', 'vis alle', 'list opp'],
  en: ['give me', 'show me', 'list'],
}

function hasQuestionShape(half: string, uiLanguage: 'no' | 'en'): boolean {
  const lower = half.toLowerCase()
  return INTERROGATIVE_MARKERS[uiLanguage].some((marker) => lower.includes(marker)) || IMPERATIVE_REQUEST_MARKERS[uiLanguage].some((marker) => lower.includes(marker))
}

/**
 * Detects a compound question made of two coordinated questions about the same entity (e.g.
 * "Hvor mange produkter har vi og hvem er på tilbud?", "Gi meg en liste over alle produkter og
 * vis meg hvem som er på tilbud") — real testing showed this breaking symmetrically on *both*
 * providers, since `LookupQuerySpec` has exactly one `filters` array and one `reportField`, and
 * physically cannot represent two independent questions at once regardless of model quality.
 * Splits on the first coordinating conjunction found and returns the two halves only when *both*
 * look like a lookup request (a WH-word, or a bare imperative like "gi meg"/"vis meg" — see
 * `hasQuestionShape`) — a message like "den store og lille kylling wrap" (neither half asks for
 * anything) or "gi meg listen og send den til Yngve" (second half isn't a lookup at all) correctly
 * does not split, and falls through to today's unchanged single-message handling. Limited to one
 * split point — a nested compound ("hvem er på tilbud, hva koster de, og er de tilgjengelige") is
 * rare enough to leave out of scope for now; it simply doesn't split either.
 */
export function splitCompoundQuestion(message: string, uiLanguage: 'no' | 'en'): [string, string] | null {
  const lower = message.toLowerCase()
  for (const splitWord of SPLIT_WORDS[uiLanguage]) {
    const index = lower.indexOf(splitWord)
    if (index === -1) continue
    const first = message.slice(0, index).trim()
    const second = message.slice(index + splitWord.length).trim()
    if (first && second && hasQuestionShape(first, uiLanguage) && hasQuestionShape(second, uiLanguage)) {
      return [first, second]
    }
  }
  return null
}

/**
 * Combines two independently-resolved lookup halves into one reply, entirely in code — never a
 * further LLM call, since both halves are already final, correct answers. `a`/`b`'s own `list`
 * items (if either/both had one) are concatenated under one bullet list rather than built as
 * separate labeled sections — simpler, and the "two sections" case is rare enough (per the plan
 * behind this feature) that plain concatenation is an acceptable fallback rather than dedicated UI.
 */
export function combineCompoundReplies(a: LookupHalfResult, b: LookupHalfResult): { reply: string; list?: AssistantReplyList } {
  if (a.list && b.list) {
    return { reply: `${a.reply}\n${b.reply}`, list: { style: 'bullet', items: [...a.list.items, ...b.list.items] } }
  }
  if (a.list || b.list) {
    return { reply: `${a.reply}\n${b.reply}`, list: a.list ?? b.list }
  }
  return { reply: `${a.reply} ${b.reply}` }
}

/** Which half's own `focusUpdate` should carry into the next turn — the second half's topic wins when it produced one (users typically continue on the most recent topic), falling back to the first half's otherwise. `undefined` when neither half refocused (e.g. both were report-field answers) — the caller leaves `DialogFocus` unchanged, same as a single un-split reply with no `focusUpdate`. */
export function combineFocusUpdates(a: LookupHalfResult, b: LookupHalfResult): DialogFocusUpdate | undefined {
  return b.focusUpdate ?? a.focusUpdate
}
