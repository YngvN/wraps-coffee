import type { LookupQueryFilterInput } from './lookupQuery'

/** The one specific record the previous lookup reply was about (a resolved single-item answer, or a filtered/counted set that happened to narrow to exactly one match) — lets a follow-up singular pronoun ("den"/"it") resolve deterministically. See `pronounPrefilter.ts`. */
export interface DialogFocusItem {
  entity: string
  id: string
  label: string
}

/** The group of records the previous lookup reply covered (2+ matches, or 0) — lets a follow-up plural pronoun ("de"/"dem"/"disse"/"them"/"these"/"those") resolve deterministically, and lets its own `filter` compose with whatever filter the follow-up question itself adds (see `buildEntityQueryDataBlock`'s `baseFilters` parameter). */
export interface DialogFocusSet {
  entity: string
  filter: LookupQueryFilterInput[]
  ids: string[]
  label: string
}

/** Per-conversation "what was just talked about" — only one of `lastItem`/`lastSet` is ever populated at a time (mirrors whichever shape the previous lookup reply had); both `null` for a conversation with no lookup reply yet. */
export interface DialogFocus {
  lastItem: DialogFocusItem | null
  lastSet: DialogFocusSet | null
}

/**
 * What a single lookup reply proposes for the *next* turn's focus — computed
 * deterministically alongside that reply itself (see `buildEntityQueryDataBlock`'s
 * `focusUpdate` return, and `answerLookup`'s single-item fast path) and applied via
 * `focusFromUpdate` below. Absent entirely (rather than an update) means "leave focus
 * unchanged" — used for a report-field answer, a multi-entity/legacy-path answer, an
 * error, or a `clarifyItem` result, none of which cleanly refocus the conversation.
 */
export type DialogFocusUpdate =
  | { kind: 'item'; entity: string; id: string; label: string }
  | { kind: 'set'; entity: string; filter: LookupQueryFilterInput[]; ids: string[]; label: string }

/** Turns a `DialogFocusUpdate` into a full `DialogFocus`, clearing whichever of `lastItem`/`lastSet` the update didn't set. */
export function focusFromUpdate(update: DialogFocusUpdate): DialogFocus {
  if (update.kind === 'item') return { lastItem: { entity: update.entity, id: update.id, label: update.label }, lastSet: null }
  return { lastItem: null, lastSet: { entity: update.entity, filter: update.filter, ids: update.ids, label: update.label } }
}

/**
 * Ephemeral, in-memory, per-conversation working state — deliberately not written to
 * disk and not wired into `server/backup.ts`'s `mirrorFile`/restore machinery, the same
 * way an auth session (`store.ts`'s own `sessions` map) isn't "app data" worth restoring
 * either. Keyed by a `conversationId` the client generates once per chat (see
 * `useAssistantFlow.ts`) and never reuses across a `newChat()` reset, so a stale entry
 * simply ages out via the TTL sweep below rather than needing an explicit delete call.
 */
const FOCUS_TTL_MS = 2 * 60 * 60 * 1000
const focusByConversation = new Map<string, { focus: DialogFocus; updatedAt: number }>()

function sweepExpired(): void {
  const cutoff = Date.now() - FOCUS_TTL_MS
  for (const [id, entry] of focusByConversation) {
    if (entry.updatedAt < cutoff) focusByConversation.delete(id)
  }
}

/** `null` for an unknown/expired/absent conversation — callers (see `pronounPrefilter.ts`) treat that exactly like "no focus yet," never an error. */
export function getDialogFocus(conversationId: string | undefined): DialogFocus | null {
  if (!conversationId) return null
  sweepExpired()
  return focusByConversation.get(conversationId)?.focus ?? null
}

/** No-op when `conversationId` is missing — a caller with nothing to key state by simply can't participate in dialog-focus tracking, same as it couldn't before this feature existed. */
export function setDialogFocus(conversationId: string | undefined, focus: DialogFocus): void {
  if (!conversationId) return
  focusByConversation.set(conversationId, { focus, updatedAt: Date.now() })
}
