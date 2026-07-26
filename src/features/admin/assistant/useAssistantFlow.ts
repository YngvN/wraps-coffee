import { useCallback, useMemo, useRef, useState } from 'react'
import { useAdminSession } from '../../../hooks/useAdminSession'
import { useLanguage } from '../../../i18n'
import {
  assistantFillFields,
  assistantSelectIntent,
  assistantSelectItem,
  type AssistantIntentResult,
} from '../../../lib/localServer'
import type { DashboardSection } from '../../../types/sync'

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

export interface TranscriptLine {
  id: string
  role: 'user' | 'assistant'
  text: string
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
  | { status: 'confirmItem'; entity: AssistantEntityKey; action: AssistantActionName; message: string; candidates: AssistantCandidate[]; pickedId: string; showAll: boolean }
  | { status: 'noMatch'; entity: AssistantEntityKey; action: AssistantActionName }
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
  | { status: 'error'; message: string }

export interface AttachedImage {
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'
  base64Data: string
}

let nextLineId = 0

/**
 * Owns the whole assistant conversation: intent routing → item selection →
 * field-filling → review, entirely client-side state (the server's three
 * `/assistant/*` routes are stateless — see `server/assistant/steps.ts`'s
 * own module doc comment). Only one operation is ever active at a time; a
 * message sent while already reviewing a draft is treated as a correction
 * to that same operation, not a new one (see `sendMessage`).
 */
export function useAssistantFlow() {
  const { session } = useAdminSession()
  const { language, t } = useLanguage()
  const [transcript, setTranscript] = useState<TranscriptLine[]>([])
  const [state, setState] = useState<FlowState>({ status: 'idle' })
  const abortRef = useRef<AbortController | null>(null)

  const allowedEntities = useAssistantAllowedEntities()

  const appendLine = useCallback((role: TranscriptLine['role'], text: string) => {
    nextLineId += 1
    setTranscript((current) => [...current, { id: `${nextLineId}`, role, text }])
  }, [])

  const cancel = useCallback(() => {
    abortRef.current?.abort()
    setState({ status: 'idle' })
    appendLine('assistant', 'cancelled')
  }, [appendLine])

  const startOver = useCallback(() => {
    abortRef.current?.abort()
    setState({ status: 'idle' })
    setTranscript([])
  }, [])

  const runFillFields = useCallback(
    async (
      entity: AssistantEntityKey,
      action: AssistantActionName,
      message: string,
      itemID: string | undefined,
      image?: AttachedImage,
      priorDraft?: unknown,
      resolvedFields?: Record<string, string>,
    ) => {
      if (!session) return
      setState({ status: 'busy', phase: 'thinking' })
      try {
        const result = await assistantFillFields(session.token, { entity, action, message, uiLanguage: language, itemID, image, priorDraft, resolvedFields })
        if (result.status === 'clarify') {
          setState({ status: 'clarifying', entity, action, itemID, message, resolvedFields: resolvedFields ?? {}, clarifications: result.clarifications })
          return
        }
        setState({ status: 'reviewingForm', entity, action, itemID, draft: result.draft, issues: result.issues })
      } catch (error) {
        setState({ status: 'error', message: error instanceof Error ? error.message : 'Something went wrong' })
      }
    },
    [session, language],
  )

  /** Delete still runs `fillFields` (an empty schema for every destructible entity — see each adapter's own `fillFieldsSchema`) purely to get a real `validate()` pass: that's the only path that surfaces a delete-time soft warning (e.g. "N products would be orphaned") or hard guard (e.g. "can't delete the active theme") before the typed-confirmation screen, rather than skipping straight to an empty-issues review. */
  const runFillFieldsForDelete = useCallback(
    async (entity: AssistantEntityKey, action: AssistantActionName, message: string, itemID: string, label: string, resolvedFields?: Record<string, string>) => {
      if (!session) return
      setState({ status: 'busy', phase: 'thinking' })
      try {
        const result = await assistantFillFields(session.token, { entity, action, message, uiLanguage: language, itemID, resolvedFields })
        if (result.status === 'clarify') {
          setState({ status: 'clarifying', entity, action, itemID, message, label, resolvedFields: resolvedFields ?? {}, clarifications: result.clarifications })
          return
        }
        setState({ status: 'reviewingDestructive', entity, action, itemID, draft: result.draft, issues: result.issues, label })
      } catch (error) {
        setState({ status: 'error', message: error instanceof Error ? error.message : 'Something went wrong' })
      }
    },
    [session, language],
  )

  const proceedWithItem = useCallback(
    async (entity: AssistantEntityKey, action: AssistantActionName, itemID: string, label: string, message: string) => {
      if (action === 'delete') {
        await runFillFieldsForDelete(entity, action, message, itemID, label)
        return
      }
      await runFillFields(entity, action, message, itemID)
    },
    [runFillFields, runFillFieldsForDelete],
  )

  const startOperation = useCallback(
    async (entity: AssistantEntityKey, action: AssistantActionName, message: string, searchText: string) => {
      if (!session) return
      if (SINGLETON_ENTITIES.has(entity)) {
        await runFillFields(entity, action, message, 'singleton')
        return
      }
      if (!actionNeedsItem(action)) {
        await runFillFields(entity, action, message, undefined)
        return
      }
      setState({ status: 'busy', phase: 'thinking' })
      try {
        const result = await assistantSelectItem(session.token, { entity, action, message, searchText, uiLanguage: language })
        if (result.candidates.length === 0) {
          setState({ status: 'noMatch', entity, action })
          return
        }
        if (!result.itemID) {
          setState({ status: 'confirmItem', entity, action, message, candidates: result.candidates, pickedId: result.candidates[0].id, showAll: true })
          return
        }
        setState({ status: 'confirmItem', entity, action, message, candidates: result.candidates, pickedId: result.itemID, showAll: false })
      } catch (error) {
        setState({ status: 'error', message: error instanceof Error ? error.message : 'Something went wrong' })
      }
    },
    [session, language, runFillFields],
  )

  const sendMessage = useCallback(
    async (message: string, image?: AttachedImage) => {
      if (!session || !message.trim()) return
      appendLine('user', message)

      // A message sent while reviewing a draft is a correction to that same
      // operation — re-run fill-fields with the current draft as prior
      // context, per the plan's review-state loop-back.
      if (state.status === 'reviewingForm') {
        await runFillFields(state.entity, state.action, message, state.itemID, image, state.draft)
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

      setState({ status: 'busy', phase: 'thinking' })
      try {
        const result: AssistantIntentResult = await assistantSelectIntent(session.token, message, language)

        // General question/greeting/etc. — answered directly, never routed
        // into a CRUD operation. See `server/assistant/steps.ts`'s own
        // `selectIntent` doc comment for why this is always safe: a
        // misroute here never proposes a write.
        if (result.entity === 'chat' || !result.action) {
          appendLine('assistant', result.reply ?? "I'm not sure how to help with that — try describing what you'd like to create, update, or delete.")
          setState({ status: 'idle' })
          return
        }

        const entity = result.entity as AssistantEntityKey
        if (!allowedEntities.includes(entity)) {
          setState({ status: 'error', message: 'This action is not available to your account.' })
          return
        }
        await startOperation(entity, result.action, message, result.searchText ?? '')
      } catch (error) {
        setState({ status: 'error', message: error instanceof Error ? error.message : 'Something went wrong' })
      }
    },
    [session, language, t, state, allowedEntities, appendLine, runFillFields, startOperation],
  )

  const confirmItemMatch = useCallback(async () => {
    if (state.status !== 'confirmItem') return
    const candidate = state.candidates.find((c) => c.id === state.pickedId)
    if (!candidate) return
    await proceedWithItem(state.entity, state.action, candidate.id, candidate.label, state.message)
  }, [state, proceedWithItem])

  const pickCandidate = useCallback(
    async (id: string) => {
      if (state.status !== 'confirmItem') return
      const candidate = state.candidates.find((c) => c.id === id)
      if (!candidate) return
      await proceedWithItem(state.entity, state.action, candidate.id, candidate.label, state.message)
    },
    [state, proceedWithItem],
  )

  const showOtherCandidates = useCallback(() => {
    if (state.status !== 'confirmItem') return
    setState({ ...state, showAll: true })
  }, [state])

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
      if (state.label !== undefined && state.itemID) {
        await runFillFieldsForDelete(state.entity, state.action, state.message, state.itemID, state.label, resolvedFields)
      } else {
        await runFillFields(state.entity, state.action, state.message, state.itemID, undefined, undefined, resolvedFields)
      }
    },
    [state, runFillFields, runFillFieldsForDelete],
  )

  /** Called by the review UI once the real, existing save/delete path has actually committed the write — the assistant itself never does (see the plan's hard invariant). */
  const onCommitted = useCallback(() => {
    appendLine('assistant', 'done')
    setState({ status: 'idle' })
  }, [appendLine])

  return {
    transcript,
    state,
    allowedEntities,
    sendMessage,
    confirmItemMatch,
    pickCandidate,
    showOtherCandidates,
    answerClarification,
    cancel,
    startOver,
    onCommitted,
  }
}
