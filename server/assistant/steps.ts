import * as store from '../store'
import { type AssistantImageInput, callToolOnce, generateThenVerify, languageInstruction } from './client'
import { allowedEntitiesFor, findEntity } from './registry'
import {
  nullable,
  AssistantProviderNotAvailableError,
  type AssistantActionName,
  type AssistantCandidate,
  type AssistantFillContext,
  type AssistantJsonSchema,
  type AssistantSession,
  type AssistantValidationIssue,
} from './types'

const ALL_ACTIONS: AssistantActionName[] = ['create', 'update', 'delete', 'resetPassword', 'trigger']

/** Every step below checks this first — today only `'claude'` is implemented; `'local'` (the future Ollama build-out) throws a typed error the routes turn into a clean, expected message rather than a raw 500. */
function requireImplementedProvider() {
  const provider = store.getAssistantProvider()
  if (provider !== 'claude') throw new AssistantProviderNotAvailableError(provider)
}

export interface IntentResult {
  /** A real entity key, or `'chat'` — a general question/greeting/anything that isn't a specific create/update/delete request gets routed here instead of being forced into one of the real entities (see the system prompt below). */
  entity: string
  /** `null` when `entity === 'chat'`. */
  action: AssistantActionName | null
  searchText: string | null
  /** The conversational answer, only set when `entity === 'chat'` — never a stand-in for a real operation's own result. */
  reply: string | null
}

/**
 * Step 1 — routes free text to an entity + action, or (per the `'chat'`
 * fallback) answers directly when the message isn't a specific CRUD
 * request at all. Single-pass (unlike the two steps below): a coarse,
 * low-ambiguity choice from a small enum, and any mistake on the CRUD path
 * is still caught by the later confirm-before-write review — a `'chat'`
 * misroute is harmless by construction, since it never proposes a write.
 */
export async function selectIntent(session: AssistantSession, message: string, uiLanguage: 'no' | 'en'): Promise<IntentResult> {
  requireImplementedProvider()
  const entities = allowedEntitiesFor(session)
  if (entities.length === 0) throw new Error('No assistant actions are available to this account.')

  const entityKeys = entities.map((entity) => entity.key)
  const schema: AssistantJsonSchema = {
    type: 'object',
    properties: {
      entity: { type: 'string', enum: [...entityKeys, 'chat'] },
      action: nullable({ type: 'string', enum: ALL_ACTIONS }),
      searchText: nullable({ type: 'string', description: 'A short phrase to help find the target existing item — only meaningful when action is not "create".' }),
      reply: nullable({ type: 'string', description: 'Your conversational reply, in the admin\'s own language — set only when entity is "chat", otherwise leave null.' }),
    },
    required: ['entity', 'action', 'searchText', 'reply'],
    additionalProperties: false,
  }

  const systemPrompt = [
    languageInstruction(uiLanguage),
    'You are the AI assistant built into the Wraps & Coffee admin dashboard, a local app a cafe uses to manage its own menu, events, and staff accounts.',
    `You can create, update, or delete: ${entityKeys.join(', ')}${entityKeys.includes('user') ? ' (non-admin accounts only)' : ''}.`,
    "If the admin's message is a specific request to create/update/delete one of those, pick exactly one entity and one action — don't try to handle more than one thing at once — and leave reply null.",
    'action is one of: "create" (make a brand new one), "update" (change an existing one), "delete" (remove one), "resetPassword" (user accounts only), "trigger" (a one-off action with no fields to fill).',
    'If the message is instead a general question (e.g. "what can you do?"), a greeting, small talk, or anything else that is not a specific create/update/delete request for one of the entities above, set entity to "chat", leave action/searchText null, and write a short, helpful, conversational reply in the reply field — mention what you can help with on this dashboard when it\'s relevant to the question.',
  ].join('\n')

  const result = await callToolOnce<IntentResult>({
    systemPrompt,
    userText: message,
    toolName: 'select_intent',
    toolDescription: "Choose which entity and action the admin's message is about, or answer directly via the chat fallback.",
    schema,
  })

  if (result.entity === 'chat') return { ...result, action: null }

  const entity = entities.find((candidate) => candidate.key === result.entity)
  if (!entity || !result.action || !entity.supportedActions.includes(result.action)) {
    throw new Error("Couldn't confidently tell what you want to do — try rephrasing with a specific entity and action.")
  }
  return result
}

function requireAccessibleEntity(entityKey: string, session: AssistantSession) {
  const entity = findEntity(entityKey)
  if (!entity || !allowedEntitiesFor(session).some((candidate) => candidate.key === entityKey)) {
    throw new Error('This action is not available to your account.')
  }
  return entity
}

export interface SelectItemResult {
  itemID: string | null
  candidates: AssistantCandidate[]
}

/** Step 2 (only for actions that need an existing item) — generate-then-verify: a first pass picks from a shortlist, a second pass re-checks that pick against the chosen candidate's full record. Deterministic fast paths skip the model entirely when there's nothing (0 candidates) or nothing to decide (exactly 1). */
export async function selectItem(
  entityKey: string,
  action: AssistantActionName,
  session: AssistantSession,
  message: string,
  searchText: string,
  uiLanguage: 'no' | 'en',
  priorItemID?: string,
): Promise<SelectItemResult> {
  requireImplementedProvider()
  const entity = requireAccessibleEntity(entityKey, session)
  if (!entity.listCandidates) throw new Error(`"${entityKey}" has nothing to select from.`)

  const candidates = await entity.listCandidates(action, { uiLanguage, session }, searchText)
  if (candidates.length === 0) return { itemID: null, candidates: [] }
  if (candidates.length === 1) return { itemID: candidates[0].id, candidates }

  const schema: AssistantJsonSchema = {
    type: 'object',
    properties: { itemID: nullable({ type: 'string', enum: candidates.map((candidate) => candidate.id) }) },
    required: ['itemID'],
    additionalProperties: false,
  }

  const candidateList = candidates.map((candidate) => `- ${candidate.id}: ${candidate.label}`).join('\n')
  const userText = [
    priorItemID ? `The admin said the previously-picked item (${priorItemID}) was wrong. New message: ${message}` : message,
    '',
    'Candidates:',
    candidateList,
  ].join('\n')

  const systemPrompt = [
    languageInstruction(uiLanguage),
    `Pick which existing "${entityKey}" the admin's message refers to, from the candidate list. If none clearly match, return null for itemID rather than guessing.`,
  ].join('\n')

  const result = await generateThenVerify<{ itemID: string | null }>({
    systemPrompt,
    userText,
    toolName: 'select_item',
    toolDescription: 'Pick the itemID the admin is referring to, or null if none match.',
    schema,
    verifyContext: candidateList,
  })

  return { itemID: result.itemID, candidates }
}

export interface FillFieldsClarification {
  field: string
  questionKey: string
  options: AssistantCandidate[]
}

/**
 * `'clarify'` — one or more fields worth stopping for (see `AssistantEntity.clarifiableFields`)
 * came back unresolved; the caller shows a multiple-choice question per entry
 * and re-calls `fillFields` with `resolvedFields` set before anything is
 * merged or validated. `'ready'` — the normal staged-draft result.
 */
export type FillFieldsResult = { status: 'ready'; draft: unknown; issues: AssistantValidationIssue[] } | { status: 'clarify'; clarifications: FillFieldsClarification[] }

/** Step 3 — generate-then-verify field extraction, merged onto the current item (update/resetPassword) or empty defaults (create), then run through the entity's own `validate()`. Never writes anything — see the plan's hard invariant; the caller only ever receives a staged draft to review. */
export async function fillFields(
  entityKey: string,
  action: AssistantActionName,
  session: AssistantSession,
  message: string,
  uiLanguage: 'no' | 'en',
  options: { itemID?: string; image?: AssistantImageInput; priorDraft?: unknown; resolvedFields?: Record<string, string> } = {},
): Promise<FillFieldsResult> {
  requireImplementedProvider()
  const entity = requireAccessibleEntity(entityKey, session)

  const context: AssistantFillContext = { uiLanguage, session }
  const current = options.itemID && entity.getCurrent ? await entity.getCurrent(options.itemID, context) : null
  const knownDraft = current ?? options.priorDraft
  const schema = entity.fillFieldsSchema(action, context, knownDraft ?? undefined)

  const userText = options.priorDraft
    ? `The admin said the previously-proposed draft was still wrong. Previous draft: ${JSON.stringify(options.priorDraft)}\n\nCorrection: ${message}`
    : message

  const systemPrompt = [
    languageInstruction(uiLanguage),
    `Extract field values for a "${entityKey}" ${action} from the admin's message. Only fill fields the message actually addresses — leave everything else null so it's left unchanged (on update) or defaulted (on create). Never invent values the message doesn't support.`,
    current ? `Current values (for reference on what "unchanged" means):\n${JSON.stringify(current)}` : '',
    options.image ? 'An image was attached — read any relevant text/numbers off it (e.g. a product card, a price list) and use them the same way you would text the admin typed.' : '',
  ]
    .filter(Boolean)
    .join('\n\n')

  const rawFields = await generateThenVerify<Record<string, unknown>>({
    systemPrompt,
    userText,
    image: options.image,
    toolName: `fill_fields_${entityKey}`,
    toolDescription: `Propose field values for this "${entityKey}" ${action}.`,
    schema,
  })

  // The admin's own answers to a prior clarifying round are authoritative — they override whatever the model itself proposed (or failed to) for that same field.
  const fields = { ...rawFields, ...options.resolvedFields }

  // The entity itself decides which fields (if any) are still genuinely unresolved, given everything the model already proposed — see `clarifiableFields`'s own doc comment.
  const unresolved = (await entity.clarifiableFields?.(action, context, fields)) ?? []
  // Same "0/1 candidates skips the model" fast path as `selectItem` — a single real option is nothing to actually choose between, so it's applied directly rather than asked about.
  for (const candidate of unresolved) {
    if (candidate.options.length === 1) fields[candidate.field] = candidate.options[0].id
  }
  const clarifications = unresolved.filter((candidate) => candidate.options.length > 1)
  if (clarifications.length > 0) return { status: 'clarify', clarifications }

  const draft = entity.mergeDraft(action, current, fields, context)
  const issues = entity.validate(action, draft, context)
  return { status: 'ready', draft, issues }
}
