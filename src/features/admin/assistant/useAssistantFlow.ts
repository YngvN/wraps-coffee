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

export type AssistantEntityKey = 'product' | 'event' | 'user'
export type AssistantActionName = 'create' | 'update' | 'delete' | 'resetPassword' | 'trigger'

export interface AssistantValidationIssue {
  code: string
  params?: Record<string, string>
}

export interface AssistantCandidate {
  id: string
  label: string
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
}

/** Actions that need an existing item picked before fields can be filled — everything except `create`/`trigger`. */
function actionNeedsItem(action: AssistantActionName): boolean {
  return action === 'update' || action === 'delete' || action === 'resetPassword'
}

/** The entity set `session` can use — computed the same way both here and by `AdminTopNavbar` (to decide whether to show the assistant's own nav icon at all), so the two never disagree. Server-side, `server/assistant/registry.ts`'s `sessionCanUseEntity` is the authoritative version of this same rule. */
export function useAssistantAllowedEntities(): AssistantEntityKey[] {
  const { session } = useAdminSession()
  return useMemo(() => {
    if (!session) return []
    if (session.role !== 'limited') return ['product', 'event', 'user']
    return (Object.keys(ENTITY_SECTIONS) as AssistantEntityKey[]).filter((entity) => {
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
  const { language } = useLanguage()
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
    async (entity: AssistantEntityKey, action: AssistantActionName, message: string, itemID: string | undefined, image?: AttachedImage, priorDraft?: unknown) => {
      if (!session) return
      setState({ status: 'busy', phase: 'thinking' })
      try {
        const result = await assistantFillFields(session.token, { entity, action, message, uiLanguage: language, itemID, image, priorDraft })
        setState({ status: 'reviewingForm', entity, action, itemID, draft: result.draft, issues: result.issues })
      } catch (error) {
        setState({ status: 'error', message: error instanceof Error ? error.message : 'Something went wrong' })
      }
    },
    [session, language],
  )

  const proceedWithItem = useCallback(
    async (entity: AssistantEntityKey, action: AssistantActionName, itemID: string, label: string, message: string) => {
      if (action === 'delete') {
        setState({ status: 'reviewingDestructive', entity, action, itemID, draft: { id: itemID, label }, issues: [], label })
        return
      }
      await runFillFields(entity, action, message, itemID)
    },
    [runFillFields],
  )

  const startOperation = useCallback(
    async (entity: AssistantEntityKey, action: AssistantActionName, message: string, searchText: string) => {
      if (!session) return
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
    [session, language, state, allowedEntities, appendLine, runFillFields, startOperation],
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
    cancel,
    startOver,
    onCommitted,
  }
}
