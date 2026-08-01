import { useCallback, useMemo, useRef, useState } from 'react'
import { useAdminSession } from '../../../hooks/useAdminSession'
import { useLanguage } from '../../../i18n'
import {
  assistantAnswerLookup,
  assistantAnswerLookupForItem,
  assistantFillFields,
  assistantGenerateTitle,
  assistantSelectIntent,
  assistantSelectItem,
  assistantTranscribeAttachment,
  type AssistantIntentResult,
  type AssistantModel,
  type AssistantProvider,
  type AssistantTraceEntry,
  type ChunkSizePreference,
} from '../../../lib/localServer'
import type { DashboardSection } from '../../../types/sync'
import { generateId } from '../../../utils/id'
import { useAssistantConversationLog } from './useAssistantConversationLog'

export type AssistantEntityKey =
  | 'product'
  | 'event'
  | 'user'
  | 'catalogue'
  | 'category'
  | 'categoryCustomField'
  | 'messageBoard'
  | 'messageBoardPost'
  | 'appearanceThemeColor'
  | 'theme'
  | 'storeSettings'
  | 'contactInfo'
  | 'integrationToggle'
export type AssistantActionName = 'create' | 'update' | 'delete' | 'resetPassword' | 'trigger'

export interface AssistantValidationIssue {
  code: string
  params?: Record<string, string>
}

export interface AssistantCandidate {
  id: string
  label: string
}

/** One unresolved required field worth asking about, rather than guessing — see `server/assistant/types.ts`'s `AssistantEntity.clarifiableFields`. */
export interface AssistantClarification {
  field: string
  questionKey: string
  options: AssistantCandidate[]
}

/**
 * A plain chat bubble (`'user'`/`'assistant'`, optionally flagged `variant:
 * 'error'` for a persisted failure — see `reportError`/`reportNoMatch`), or a
 * `'thought'` line: the assistant's own internal trace for the operation
 * that led to whatever comes right after it (see `finalizeThought`) —
 * collapsed by default behind a "Thought for Xs" toggle in the UI
 * (`AssistantThoughtTrace`), never itself a stand-in for a real reply.
 */
export type TranscriptLine =
  | { id: string; role: 'user' | 'assistant'; text: string; variant?: 'error' }
  | { id: string; role: 'thought'; trace: AssistantTraceEntry[]; durationMs: number }

/** Narrows away `'thought'` lines (no `.text` of their own) wherever a plain chat transcript is needed — `Array.prototype.find`/`filter` only narrow their return type given an explicit type predicate like this one. */
function isTextLine(line: TranscriptLine): line is Extract<TranscriptLine, { text: string }> {
  return 'text' in line
}

/** Whether `error` is a `fetch` rejection caused by `AbortController.abort()` (see `cancel`) — these should never surface as a reported failure, since `cancel` itself already appended a "cancelled" line and reset state. */
function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

/** Plain-text rendering of a transcript, trimmed to the most recent lines/characters so an unusually long back-and-forth doesn't balloon a call's token usage. Used both for `generateTitle` and as the raw `history` sent on whichever call is first for a turn/continuation (see `sendMessage`'s own `resolveHistoryContext`-fed calls) — either way, `'thought'` lines are excluded entirely: trace JSON has no place in either prompt. */
function transcriptToText(transcript: TranscriptLine[]): string {
  return transcript
    .filter(isTextLine)
    .slice(-20)
    .map((line) => `${line.role === 'user' ? 'Admin' : 'Assistant'}: ${line.text}`)
    .join('\n')
    .slice(-4000)
}

/** Shown in the conversation log immediately on `newChat()`, before the AI-generated title (see `assistantGenerateTitle`) resolves and replaces it — the first user message, trimmed to a reasonable label length. */
function fallbackConversationTitle(transcript: TranscriptLine[]): string {
  const firstUserLine = transcript.filter(isTextLine).find((line) => line.role === 'user')?.text.trim() ?? ''
  if (!firstUserLine) return 'Conversation'
  return firstUserLine.length > 48 ? `${firstUserLine.slice(0, 45)}...` : firstUserLine
}

/** Which `DashboardSection` gates each entity for a `limited` role, or `null` if it's never available to one — mirrors `server/assistant/registry.ts`'s own `sessionCanUseEntity`, since the same rule is enforced independently on both sides (client pre-filter, server authoritative check — see the plan's two-layer gating). */
const ENTITY_SECTIONS: Record<AssistantEntityKey, DashboardSection | null> = {
  product: 'products',
  event: 'events',
  user: null,
  catalogue: 'products',
  category: 'products',
  categoryCustomField: 'products',
  messageBoard: 'messageboard',
  messageBoardPost: 'messageboard',
  // Deliberately stricter than the raw write path: `admin.appearanceThemes`
  // has no real `DashboardSection` gate today, but these two are treated as
  // 'store'-gated here anyway (see the plan's own note on this choice).
  appearanceThemeColor: 'store',
  theme: 'store',
  storeSettings: 'store',
  contactInfo: 'store',
  integrationToggle: 'integrations',
}

/** Entities with exactly one record — no `listCandidates` to pick from, so `startOperation` skips straight to `fillFields` with the fixed `itemID: 'singleton'` each singleton entity's own `getCurrent` expects (see `storeSettings.ts`/`contactInfo.ts`). */
const SINGLETON_ENTITIES: ReadonlySet<AssistantEntityKey> = new Set(['storeSettings', 'contactInfo'])

/** Actions that need an existing item picked before fields can be filled — everything except `create`. `trigger` is included because every `trigger` action registered so far (theme's own "make active") targets one specific existing item, unlike a fire-and-forget action with nothing to pick. */
function actionNeedsItem(action: AssistantActionName): boolean {
  return action === 'update' || action === 'delete' || action === 'resetPassword' || action === 'trigger'
}

/** The entity set `session` can use — computed the same way both here and by `AdminTopNavbar` (to decide whether to show the assistant's own nav icon at all), so the two never disagree. Server-side, `server/assistant/registry.ts`'s `sessionCanUseEntity` is the authoritative version of this same rule. */
export function useAssistantAllowedEntities(): AssistantEntityKey[] {
  const { session } = useAdminSession()
  return useMemo(() => {
    if (!session) return []
    const allKeys = Object.keys(ENTITY_SECTIONS) as AssistantEntityKey[]
    if (session.role !== 'limited') return allKeys
    return allKeys.filter((entity) => {
      const section = ENTITY_SECTIONS[entity]
      return section !== null && session.allowedSections?.includes(section)
    })
  }, [session])
}

type FlowState =
  | { status: 'idle' }
  | { status: 'busy'; phase: 'thinking' | 'verifying' }
  | { status: 'confirmItem'; entity: AssistantEntityKey; action: AssistantActionName; message: string; candidates: AssistantCandidate[]; pickedId: string; showAll: boolean; historyContext: string | null }
  | {
      status: 'clarifying'
      entity: AssistantEntityKey
      action: AssistantActionName
      itemID?: string
      message: string
      /** Set only when this clarification arose while deleting (a destructible entity's own `fillFieldsSchema` on `delete` is always empty today, so this is a defensive path, not one any current entity actually reaches) — tells `answerClarification` to resume into `reviewingDestructive` rather than `reviewingForm`, and carries the label that review needs. */
      label?: string
      resolvedFields: Record<string, string>
      clarifications: AssistantClarification[]
      /** This operation's own already-resolved conversation-context blurb (see `server/assistant/steps.ts`'s `resolveHistoryContext`/the compute-once-per-turn plan) — carried forward so `answerClarification`'s resumed `fillFields` call never re-resolves it. */
      historyContext: string | null
    }
  | { status: 'reviewingForm'; entity: AssistantEntityKey; action: AssistantActionName; itemID?: string; draft: unknown; issues: AssistantValidationIssue[] }
  | {
      status: 'reviewingDestructive'
      entity: AssistantEntityKey
      action: AssistantActionName
      itemID?: string
      draft: unknown
      issues: AssistantValidationIssue[]
      label: string
    }
  /**
   * A factual question named one specific item, but `answerLookup` couldn't confidently narrow it
   * down to just one real candidate (e.g. two products sharing the exact same name across
   * categories) — see `AssistantLookupResult`'s own doc comment. Picking one re-answers via
   * `pickLookupItem` instead of silently guessing; this is read-only Q&A, not a CRUD operation, so
   * unlike `confirmItem` there's no entity/action/draft to carry, just enough to re-ask the same
   * question once the admin resolves which item they meant.
   */
  | { status: 'clarifyingLookupItem'; entityKey: string; candidates: AssistantCandidate[]; message: string; historyContext: string | null }

export interface AttachedImage {
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'
  base64Data: string
}

/**
 * How an attached photo should be used, chosen explicitly by the admin via
 * `AssistantPanel`'s image-mode pill toggle (shown only while a photo is
 * attached) rather than inferred by the model — deliberate, since inferring
 * it wrong would be one more place a local model's guess could go astray
 * (see the plan behind Ollama support). `'fillForm'` (the default, unchanged
 * behavior) reads the photo into a create/update draft the normal way (see
 * `runFillFields`'s own `image` option); `'transcribeOnly'` skips the whole
 * intent/entity flow and just reads the photo back as plain text — any
 * photographed document, not limited to this dashboard's own data (see
 * `server/assistant/steps.ts`'s `transcribeAttachment`).
 */
export type AssistantImageMode = 'fillForm' | 'transcribeOnly'

/**
 * Owns the whole assistant conversation: intent routing → item selection →
 * field-filling → review, entirely client-side state (the server's three
 * `/assistant/*` routes are stateless — see `server/assistant/steps.ts`'s
 * own module doc comment). Only one operation is ever active at a time; a
 * message sent while already reviewing a draft is treated as a correction
 * to that same operation, not a new one (see `sendMessage`).
 *
 * `modelOverride`, when set, is passed through to every one of these calls
 * in place of the admin-configured default (`server/store.ts`'s own
 * `getAssistantModel()`) — see `AssistantPanel`'s model-picker menu, which
 * owns the actual per-device preference this value comes from. Never
 * written back to that shared, admin-configured default itself.
 * `providerOverride` is the same kind of per-device, never-persisted
 * override but for which *backend* answers (Claude vs. Local/Ollama) —
 * independently selectable from `modelOverride` in that same kebab menu
 * (picking "Local (Ollama)" there sets this without touching `modelOverride`,
 * and picking a specific Claude model sets both at once). Falls back to
 * `server/store.ts`'s `getAssistantProvider()` (the shared, admin-configured
 * default) when omitted. `chunkSizePreference`/`customChunkRecordCount` are
 * the same kind of per-device override, threaded only into the lookup call
 * (see `sendMessage`'s own `lookupEntities` branch) — see `AssistantPanel`'s
 * kebab-menu chunk-size setting. `localModelOverride` is the same per-device,
 * never-persisted posture as `modelOverride` but for which Ollama *tag*
 * answers a `providerOverride: 'local'` chat — independently selectable from
 * `modelOverride`/`providerOverride` in that same kebab menu (a Small/Medium/
 * Large tier pick, or a free-text custom tag). Falls back to
 * `server/store.ts`'s `getOllamaConfig().thinkingModel` (the shared,
 * admin-configured default) when omitted; ignored entirely on the Claude path.
 */
export function useAssistantFlow(
  modelOverride?: AssistantModel,
  chunkSizePreference?: ChunkSizePreference,
  customChunkRecordCount?: number,
  providerOverride?: AssistantProvider,
  localModelOverride?: string,
) {
  const { session } = useAdminSession()
  const { language, t } = useLanguage()
  const [transcript, setTranscript] = useState<TranscriptLine[]>([])
  const [state, setState] = useState<FlowState>({ status: 'idle' })
  const abortRef = useRef<AbortController | null>(null)
  // Sticky for the lifetime of the current conversation (cleared only by `newChat`) — tracks
  // whether *any* operation within it ever hit an error, even one the admin went on to resolve
  // successfully, so the conversation log can flag the entry (see `newChat`'s own `hadError` archive param).
  const hadErrorRef = useRef(false)

  // Accumulates the current operation's own trace (see `AssistantTraceEntry`) across however many
  // sequential network calls it takes (`selectIntent` → `selectItem` → `fillFields`, etc.) — a ref
  // is the authoritative copy (read synchronously, later in the same async function, with no
  // stale-closure risk the way re-reading `useState` would have), mirrored into `currentTrace`
  // purely to force a re-render for the *live* "expand while thinking" view. `busyStartRef` marks
  // when the *first* call of the current operation started, so a multi-call operation reports one
  // cumulative duration rather than just its last leg's own.
  const traceRef = useRef<AssistantTraceEntry[]>([])
  const busyStartRef = useRef<number | null>(null)
  const [currentTrace, setCurrentTrace] = useState<AssistantTraceEntry[]>([])

  const allowedEntities = useAssistantAllowedEntities()
  const conversationLog = useAssistantConversationLog()

  /** Replaces every raw `setState({status:'busy', phase})` call — marks the operation's own start time once, on its first busy transition. */
  const beginBusy = useCallback((phase: 'thinking' | 'verifying') => {
    if (busyStartRef.current === null) busyStartRef.current = Date.now()
    setState({ status: 'busy', phase })
  }, [])

  /** Call immediately after every awaited step-function call resolves, with that call's own `result.trace`. */
  const recordTrace = useCallback((entries: AssistantTraceEntry[]) => {
    if (entries.length === 0) return
    traceRef.current.push(...entries)
    setCurrentTrace([...traceRef.current])
  }, [])

  /**
   * Collapses the current operation's accumulated trace into a permanent
   * `'thought'` transcript line, positioned wherever this is called relative
   * to the branch's own `appendLine` — always call this *first*, before that
   * branch's own line(s), so "Thought for Xs" lands before the reply/form it
   * led to rather than after it (ordering here is guaranteed by call order,
   * not by re-reading React state). A no-op if nothing was ever recorded
   * (e.g. a fast path that skipped the model entirely).
   */
  const finalizeThought = useCallback(() => {
    const entries = traceRef.current
    const durationMs = busyStartRef.current ? Date.now() - busyStartRef.current : 0
    traceRef.current = []
    busyStartRef.current = null
    setCurrentTrace([])
    if (entries.length === 0) return
    setTranscript((current) => [...current, { id: generateId(), role: 'thought', trace: entries, durationMs }])
  }, [])

  const appendLine = useCallback((role: 'user' | 'assistant', text: string, variant?: 'error') => {
    setTranscript((current) => [...current, { id: generateId(), role, text, variant }])
  }, [])

  /** Persists a real failure as a normal (if visually flagged) transcript line instead of transient `flow.state` — see the plan behind this: an error used to vanish the instant the next message was sent, since it was never part of the permanent transcript. */
  const reportError = useCallback(
    (message: string) => {
      hadErrorRef.current = true
      finalizeThought()
      appendLine('assistant', message, 'error')
      setState({ status: 'idle' })
    },
    [finalizeThought, appendLine],
  )

  /** Same "persist it" fix as `reportError`, for the plain "nothing matched" case — not flagged as an error, just a normal reply. */
  const reportNoMatch = useCallback(() => {
    finalizeThought()
    appendLine('assistant', t('admin.assistant.noMatchFound'))
    setState({ status: 'idle' })
  }, [finalizeThought, appendLine, t])

  const cancel = useCallback(() => {
    abortRef.current?.abort()
    // Unlike `newChat` (which wipes the whole transcript anyway), a cancel mid-operation shouldn't
    // silently drop whatever trace already accumulated from calls that resolved before the abort.
    finalizeThought()
    setState({ status: 'idle' })
    appendLine('assistant', 'cancelled')
  }, [appendLine, finalizeThought])

  /**
   * Archives the current conversation into the admin's own conversation log
   * (if it has any messages — an untouched chat isn't worth logging) and
   * resets to a blank one — the only way to reset the chat (see
   * `AssistantPanel`'s header button), so every reset gets a log entry, even
   * a short or error'd one. The reset itself is instant; the AI-generated
   * title (see `assistantGenerateTitle`) is requested in the background
   * afterwards and swapped in once it resolves, starting from a plain-text
   * fallback so "New chat" never blocks on that network round-trip.
   */
  const newChat = useCallback(() => {
    const linesToArchive = transcript
    const hadError = hadErrorRef.current
    abortRef.current?.abort()
    setState({ status: 'idle' })
    setTranscript([])
    hadErrorRef.current = false
    // Nothing to finalize into — the whole transcript is gone regardless.
    traceRef.current = []
    busyStartRef.current = null
    setCurrentTrace([])
    if (linesToArchive.length === 0) return

    const id = conversationLog.archive(linesToArchive, fallbackConversationTitle(linesToArchive), hadError)
    if (!session) return
    assistantGenerateTitle(session.token, transcriptToText(linesToArchive), language, modelOverride, providerOverride, localModelOverride)
      .then((result) => conversationLog.updateTitle(id, result.title))
      .catch(() => {
        // Keep the plain-text fallback title — a failed/unconfigured assistant shouldn't block browsing the log.
      })
  }, [transcript, session, language, conversationLog, setState, modelOverride, providerOverride, localModelOverride])

  const runFillFields = useCallback(
    async (
      entity: AssistantEntityKey,
      action: AssistantActionName,
      message: string,
      itemID: string | undefined,
      options: { image?: AttachedImage; priorDraft?: unknown; resolvedFields?: Record<string, string>; history?: string; historyContext?: string } = {},
    ) => {
      if (!session) return
      beginBusy('thinking')
      try {
        const result = await assistantFillFields(
          session.token,
          {
            entity,
            action,
            message,
            uiLanguage: language,
            itemID,
            image: options.image,
            priorDraft: options.priorDraft,
            resolvedFields: options.resolvedFields,
            model: modelOverride,
            provider: providerOverride,
            localModel: localModelOverride,
            history: options.history,
            historyContext: options.historyContext,
          },
          abortRef.current?.signal,
        )
        recordTrace(result.trace)
        if (result.status === 'clarify') {
          finalizeThought()
          setState({
            status: 'clarifying',
            entity,
            action,
            itemID,
            message,
            resolvedFields: options.resolvedFields ?? {},
            clarifications: result.clarifications,
            historyContext: result.historyContext,
          })
          return
        }
        finalizeThought()
        setState({ status: 'reviewingForm', entity, action, itemID, draft: result.draft, issues: result.issues })
      } catch (error) {
        if (isAbortError(error)) return
        reportError(error instanceof Error ? error.message : 'Something went wrong')
      }
    },
    [session, language, beginBusy, recordTrace, finalizeThought, reportError, modelOverride, providerOverride, localModelOverride],
  )

  /** Delete still runs `fillFields` (an empty schema for every destructible entity — see each adapter's own `fillFieldsSchema`) purely to get a real `validate()` pass: that's the only path that surfaces a delete-time soft warning (e.g. "N products would be orphaned") or hard guard (e.g. "can't delete the active theme") before the typed-confirmation screen, rather than skipping straight to an empty-issues review. */
  const runFillFieldsForDelete = useCallback(
    async (
      entity: AssistantEntityKey,
      action: AssistantActionName,
      message: string,
      itemID: string,
      label: string,
      options: { resolvedFields?: Record<string, string>; history?: string; historyContext?: string } = {},
    ) => {
      if (!session) return
      beginBusy('thinking')
      try {
        const result = await assistantFillFields(
          session.token,
          {
            entity,
            action,
            message,
            uiLanguage: language,
            itemID,
            resolvedFields: options.resolvedFields,
            model: modelOverride,
            provider: providerOverride,
            localModel: localModelOverride,
            history: options.history,
            historyContext: options.historyContext,
          },
          abortRef.current?.signal,
        )
        recordTrace(result.trace)
        if (result.status === 'clarify') {
          finalizeThought()
          setState({
            status: 'clarifying',
            entity,
            action,
            itemID,
            message,
            label,
            resolvedFields: options.resolvedFields ?? {},
            clarifications: result.clarifications,
            historyContext: result.historyContext,
          })
          return
        }
        finalizeThought()
        setState({ status: 'reviewingDestructive', entity, action, itemID, draft: result.draft, issues: result.issues, label })
      } catch (error) {
        if (isAbortError(error)) return
        reportError(error instanceof Error ? error.message : 'Something went wrong')
      }
    },
    [session, language, beginBusy, recordTrace, finalizeThought, reportError, modelOverride, providerOverride, localModelOverride],
  )

  const proceedWithItem = useCallback(
    async (entity: AssistantEntityKey, action: AssistantActionName, itemID: string, label: string, message: string, historyContext: string | null) => {
      if (action === 'delete') {
        await runFillFieldsForDelete(entity, action, message, itemID, label, { historyContext: historyContext ?? undefined })
        return
      }
      await runFillFields(entity, action, message, itemID, { historyContext: historyContext ?? undefined })
    },
    [runFillFields, runFillFieldsForDelete],
  )

  const startOperation = useCallback(
    async (entity: AssistantEntityKey, action: AssistantActionName, message: string, searchText: string, historyContext: string | null) => {
      if (!session) return
      if (SINGLETON_ENTITIES.has(entity)) {
        await runFillFields(entity, action, message, 'singleton', { historyContext: historyContext ?? undefined })
        return
      }
      if (!actionNeedsItem(action)) {
        await runFillFields(entity, action, message, undefined, { historyContext: historyContext ?? undefined })
        return
      }
      beginBusy('thinking')
      try {
        const result = await assistantSelectItem(
          session.token,
          {
            entity,
            action,
            message,
            searchText,
            uiLanguage: language,
            model: modelOverride,
            provider: providerOverride,
            localModel: localModelOverride,
            historyContext: historyContext ?? undefined,
          },
          abortRef.current?.signal,
        )
        recordTrace(result.trace)
        if (result.candidates.length === 0) {
          reportNoMatch()
          return
        }
        finalizeThought()
        if (!result.itemID) {
          setState({ status: 'confirmItem', entity, action, message, candidates: result.candidates, pickedId: result.candidates[0].id, showAll: true, historyContext })
          return
        }
        setState({ status: 'confirmItem', entity, action, message, candidates: result.candidates, pickedId: result.itemID, showAll: false, historyContext })
      } catch (error) {
        if (isAbortError(error)) return
        reportError(error instanceof Error ? error.message : 'Something went wrong')
      }
    },
    [session, language, runFillFields, beginBusy, recordTrace, finalizeThought, reportNoMatch, reportError, modelOverride, providerOverride, localModelOverride],
  )

  const sendMessage = useCallback(
    async (message: string, image?: AttachedImage, imageMode: AssistantImageMode = 'fillForm') => {
      if (!session || !message.trim()) return
      abortRef.current = new AbortController()
      // Snapshot before appending this new line below — this is the "recent history" whichever
      // branch below sends as `history`, and it must not include the message it's building context for.
      const historyText = transcriptToText(transcript)
      appendLine('user', message)

      // The admin's own explicit "just read this photo" choice (see
      // `AssistantImageMode`) — bypasses the whole intent/entity flow below
      // entirely, regardless of `state.status`, since this is a standalone
      // read, never a correction to an in-progress draft.
      if (image && imageMode === 'transcribeOnly') {
        beginBusy('thinking')
        try {
          const result = await assistantTranscribeAttachment(
            session.token,
            { message, uiLanguage: language, image, model: modelOverride, provider: providerOverride, localModel: localModelOverride },
            abortRef.current.signal,
          )
          recordTrace(result.trace)
          finalizeThought()
          appendLine('assistant', result.text)
          setState({ status: 'idle' })
        } catch (error) {
          if (isAbortError(error)) return
          reportError(error instanceof Error ? error.message : 'Something went wrong')
        }
        return
      }

      // A message sent while reviewing a draft is a correction to that same
      // operation — re-run fill-fields with the current draft as prior
      // context, per the plan's review-state loop-back. This bypasses
      // `selectIntent` entirely, so it resolves its own fresh history rather
      // than reusing anything from earlier in the operation.
      if (state.status === 'reviewingForm') {
        await runFillFields(state.entity, state.action, message, state.itemID, { image, priorDraft: state.draft, history: historyText || undefined })
        return
      }
      if (state.status === 'reviewingDestructive') {
        appendLine('assistant', "Type the confirmation phrase to confirm, or Cancel — a correction here would need to start over.")
        return
      }
      if (state.status === 'clarifying') {
        appendLine('assistant', t('admin.assistant.answerClarificationFirst'))
        return
      }
      if (state.status === 'clarifyingLookupItem') {
        appendLine('assistant', t('admin.assistant.answerClarificationFirst'))
        return
      }

      beginBusy('thinking')
      try {
        const result: AssistantIntentResult = await assistantSelectIntent(
          session.token,
          message,
          language,
          modelOverride,
          historyText || undefined,
          providerOverride,
          localModelOverride,
          abortRef.current.signal,
        )
        recordTrace(result.trace)

        // General question/greeting/etc. — answered directly, never routed
        // into a CRUD operation. See `server/assistant/steps.ts`'s own
        // `selectIntent` doc comment for why this is always safe: a
        // misroute here never proposes a write.
        if (result.entity === 'chat' || !result.action) {
          if (result.lookupEntities && result.lookupEntities.length > 0) {
            // A factual question about the cafe's own current data — hand off to `answerLookup`
            // instead of a plain conversational reply (see `selectIntent`'s own doc comment).
            const lookup = await assistantAnswerLookup(
              session.token,
              {
                message,
                uiLanguage: language,
                entities: result.lookupEntities,
                model: modelOverride,
                provider: providerOverride,
                localModel: localModelOverride,
                chunkSizePreference,
                customChunkRecordCount,
                historyContext: result.historyContext ?? undefined,
                itemSearchText: result.searchText ?? undefined,
              },
              abortRef.current?.signal,
            )
            recordTrace(lookup.trace)
            if (lookup.status === 'clarifyItem') {
              finalizeThought()
              setState({ status: 'clarifyingLookupItem', entityKey: lookup.entityKey, candidates: lookup.candidates, message, historyContext: result.historyContext })
              return
            }
            finalizeThought()
            appendLine('assistant', lookup.reply)
          } else {
            finalizeThought()
            appendLine('assistant', result.reply ?? "I'm not sure how to help with that — try describing what you'd like to create, update, or delete.")
          }
          setState({ status: 'idle' })
          return
        }

        const entity = result.entity as AssistantEntityKey
        if (!allowedEntities.includes(entity)) {
          reportError('This action is not available to your account.')
          return
        }
        await startOperation(entity, result.action, message, result.searchText ?? '', result.historyContext)
      } catch (error) {
        if (isAbortError(error)) return
        reportError(error instanceof Error ? error.message : 'Something went wrong')
      }
    },
    [
      session,
      language,
      t,
      state,
      allowedEntities,
      appendLine,
      runFillFields,
      startOperation,
      beginBusy,
      recordTrace,
      finalizeThought,
      reportError,
      modelOverride,
      providerOverride,
      localModelOverride,
      chunkSizePreference,
      customChunkRecordCount,
      transcript,
    ],
  )

  const confirmItemMatch = useCallback(async () => {
    if (state.status !== 'confirmItem') return
    const candidate = state.candidates.find((c) => c.id === state.pickedId)
    if (!candidate) return
    abortRef.current = new AbortController()
    await proceedWithItem(state.entity, state.action, candidate.id, candidate.label, state.message, state.historyContext)
  }, [state, proceedWithItem])

  const pickCandidate = useCallback(
    async (id: string) => {
      if (state.status !== 'confirmItem') return
      const candidate = state.candidates.find((c) => c.id === id)
      if (!candidate) return
      abortRef.current = new AbortController()
      await proceedWithItem(state.entity, state.action, candidate.id, candidate.label, state.message, state.historyContext)
    },
    [state, proceedWithItem],
  )

  const showOtherCandidates = useCallback(() => {
    if (state.status !== 'confirmItem') return
    setState({ ...state, showAll: true })
  }, [state, setState])

  /** Records the admin's pick for one outstanding clarifying question. Once every question in `state.clarifications` has an answer, this re-runs `fillFields` with `resolvedFields` attached — no separate "confirm" click needed, answering the last question submits. */
  const answerClarification = useCallback(
    async (field: string, optionId: string) => {
      if (state.status !== 'clarifying') return
      const resolvedFields = { ...state.resolvedFields, [field]: optionId }
      const allAnswered = state.clarifications.every((clarification) => clarification.field in resolvedFields)
      if (!allAnswered) {
        setState({ ...state, resolvedFields })
        return
      }
      abortRef.current = new AbortController()
      if (state.label !== undefined && state.itemID) {
        await runFillFieldsForDelete(state.entity, state.action, state.message, state.itemID, state.label, { resolvedFields, historyContext: state.historyContext ?? undefined })
      } else {
        await runFillFields(state.entity, state.action, state.message, state.itemID, { resolvedFields, historyContext: state.historyContext ?? undefined })
      }
    },
    [state, runFillFields, runFillFieldsForDelete, setState],
  )

  /** Resolves a `'clarifyingLookupItem'` question — the admin's pick of which specific item a factual question meant (see the state's own doc comment) — by re-answering directly from that one, now-unambiguous record via `assistantAnswerLookupForItem`. Read-only, same as every other lookup path; never writes anything. */
  const pickLookupItem = useCallback(
    async (itemID: string) => {
      if (state.status !== 'clarifyingLookupItem') return
      if (!session) return
      const { entityKey, message, historyContext } = state
      abortRef.current = new AbortController()
      beginBusy('thinking')
      try {
        const result = await assistantAnswerLookupForItem(
          session.token,
          {
            entity: entityKey,
            itemID,
            message,
            uiLanguage: language,
            historyContext: historyContext ?? undefined,
            model: modelOverride,
            provider: providerOverride,
            localModel: localModelOverride,
          },
          abortRef.current.signal,
        )
        recordTrace(result.trace)
        finalizeThought()
        appendLine('assistant', result.reply)
        setState({ status: 'idle' })
      } catch (error) {
        if (isAbortError(error)) return
        reportError(error instanceof Error ? error.message : 'Something went wrong')
      }
    },
    [state, session, language, modelOverride, providerOverride, localModelOverride, beginBusy, recordTrace, finalizeThought, appendLine, reportError],
  )

  /** Called by the review UI once the real, existing save/delete path has actually committed the write — the assistant itself never does (see the plan's hard invariant). */
  const onCommitted = useCallback(() => {
    appendLine('assistant', 'done')
    setState({ status: 'idle' })
  }, [appendLine, setState])

  return {
    transcript,
    state,
    currentTrace,
    allowedEntities,
    sendMessage,
    confirmItemMatch,
    pickCandidate,
    showOtherCandidates,
    answerClarification,
    pickLookupItem,
    cancel,
    newChat,
    conversationLog,
    onCommitted,
  }
}
