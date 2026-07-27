import * as store from '../store'
import { type AssistantImageInput, type AssistantTraceEntry, callToolOnce, generateThenVerify, languageInstruction } from './client'
import { allowedEntitiesFor, findEntity } from './registry'
import {
  nullable,
  AssistantProviderNotAvailableError,
  type AssistantActionName,
  type AssistantCandidate,
  type AssistantEntity,
  type AssistantFillContext,
  type AssistantJsonSchema,
  type AssistantSession,
  type AssistantValidationIssue,
} from './types'

const ALL_ACTIONS: AssistantActionName[] = ['create', 'update', 'delete', 'resetPassword', 'trigger']

/**
 * One short, concrete description per entity, shown alongside its bare key
 * in `selectIntent`'s own system prompt — without this, the model has
 * nothing but a key name to tell e.g. `category` apart from `product`, or
 * `messageBoard` from `messageBoardPost`, which is exactly how a request
 * like "change the price of Nachos" could get misrouted to `category`
 * (which only has a shared *default* price) instead of `product` (which has
 * its own). **Keep this in sync with `registry.ts`'s own `ASSISTANT_ENTITIES`
 * array — add a line here whenever a new entity is registered there.**
 */
const ENTITY_DESCRIPTIONS: Record<string, string> = {
  product: 'an individual menu item, including its own price/availability/stock',
  event: 'a calendar event/activity, not a product for sale',
  user: 'a staff account (non-admin)',
  catalogue: "a whole menu/collection of categories (e.g. 'Food menu', 'Merch')",
  category: 'a grouping of products sharing a name and an optional shared *default* price — never an individual item\'s own price',
  categoryCustomField: "one custom attribute field added to a category's own product schema (e.g. 'Bedrooms' for a Houses category)",
  messageBoard: "a named board of posts (e.g. 'Staff notices'), not an individual post",
  messageBoardPost: 'one individual post on a message board',
  appearanceThemeColor: "one custom color added to a theme's own palette",
  theme: 'a named appearance theme (fonts/colors) applied to the screens',
  storeSettings: "the store's own name/slogan/logos/favicon",
  contactInfo: "the store's phone/email/address/opening hours",
  integrationToggle: 'turning an integration (weather/transit/entur/news) on or off',
}

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
  /** The conversational answer, only set when `entity === 'chat'` and `lookupEntities` is empty — never a stand-in for a real operation's own result. */
  reply: string | null
  /**
   * Set only when `entity === 'chat'` and the message is a factual question
   * about the cafe's own current data (not a greeting/generic question) —
   * which entity keys' current data (`answerLookup`, see below) would help
   * answer it. Mutually exclusive with `reply`: normalized below so a
   * non-empty array always forces `reply` to `null`, regardless of what the
   * model itself put in both fields.
   */
  lookupEntities: string[] | null
  /** Every real Claude API call this step made — see `AssistantTraceEntry`; always exactly one entry (this step is single-pass). */
  trace: AssistantTraceEntry[]
}

/**
 * Step 1 — routes free text to an entity + action, or (per the `'chat'`
 * fallback) answers directly when the message isn't a specific CRUD
 * request at all — or, if it's a factual question about the cafe's own
 * current data, hands off to `answerLookup` instead of free-associating.
 * Single-pass (unlike the two steps below): a coarse, low-ambiguity choice
 * from a small enum, and any mistake on the CRUD path is still caught by
 * the later confirm-before-write review — a `'chat'` misroute is harmless
 * by construction, since it never proposes a write (and neither does a
 * lookup misroute).
 */
export async function selectIntent(session: AssistantSession, message: string, uiLanguage: 'no' | 'en', modelOverride?: store.AssistantModel): Promise<IntentResult> {
  requireImplementedProvider()
  const entities = allowedEntitiesFor(session)
  if (entities.length === 0) throw new Error('No assistant actions are available to this account.')

  const entityKeys = entities.map((entity) => entity.key)
  const entityListForPrompt = entities.map((entity) => `${entity.key} (${ENTITY_DESCRIPTIONS[entity.key] ?? ''})`).join(', ')
  const schema: AssistantJsonSchema = {
    type: 'object',
    properties: {
      entity: { type: 'string', enum: [...entityKeys, 'chat'] },
      action: nullable({ type: 'string', enum: ALL_ACTIONS }),
      searchText: nullable({ type: 'string', description: 'A short phrase to help find the target existing item — only meaningful when action is not "create".' }),
      reply: nullable({ type: 'string', description: 'Your conversational reply, in the admin\'s own language — set only when entity is "chat" and lookupEntities is empty, otherwise leave null.' }),
      lookupEntities: nullable({
        type: 'array',
        items: { type: 'string', enum: entityKeys },
        description:
          'Only when entity is "chat": set this instead of reply when the message is a factual question about the cafe\'s own current data (e.g. "what message boards exist?", "how many products are in category X?", "what are our opening hours?") — which of the entities above would have the data to answer it (usually 1, rarely more than 2-3). Leave null for a generic question/greeting/small talk with no real data need, and answer via reply instead.',
      }),
    },
    required: ['entity', 'action', 'searchText', 'reply', 'lookupEntities'],
    additionalProperties: false,
  }

  const systemPrompt = [
    languageInstruction(uiLanguage),
    'You are the AI assistant built into the Wraps & Coffee admin dashboard — a flexible catalogue/category/product system a business uses to manage whatever it sells, not limited to food and drink: a catalogue and its categories can represent any product line (e.g. a "Cars" catalogue with categories like "Sedans"/"SUVs", using custom fields such as "Mileage"/"Fuel type" the same way a food category might use its own custom fields), plus events, message boards, and staff accounts.',
    `You can create, update, or delete: ${entityListForPrompt}${entityKeys.includes('user') ? ' (non-admin accounts only)' : ''}.`,
    "If the admin's message is a specific request to create/update/delete one of those, pick exactly one entity and one action — don't try to handle more than one thing at once — and leave reply/lookupEntities null. This includes setting up an entirely new kind of product line (e.g. \"I'm going to sell cars, what do I need to do?\") — help them create a catalogue/categories/products for it, never say this dashboard doesn't support what they sell.",
    'A named menu item\'s own price (e.g. "change the price of Nachos to 110kr") is always a product update — never a category update. A category only has one optional shared *default* price applied to items that have no price of their own; naming a specific item always means that item, not its category.',
    'action is one of: "create" (make a brand new one), "update" (change an existing one), "delete" (remove one), "resetPassword" (user accounts only), "trigger" (a one-off action with no fields to fill).',
    'If the message is a factual question about the cafe\'s own current data rather than a create/update/delete request, set entity to "chat", leave action/searchText/reply null, and set lookupEntities instead (see its own description).',
    'If the message is a general question (e.g. "what can you do?"), a greeting, small talk, or anything else that is neither a create/update/delete request nor a factual data question, set entity to "chat", leave action/searchText/lookupEntities null, and write a short, helpful, conversational reply in the reply field — mention what you can help with on this dashboard when it\'s relevant to the question.',
  ].join('\n')

  const trace: AssistantTraceEntry[] = []
  const result = await callToolOnce<Omit<IntentResult, 'trace'>>({
    systemPrompt,
    userText: message,
    toolName: 'select_intent',
    toolDescription: "Choose which entity and action the admin's message is about, or answer directly/look up data via the chat fallback.",
    schema,
    model: modelOverride,
    trace,
  })

  if (result.entity === 'chat') {
    // Never trust the model to have kept `reply`/`lookupEntities` mutually exclusive on its own.
    const hasLookup = Boolean(result.lookupEntities && result.lookupEntities.length > 0)
    return { ...result, action: null, reply: hasLookup ? null : result.reply, lookupEntities: hasLookup ? result.lookupEntities : null, trace }
  }

  const entity = entities.find((candidate) => candidate.key === result.entity)
  if (!entity || !result.action || !entity.supportedActions.includes(result.action)) {
    throw new Error("Couldn't confidently tell what you want to do — try rephrasing with a specific entity and action.")
  }
  return { ...result, lookupEntities: null, trace }
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
  /** See `AssistantTraceEntry` — empty when a fast path (0 or 1 candidates) skipped the model entirely. */
  trace: AssistantTraceEntry[]
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
  modelOverride?: store.AssistantModel,
): Promise<SelectItemResult> {
  requireImplementedProvider()
  const entity = requireAccessibleEntity(entityKey, session)
  if (!entity.listCandidates) throw new Error(`"${entityKey}" has nothing to select from.`)

  const candidates = await entity.listCandidates(action, { uiLanguage, session }, searchText)
  if (candidates.length === 0) return { itemID: null, candidates: [], trace: [] }
  if (candidates.length === 1) return { itemID: candidates[0].id, candidates, trace: [] }

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

  const trace: AssistantTraceEntry[] = []
  const result = await generateThenVerify<{ itemID: string | null }>({
    systemPrompt,
    userText,
    toolName: 'select_item',
    toolDescription: 'Pick the itemID the admin is referring to, or null if none match.',
    schema,
    verifyContext: candidateList,
    model: modelOverride,
    trace,
  })

  return { itemID: result.itemID, candidates, trace }
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
export type FillFieldsResult =
  | { status: 'ready'; draft: unknown; issues: AssistantValidationIssue[]; trace: AssistantTraceEntry[] }
  | { status: 'clarify'; clarifications: FillFieldsClarification[]; trace: AssistantTraceEntry[] }

/** Step 3 — generate-then-verify field extraction, merged onto the current item (update/resetPassword) or empty defaults (create), then run through the entity's own `validate()`. Never writes anything — see the plan's hard invariant; the caller only ever receives a staged draft to review. */
export async function fillFields(
  entityKey: string,
  action: AssistantActionName,
  session: AssistantSession,
  message: string,
  uiLanguage: 'no' | 'en',
  options: { itemID?: string; image?: AssistantImageInput; priorDraft?: unknown; resolvedFields?: Record<string, string>; modelOverride?: store.AssistantModel } = {},
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

  const trace: AssistantTraceEntry[] = []
  const rawFields = await generateThenVerify<Record<string, unknown>>({
    systemPrompt,
    userText,
    image: options.image,
    toolName: `fill_fields_${entityKey}`,
    toolDescription: `Propose field values for this "${entityKey}" ${action}.`,
    schema,
    model: options.modelOverride,
    trace,
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
  if (clarifications.length > 0) return { status: 'clarify', clarifications, trace }

  const draft = entity.mergeDraft(action, current, fields, context)
  const issues = entity.validate(action, draft, context)
  return { status: 'ready', draft, issues, trace }
}

/**
 * Names a just-finished conversation for the admin's own conversation log
 * (see `useAssistantConversationLog`'s doc comment) — called once, from
 * `useAssistantFlow`'s `newChat()`, after the chat has already been reset
 * client-side; the client shows a plain-text fallback title in the
 * meantime rather than waiting on this call.
 */
export async function generateTitle(transcriptText: string, uiLanguage: 'no' | 'en', modelOverride?: store.AssistantModel): Promise<{ title: string }> {
  requireImplementedProvider()

  const schema: AssistantJsonSchema = {
    type: 'object',
    properties: { title: { type: 'string', description: 'A short (3-6 word) title summarizing the conversation, with no surrounding quotes or trailing punctuation.' } },
    required: ['title'],
    additionalProperties: false,
  }

  const systemPrompt = [
    languageInstruction(uiLanguage),
    'You are naming a past conversation from the Wraps & Coffee admin dashboard\'s AI assistant, for a history list the admin browses later.',
    'Write a short (3-6 word) title summarizing what the conversation below was actually about — specific enough to tell it apart from other conversations (e.g. name the product/event/setting involved), not a generic label like "Chat" or "Conversation".',
  ].join('\n')

  return callToolOnce<{ title: string }>({
    systemPrompt,
    userText: transcriptText,
    toolName: 'generate_title',
    toolDescription: 'Provide a short title summarizing the conversation.',
    schema,
    model: modelOverride,
  })
}

/** The admin's own override of how much data `answerLookup` processes per call at once (see `AssistantPanel`'s kebab-menu chunk-size setting) — `'auto'` just means "use the active model/provider's own profile below, unmodified." */
export type ChunkSizePreference = 'auto' | 'small' | 'medium' | 'large' | 'custom'

interface AssistantModelCapability {
  /** The primary, admin-facing unit (see `ChunkSizePreference`'s own "Custom" option, which sets this same value directly) — how many of an entity's live records go into one map-step batch before `answerLookup` needs to chunk at all. */
  recordsPerBatch: number
  /** A secondary safety ceiling applied regardless of `recordsPerBatch` — if a batch of that many records still serializes past this many characters (unusually content-heavy records), it gets split further rather than trusting the record count alone. */
  chunkCharBudget: number
  /** Whether the extra `generateThenVerify` pass is worth the added latency for this tier — always used for cloud Claude; the placeholder `'local'` row opts out, since a constrained local model paying 2x latency per call may not be worth it. */
  useVerifyPass: boolean
  maxParallelChunkCalls: number
}

/**
 * Chunk size (and verify-pass use) is a property of *which model/provider is
 * actually answering*, not one fixed constant — see the plan behind this
 * feature. `claude-haiku-4-5` gets a small budget, so chunking engages
 * readily (a weaker model benefits from smaller working sets); `sonnet`/
 * `opus` get a much larger one, so a typical small cafe's real data almost
 * never exceeds it and chunking effectively never triggers in practice —
 * without ever being a hard off-switch, so an unusually large dataset still
 * gets chunked instead of silently truncated even on the stronger tiers.
 * `'local'` is an honest placeholder (see `requireImplementedProvider` —
 * that provider isn't implemented yet) picked conservatively for hardware as
 * modest as a Raspberry Pi; real tuning waits until it exists to measure.
 */
const ASSISTANT_MODEL_CAPABILITIES: Record<store.AssistantModel | 'local', AssistantModelCapability> = {
  'claude-haiku-4-5': { recordsPerBatch: 25, chunkCharBudget: 2000, useVerifyPass: true, maxParallelChunkCalls: 4 },
  'claude-sonnet-4-5': { recordsPerBatch: 150, chunkCharBudget: 12000, useVerifyPass: true, maxParallelChunkCalls: 4 },
  'claude-opus-4-5': { recordsPerBatch: 150, chunkCharBudget: 12000, useVerifyPass: true, maxParallelChunkCalls: 4 },
  local: { recordsPerBatch: 10, chunkCharBudget: 800, useVerifyPass: false, maxParallelChunkCalls: 1 },
}

/** Bounds enforced on an admin's own "Custom" record-per-batch entry — re-clamped here regardless of whatever the client-side `NumberInput` already enforces, since a client-supplied number is never trusted as-is. Guards against both an oversized single batch (could blow past `client.ts`'s shared `max_tokens: 1024`) and a `0`/negative value (would break the batch-splitting loop below). */
const CUSTOM_RECORDS_PER_BATCH_MIN = 1
const CUSTOM_RECORDS_PER_BATCH_MAX = 1000

/** Hard cap on how many entities one lookup ever pulls data for, regardless of how many the model names — keeps a single lookup message's total cost bounded even in the worst case. */
const MAX_LOOKUP_ENTITIES = 5

function resolveModelCapability(modelOverride: store.AssistantModel | undefined): AssistantModelCapability {
  if (store.getAssistantProvider() !== 'claude') return ASSISTANT_MODEL_CAPABILITIES.local
  return ASSISTANT_MODEL_CAPABILITIES[modelOverride ?? store.getAssistantModel()]
}

function resolveRecordsPerBatch(capability: AssistantModelCapability, chunkSizePreference: ChunkSizePreference | undefined, customChunkRecordCount: number | undefined): number {
  if (chunkSizePreference === 'small') return Math.max(1, Math.round(capability.recordsPerBatch / 2))
  if (chunkSizePreference === 'large') return capability.recordsPerBatch * 2
  if (chunkSizePreference === 'custom') {
    const raw = typeof customChunkRecordCount === 'number' && Number.isFinite(customChunkRecordCount) ? Math.round(customChunkRecordCount) : capability.recordsPerBatch
    return Math.min(CUSTOM_RECORDS_PER_BATCH_MAX, Math.max(CUSTOM_RECORDS_PER_BATCH_MIN, raw))
  }
  // 'auto' and 'medium' both just mean "the active model/provider's own profile, unmodified."
  return capability.recordsPerBatch
}

/** The map step's own small, structured schema — bounded and low-error enough that it never needs a verify pass of its own (see `answerLookup`'s own doc comment). */
interface LookupBatchFacts {
  matchingCount: number
  matchingExamples: string[]
}

const LOOKUP_BATCH_SCHEMA: AssistantJsonSchema = {
  type: 'object',
  properties: {
    matchingCount: { type: 'number', description: "How many records in this batch are relevant to the admin's question — 0 if none are, which is itself a complete, valid result." },
    matchingExamples: { type: 'array', items: { type: 'string' }, description: 'A few short, human-readable examples of matching records from this batch (e.g. names/titles), up to 5. Empty if matchingCount is 0.' },
  },
  required: ['matchingCount', 'matchingExamples'],
  additionalProperties: false,
}

/**
 * Builds one entity's own data block for `answerLookup`'s final compose
 * call. Below the active chunk budget, that's just the entity's full
 * `listAll` data, verbatim — the common case for a small cafe's real data.
 * Above it, splits the live records into bounded batches and runs a
 * map-reduce instead of truncating: each batch gets one single-pass "map"
 * call with `LOOKUP_BATCH_SCHEMA` (never a verify pass — a narrow, low-error
 * task), and the batches' structured results are combined here in plain
 * code (`+=`/array concat) rather than by asking the model to re-summarize
 * prose, which would just reintroduce the same accuracy risk one layer up.
 */
async function buildEntityDataBlock(
  entity: AssistantEntity<unknown>,
  context: AssistantFillContext,
  message: string,
  uiLanguage: 'no' | 'en',
  recordsPerBatch: number,
  chunkCharBudget: number,
  modelOverride: store.AssistantModel | undefined,
  trace: AssistantTraceEntry[],
): Promise<string> {
  const data = await entity.listAll!(context)
  const records = Array.isArray(data) ? data : [data]
  const serialized = JSON.stringify(records)

  if (serialized.length <= chunkCharBudget && records.length <= recordsPerBatch) {
    return `"${entity.key}" current data:\n${serialized}`
  }

  const batches: unknown[][] = []
  for (let i = 0; i < records.length; i += recordsPerBatch) batches.push(records.slice(i, i + recordsPerBatch))

  let totalMatchingCount = 0
  const allExamples: string[] = []
  for (const batch of batches) {
    const batchSystemPrompt = [
      languageInstruction(uiLanguage),
      `You're analyzing one batch of "${entity.key}" records from the Wraps & Coffee admin dashboard, out of several batches covering the full current data — only use the data below, never invent records that aren't there. A zero/empty result for this batch is a valid, complete answer if nothing in it is relevant.`,
      `Admin's question: ${message}`,
      `Batch data (${batch.length} records):\n${JSON.stringify(batch).slice(0, chunkCharBudget)}`,
    ].join('\n\n')

    const result = await callToolOnce<LookupBatchFacts>({
      systemPrompt: batchSystemPrompt,
      userText: message,
      toolName: 'lookup_batch',
      toolDescription: "Report how many records in this batch are relevant to the admin's question, with a few examples.",
      schema: LOOKUP_BATCH_SCHEMA,
      model: modelOverride,
      trace,
    })
    totalMatchingCount += result.matchingCount
    allExamples.push(...result.matchingExamples)
  }

  return `"${entity.key}" current data (summarized across ${batches.length} batches covering ${records.length} total records): matchingCount=${totalMatchingCount}, examples=${JSON.stringify(allExamples.slice(0, 10))}`
}

/**
 * Answers a factual question about the cafe's own current dashboard data —
 * routed here from `selectIntent`'s own `lookupEntities` result, never
 * called directly by the client with an arbitrary entity list. Never writes
 * anything, same posture as every other step; see the plan behind this
 * feature for the full design (chunking, per-model capability profile).
 */
export async function answerLookup(
  session: AssistantSession,
  message: string,
  uiLanguage: 'no' | 'en',
  entityKeys: string[],
  modelOverride?: store.AssistantModel,
  chunkSizePreference?: ChunkSizePreference,
  customChunkRecordCount?: number,
): Promise<{ reply: string; trace: AssistantTraceEntry[] }> {
  requireImplementedProvider()

  // Never trust the model's/client's own entity list — re-filter through the same session-scoped gate every other step uses, then drop anything with no `listAll` implemented (a sub-resource, or an entity that simply doesn't support lookup), then bound the total count regardless.
  const allowed = allowedEntitiesFor(session)
  const entities = entityKeys
    .map((key) => allowed.find((entity) => entity.key === key))
    .filter((entity): entity is AssistantEntity<unknown> => Boolean(entity?.listAll))
    .slice(0, MAX_LOOKUP_ENTITIES)

  if (entities.length === 0) {
    return { reply: uiLanguage === 'no' ? 'Jeg har ikke informasjon til å svare på det.' : "I don't have information to answer that.", trace: [] }
  }

  const context: AssistantFillContext = { uiLanguage, session }
  const capability = resolveModelCapability(modelOverride)
  const recordsPerBatch = resolveRecordsPerBatch(capability, chunkSizePreference, customChunkRecordCount)

  const trace: AssistantTraceEntry[] = []
  const dataBlocks = await Promise.all(
    entities.map((entity) => buildEntityDataBlock(entity, context, message, uiLanguage, recordsPerBatch, capability.chunkCharBudget, modelOverride, trace)),
  )

  const systemPrompt = [
    languageInstruction(uiLanguage),
    "You are answering a factual question about the Wraps & Coffee admin dashboard's own current data, using only the data provided below — never use outside/general knowledge, and never invent a fact the data doesn't support.",
    'An empty list, a zero count, or "no matches" in the data below is itself a complete, valid answer (e.g. "there are currently none") — do not treat it as missing information to hedge about.',
    "If the data below genuinely doesn't contain what's needed to answer, say so honestly rather than guessing.",
    dataBlocks.join('\n\n'),
  ].join('\n\n')

  const schema: AssistantJsonSchema = {
    type: 'object',
    properties: { reply: { type: 'string', description: "A short, direct answer to the admin's question, in their own language, based only on the data above." } },
    required: ['reply'],
    additionalProperties: false,
  }

  const callArgs = { systemPrompt, userText: message, toolName: 'answer_lookup', toolDescription: 'Answer the question using the provided data.', schema, model: modelOverride, trace }
  const result = capability.useVerifyPass ? await generateThenVerify<{ reply: string }>(callArgs) : await callToolOnce<{ reply: string }>(callArgs)
  return { ...result, trace }
}
