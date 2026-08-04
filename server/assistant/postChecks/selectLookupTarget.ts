import type { DialogFocus } from '../dialogFocus'
import { PLURAL_REFERRING_WORDS, SINGULAR_REFERRING_WORDS, resolvePronounFocus } from '../pronounPrefilter'
import { detectEntitiesFromKeywords } from '../steps'
import type { PostCheck } from './framework'

export interface LookupTargetCheckContext {
  message: string
  uiLanguage: 'no' | 'en'
  entityKeys: string[]
  dialogFocus: DialogFocus | null
}

type LookupTargetOutput = { lookupEntities: string[]; searchText: string | null }

/**
 * `searchText` set but `lookupEntities` empty is a dead end downstream (see
 * `selectIntent`'s own hasLookup gate, `steps.ts`) — the caller ends up with
 * neither a lookup to run nor a reply to show, exactly the "correctly
 * classified then nothing happens" pattern QA reports flagged (normistral
 * cycle, qwen3:8b A.9a's trace). Backfills via the same deterministic
 * `detectEntitiesFromKeywords` keyword table `selectIntentCascaded` already
 * uses for this exact purpose, never a fresh guess — when `searchText` names
 * a specific item rather than containing a generic entity noun, this table
 * has nothing to match and the check simply doesn't fire (no safe way to
 * guess an entity from an arbitrary proper name).
 */
const entitySearchTextConsistency: PostCheck<LookupTargetOutput, LookupTargetCheckContext> = {
  name: 'entity-searchtext-consistency',
  check: (output, context) => {
    if (!output.searchText || output.lookupEntities.length > 0) return { ok: true }
    const backfilled = detectEntitiesFromKeywords(output.searchText, context.entityKeys, context.uiLanguage)
    if (backfilled.length === 0) return { ok: true }
    return {
      ok: false,
      action: 'auto-fix',
      reason: `searchText ("${output.searchText}") was set but lookupEntities came back empty — backfilled via keyword match.`,
      autoFix: (out) => ({ ...out, lookupEntities: backfilled }),
    }
  },
}

/**
 * `searchText` left as the literal referring pronoun itself ("den"/"dem"/
 * "them"/...) rather than resolved to a real name — the local cascade's own
 * `resolvePronounFocus` already handles this deterministically *before* any
 * model call for its own path, but Claude's single-pass `selectIntent` has
 * no equivalent pre-filter and relies entirely on the model correctly
 * resolving the reference itself (see `REFERENCE_RESOLUTION_LINE_WITH_REPLY`,
 * `steps.ts`) — this is the backstop for that path, and for the local
 * cascade's own model call falling back to literal pronoun text for any
 * other reason. Reuses `resolvePronounFocus` itself for the fix rather than
 * reimplementing its resolution logic; when that returns `null` (no matching
 * focus to resolve against), there is nothing honest to guess — force a
 * clarification instead.
 */
const pronounNotSearchText: PostCheck<LookupTargetOutput, LookupTargetCheckContext> = {
  name: 'pronoun-not-searchtext',
  check: (output, context) => {
    if (!output.searchText) return { ok: true }
    const trimmed = output.searchText.trim().toLowerCase()
    const isLiteralPronoun = SINGULAR_REFERRING_WORDS[context.uiLanguage].includes(trimmed) || PLURAL_REFERRING_WORDS[context.uiLanguage].includes(trimmed)
    if (!isLiteralPronoun) return { ok: true }

    const resolved = resolvePronounFocus(context.message, context.uiLanguage, context.dialogFocus)
    if (resolved) {
      return {
        ok: false,
        action: 'auto-fix',
        reason: `searchText was left as the literal pronoun "${output.searchText}" instead of being resolved — resolved against the conversation's own dialog focus.`,
        autoFix: (out) => ({ ...out, lookupEntities: resolved.lookupEntities, searchText: resolved.searchText }),
      }
    }
    return {
      ok: false,
      action: 'reject-clarify',
      reason: `searchText was left as the literal pronoun "${output.searchText}", and there's no recent dialog focus to resolve it against.`,
    }
  },
}

export const lookupTargetChecks: PostCheck<LookupTargetOutput, LookupTargetCheckContext>[] = [entitySearchTextConsistency, pronounNotSearchText]
