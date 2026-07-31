import * as store from '../store'
import { type AssistantImageInput, type AssistantTraceEntry, callToolOnce, currentDateInstruction, generateThenVerify, languageInstruction } from './client'
import { allowedEntitiesFor, findEntity } from './registry'
import {
  nullable,
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

/** Defensive re-clamp of whatever `history` text a caller sent — the client itself already caps this (see `useAssistantFlow.ts`'s own `transcriptToText`, last 20 lines/4000 chars), but a client-supplied string is never trusted as-is, same posture as `customChunkRecordCount` below. */
const HISTORY_CHAR_CAP = 4000

/** Below this length, `history` is already about as short as one exchange — summarizing it via `compactHistory` would barely reduce token count but still costs a full extra round-trip, so `resolveHistoryContext` passes it through unchanged even on the `'compact'` tier. */
const HISTORY_COMPACTION_THRESHOLD = 500

/**
 * One short (1-3 sentence) blurb of facts from `historyText` relevant to
 * interpreting the admin's *next* message — named entities/values already
 * discussed, a pending topic, a correction just made. Only ever called for
 * the `'compact'` model tier (see `AssistantModelCapability.historyMode`) —
 * the `'full'` tier skips this entirely and passes the raw text straight
 * through, since a strong model can just read it itself without paying for
 * an extra call. Biased toward roughly the last exchange or two rather than
 * evenly compressing the whole capped history — that's almost always what a
 * short follow-up like "remove the discount" or "no, the other one" refers
 * to.
 */
async function compactHistory(historyText: string, uiLanguage: 'no' | 'en', modelOverride: store.AssistantModel | undefined, trace: AssistantTraceEntry[]): Promise<string> {
  const schema: AssistantJsonSchema = {
    type: 'object',
    properties: {
      summary: {
        type: 'string',
        description:
          "A short (1-3 sentence) summary of facts from the conversation below relevant to interpreting the admin's next message — named entities/values already discussed, and any pending topic or correction. Plain prose, no preamble.",
      },
    },
    required: ['summary'],
    additionalProperties: false,
  }
  const systemPrompt = [
    languageInstruction(uiLanguage),
    "You are condensing a short slice of a past conversation between an admin and this AI assistant, into brief background context for another AI call about to answer the admin's next message — this is never shown to the admin directly.",
    "Focus mainly on roughly the last one or two exchanges (the most recent lines) — that's almost always what a short follow-up refers to; only reach further back if it's clearly still relevant.",
    'Write 1-3 sentences naming the concrete entities/values already discussed (e.g. a specific product/price/setting) and any pending topic or correction — never a generic restatement like "the admin asked a question."',
  ].join('\n')

  const result = await callToolOnce<{ summary: string }>({
    systemPrompt,
    userText: historyText,
    toolName: 'compact_history',
    toolDescription: 'Summarize the relevant facts/pending topic from this conversation slice.',
    schema,
    model: modelOverride,
    trace,
  })
  return result.summary
}

/**
 * Turns a step's own `history`/`historyContext` inputs into one ready-to-
 * splice string — the "compute once per turn" cost control this feature is
 * built around. `historyContext` (already resolved by an earlier call in
 * the very same turn) is used verbatim, no further model call. `history`
 * (raw, only ever sent by whichever call is actually first for its turn —
 * see `selectIntent`/`fillFields`) is compacted through one extra
 * `compactHistory` call for `'compact'`-tier models (unless it's already
 * short enough that summarizing it wouldn't save anything — see
 * `HISTORY_COMPACTION_THRESHOLD`), or passed through (re-clamped) unchanged
 * for `'full'`-tier ones. `null` when neither input was supplied — e.g. the
 * very first message of a fresh conversation, with nothing yet to summarize.
 */
async function resolveHistoryContext(
  input: { history?: string; historyContext?: string },
  uiLanguage: 'no' | 'en',
  modelOverride: store.AssistantModel | undefined,
  trace: AssistantTraceEntry[],
): Promise<string | null> {
  if (input.historyContext) return input.historyContext
  if (!input.history?.trim()) return null
  const boundedHistory = input.history.slice(-HISTORY_CHAR_CAP)
  const capability = resolveModelCapability(modelOverride)
  if (capability.historyMode === 'full' || boundedHistory.length < HISTORY_COMPACTION_THRESHOLD) return boundedHistory
  return compactHistory(boundedHistory, uiLanguage, modelOverride, trace)
}

/**
 * The one line every step's own system prompt gets when `historyContext` is
 * present. Explicitly framed as earlier turns of *this same, still-open*
 * conversation — not a separate past chat — so a reply that references it
 * reads naturally ("den er X" rather than "basert på forrige samtale...").
 * Told to defer to any authoritative current/live data given elsewhere in
 * the very same prompt (the entity's own `current` block in `fillFields`,
 * `answerLookup`'s own data blocks) — this is only for resolving a reference
 * like "it"/"that one"/"the discount", never a second source of facts to
 * trust on its own.
 */
function historyContextPromptLine(historyContext: string | null): string {
  if (!historyContext) return ''
  return `Context from earlier in this same, still-ongoing conversation (not a separate/past one) — only for resolving references like "it"/"that one"/"the discount" in the admin's message below: if it conflicts with any current/live data given elsewhere in this prompt, the current data always wins.\n${historyContext}`
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
  /** This turn's resolved conversation context (see `resolveHistoryContext`), or `null` if there was none yet — the client threads this straight through to `selectItem`/`fillFields`/`answerLookup` for the rest of this same turn, never re-resolving it. */
  historyContext: string | null
  /** Every real Claude API call this step made — see `AssistantTraceEntry`; always exactly one entry (this step is single-pass), plus one more if `resolveHistoryContext` had to call `compactHistory`. */
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
export async function selectIntent(
  session: AssistantSession,
  message: string,
  uiLanguage: 'no' | 'en',
  modelOverride?: store.AssistantModel,
  history?: string,
): Promise<IntentResult> {
  const entities = allowedEntitiesFor(session)
  if (entities.length === 0) throw new Error('No assistant actions are available to this account.')

  const trace: AssistantTraceEntry[] = []
  const historyContext = await resolveHistoryContext({ history }, uiLanguage, modelOverride, trace)

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
    currentDateInstruction(),
    'You are the AI assistant built into the Wraps & Coffee admin dashboard — a flexible catalogue/category/product system a business uses to manage whatever it sells, not limited to food and drink: a catalogue and its categories can represent any product line (e.g. a "Cars" catalogue with categories like "Sedans"/"SUVs", using custom fields such as "Mileage"/"Fuel type" the same way a food category might use its own custom fields), plus events, message boards, and staff accounts.',
    `You can create, update, or delete: ${entityListForPrompt}${entityKeys.includes('user') ? ' (non-admin accounts only)' : ''}.`,
    "If the admin's message is a specific request to create/update/delete one of those, pick exactly one entity and one action — don't try to handle more than one thing at once — and leave reply/lookupEntities null. This includes setting up an entirely new kind of product line (e.g. \"I'm going to sell cars, what do I need to do?\") — help them create a catalogue/categories/products for it, never say this dashboard doesn't support what they sell.",
    'A named menu item\'s own price (e.g. "change the price of Nachos to 110kr") is always a product update — never a category update. A category only has one optional shared *default* price applied to items that have no price of their own; naming a specific item always means that item, not its category.',
    'action is one of: "create" (make a brand new one), "update" (change an existing one), "delete" (remove one), "resetPassword" (user accounts only), "trigger" (a one-off action with no fields to fill).',
    'If the message is a factual question about the cafe\'s own current data rather than a create/update/delete request, set entity to "chat", leave action/searchText/reply null, and set lookupEntities instead (see its own description).',
    'If the message is a general question (e.g. "what can you do?"), a greeting, small talk, or anything else that is neither a create/update/delete request nor a factual data question, set entity to "chat", leave action/searchText/lookupEntities null, and write a short, helpful, conversational reply in the reply field — mention what you can help with on this dashboard when it\'s relevant to the question.',
    'If resolving a reference like "it"/"that one" via the conversation context below turns the message into a factual data question (e.g. "how much is it on sale for?" once "it" resolves to a specific product), set lookupEntities for it the same as any other factual data question — do not just report back what you resolved in a reply instead of actually looking it up; reply is only for an actual greeting/generic question with no real data need.',
    historyContextPromptLine(historyContext),
  ]
    .filter(Boolean)
    .join('\n')

  const result = await callToolOnce<Omit<IntentResult, 'trace' | 'historyContext'>>({
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
    return { ...result, action: null, reply: hasLookup ? null : result.reply, lookupEntities: hasLookup ? result.lookupEntities : null, historyContext, trace }
  }

  const entity = entities.find((candidate) => candidate.key === result.entity)
  if (!entity || !result.action || !entity.supportedActions.includes(result.action)) {
    throw new Error("Couldn't confidently tell what you want to do — try rephrasing with a specific entity and action.")
  }
  return { ...result, lookupEntities: null, historyContext, trace }
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
  historyContext?: string,
): Promise<SelectItemResult> {
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
    currentDateInstruction(),
    `Pick which existing "${entityKey}" the admin's message refers to, from the candidate list. If none clearly match, return null for itemID rather than guessing.`,
    historyContextPromptLine(historyContext ?? null),
  ]
    .filter(Boolean)
    .join('\n')

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
  | { status: 'clarify'; clarifications: FillFieldsClarification[]; trace: AssistantTraceEntry[]; historyContext: string | null }

/** Step 3 — generate-then-verify field extraction, merged onto the current item (update/resetPassword) or empty defaults (create), then run through the entity's own `validate()`. Never writes anything — see the plan's hard invariant; the caller only ever receives a staged draft to review. */
export async function fillFields(
  entityKey: string,
  action: AssistantActionName,
  session: AssistantSession,
  message: string,
  uiLanguage: 'no' | 'en',
  options: {
    itemID?: string
    image?: AssistantImageInput
    priorDraft?: unknown
    resolvedFields?: Record<string, string>
    modelOverride?: store.AssistantModel
    /** Raw recent-transcript text — only sent when this call is itself the first of its turn/continuation (the `reviewingForm`-correction path, which bypasses `selectIntent`). Mutually exclusive with `historyContext`. */
    history?: string
    /** An already-resolved value from an earlier call in the same turn (usually `selectIntent`'s). Mutually exclusive with `history`. */
    historyContext?: string
  } = {},
): Promise<FillFieldsResult> {
  const entity = requireAccessibleEntity(entityKey, session)

  const context: AssistantFillContext = { uiLanguage, session }
  const current = options.itemID && entity.getCurrent ? await entity.getCurrent(options.itemID, context) : null
  const knownDraft = current ?? options.priorDraft
  const schema = entity.fillFieldsSchema(action, context, knownDraft ?? undefined)

  const userText = options.priorDraft
    ? `The admin said the previously-proposed draft was still wrong. Previous draft: ${JSON.stringify(options.priorDraft)}\n\nCorrection: ${message}`
    : message

  const trace: AssistantTraceEntry[] = []
  const historyContext = await resolveHistoryContext({ history: options.history, historyContext: options.historyContext }, uiLanguage, options.modelOverride, trace)

  const systemPrompt = [
    languageInstruction(uiLanguage),
    currentDateInstruction(),
    `Extract field values for a "${entityKey}" ${action} from the admin's message. Only fill fields the message actually addresses — leave everything else null so it's left unchanged (on update) or defaulted (on create). Never invent values the message doesn't support.`,
    current ? `Current values (for reference on what "unchanged" means):\n${JSON.stringify(current)}` : '',
    options.image ? 'An image was attached — read any relevant text/numbers off it (e.g. a product card, a price list) and use them the same way you would text the admin typed.' : '',
    historyContextPromptLine(historyContext),
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
  if (clarifications.length > 0) return { status: 'clarify', clarifications, trace, historyContext }

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
  /** A secondary ceiling applied alongside `recordsPerBatch`, not after it — `packRecordsIntoBatches` closes a batch as soon as either bound would be exceeded, so a batch of unusually content-heavy records (bilingual name/description, custom fields, etc.) gets split into more, smaller batches rather than ever having its serialized JSON truncated mid-record. */
  chunkCharBudget: number
  /** Whether the extra `generateThenVerify` pass is worth the added latency for this tier — always used for cloud Claude; the placeholder `'local'` row opts out, since a constrained local model paying 2x latency per call may not be worth it. */
  useVerifyPass: boolean
  maxParallelChunkCalls: number
  /** `'full'` — a strong-enough model reads the (already client-capped) recent transcript itself; the raw text is passed straight through with no extra call (see `resolveHistoryContext`). `'compact'` — a real extra summarization call (`compactHistory`) condenses it into a short blurb first, so the cheaper/weaker tier pays for history-awareness once in output tokens rather than repeatedly in input tokens across a turn's several calls (the "compute once per turn" plan). Chosen for `claude-haiku-4-5` and the `local` placeholder, mirroring the haiku-vs-sonnet+ split above. */
  historyMode: 'full' | 'compact'
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
 * `'local'` (Ollama) is picked conservatively for hardware as modest as a
 * Raspberry Pi; revisit these numbers once real timing data exists from
 * actually running on one (see `ollamaClient.ts`).
 */
const ASSISTANT_MODEL_CAPABILITIES: Record<store.AssistantModel | 'local', AssistantModelCapability> = {
  // `chunkCharBudget` here (and on `local` below) was originally sized on a rough ~80 chars/record
  // assumption — real `Product` records (bilingual name/description, price, discount, allergens,
  // dietary tags, custom fields, a resolved location label) run several hundred characters each in
  // practice, so the original 2000/800 budgets forced batches far smaller than 25/10 records once
  // `packRecordsIntoBatches` actually respects this bound (see its own doc comment) — these are a
  // re-estimate, not a measured figure; revisit if real usage shows batches still splitting more
  // aggressively than intended.
  'claude-haiku-4-5': { recordsPerBatch: 25, chunkCharBudget: 6000, useVerifyPass: true, maxParallelChunkCalls: 4, historyMode: 'compact' },
  'claude-sonnet-4-5': { recordsPerBatch: 150, chunkCharBudget: 12000, useVerifyPass: true, maxParallelChunkCalls: 4, historyMode: 'full' },
  'claude-opus-4-5': { recordsPerBatch: 150, chunkCharBudget: 12000, useVerifyPass: true, maxParallelChunkCalls: 4, historyMode: 'full' },
  local: { recordsPerBatch: 10, chunkCharBudget: 2400, useVerifyPass: false, maxParallelChunkCalls: 1, historyMode: 'compact' },
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

/** The map step's own small, structured schema — still gets a verify pass on any tier whose `AssistantModelCapability.useVerifyPass` calls for one (see `buildEntityDataBlock`): real testing showed a weaker model can confidently over-include an entire batch on a filtering question it has no clean signal for (e.g. "on sale"), which is exactly the kind of mistake a second look catches — this was wrongly assumed "low-error enough to skip" before that was actually observed. */
interface LookupBatchFacts {
  matchingCount: number
  matchingExamples: string[]
}

const LOOKUP_BATCH_SCHEMA: AssistantJsonSchema = {
  type: 'object',
  properties: {
    matchingCount: { type: 'number', description: "How many records in this batch are relevant to the admin's question — 0 if none are, which is itself a complete, valid result." },
    matchingExamples: {
      type: 'array',
      items: { type: 'string' },
      description:
        "Every matching record's short, human-readable name/title from this batch (e.g. a product name) — the complete list of matches, not a capped sample, since the admin may be asking to see everything, not just a count. Empty if matchingCount is 0.",
    },
  },
  required: ['matchingCount', 'matchingExamples'],
  additionalProperties: false,
}

/**
 * Greedily bin-packs `records` into batches that respect both `recordsPerBatch`
 * and `chunkCharBudget` — a batch closes (and a new one starts) as soon as
 * adding the next record would exceed *either* bound, so every batch's own
 * serialized JSON always stays under budget without ever slicing a record's
 * JSON in half. A single record whose own serialized size alone exceeds
 * `chunkCharBudget` still gets a batch of its own, sent whole: the budget is
 * a soft cost/focus knob on the model's working set, not a hard technical
 * limit, so slightly exceeding it for one outlier is fine — silently handing
 * the model truncated, invalid JSON is not (see the plan behind this fix).
 */
function packRecordsIntoBatches(records: unknown[], recordsPerBatch: number, chunkCharBudget: number): unknown[][] {
  const batches: unknown[][] = []
  let currentBatch: unknown[] = []
  let currentSize = 0
  for (const record of records) {
    const recordSize = JSON.stringify(record).length
    if (currentBatch.length > 0 && (currentBatch.length >= recordsPerBatch || currentSize + recordSize > chunkCharBudget)) {
      batches.push(currentBatch)
      currentBatch = []
      currentSize = 0
    }
    currentBatch.push(record)
    currentSize += recordSize
  }
  if (currentBatch.length > 0) batches.push(currentBatch)
  return batches
}

/**
 * Builds one entity's own data block for `answerLookup`'s final compose
 * call. Below the active chunk budget, that's just the entity's full
 * `listAll` data, verbatim — the common case for a small cafe's real data.
 * Above it, splits the live records into bounded batches (`packRecordsIntoBatches`)
 * and runs a map-reduce instead of truncating: each batch gets one "map" call
 * with `LOOKUP_BATCH_SCHEMA` (a verify pass too, on any tier whose capability
 * calls for one — see `LOOKUP_BATCH_SCHEMA`'s own doc comment for why this
 * step needs the same double-check as everything else despite looking
 * "narrow"), and the batches' structured results are combined here in plain
 * code (`+=`/array concat) rather than by asking the model to re-summarize
 * prose, which would just reintroduce the same accuracy risk one layer up.
 * Every matching record's name is kept, never capped to a sample — a "how
 * many" question only needs the count, but a "list them all" question needs
 * the complete list, and there's no way to tell which the admin meant before
 * the model actually reads it.
 */
async function buildEntityDataBlock(
  entity: AssistantEntity<unknown>,
  context: AssistantFillContext,
  message: string,
  uiLanguage: 'no' | 'en',
  recordsPerBatch: number,
  chunkCharBudget: number,
  useVerifyPass: boolean,
  historyContext: string | null,
  modelOverride: store.AssistantModel | undefined,
  trace: AssistantTraceEntry[],
): Promise<string> {
  const data = await entity.listAll!(context)
  const records = Array.isArray(data) ? data : [data]
  const serialized = JSON.stringify(records)
  const datasetSummary = (await entity.datasetSummary?.(context)) ?? ''

  if (serialized.length <= chunkCharBudget && records.length <= recordsPerBatch) {
    return [datasetSummary, `"${entity.key}" current data:\n${serialized}`].filter(Boolean).join('\n\n')
  }

  const batches = packRecordsIntoBatches(records, recordsPerBatch, chunkCharBudget)

  let totalMatchingCount = 0
  const allMatches: string[] = []
  for (const batch of batches) {
    const batchSystemPrompt = [
      languageInstruction(uiLanguage),
      currentDateInstruction(),
      `You're analyzing one batch of "${entity.key}" records from the Wraps & Coffee admin dashboard, out of several batches covering the full current data — only use the data below, never invent records that aren't there.`,
      'A zero/empty result for this batch is a valid, complete, and common answer if nothing in it is relevant — do not default to including a record just because it appears in the data. Every match must be traceable to an explicit field value in that specific record (e.g. a real discount/price/stock/tag field actually set on it) — never inferred from a category, a shared trait with a record you already matched, or the record simply being a real, currently-listed item. When you are not sure whether one specific record satisfies the question, exclude it rather than include it — but first check whether the guidance below already resolves that uncertainty for you.',
      entity.lookupGuidance ?? '',
      historyContextPromptLine(historyContext),
      `Admin's question: ${message}`,
      `Batch data (${batch.length} records):\n${JSON.stringify(batch)}`,
    ]
      .filter(Boolean)
      .join('\n\n')

    const batchCallArgs = {
      systemPrompt: batchSystemPrompt,
      userText: message,
      toolName: 'lookup_batch',
      toolDescription: "Report how many records in this batch are relevant to the admin's question, and the complete list of their names.",
      schema: LOOKUP_BATCH_SCHEMA,
      model: modelOverride,
      trace,
    }
    const result = useVerifyPass ? await generateThenVerify<LookupBatchFacts>(batchCallArgs) : await callToolOnce<LookupBatchFacts>(batchCallArgs)
    totalMatchingCount += result.matchingCount
    allMatches.push(...result.matchingExamples)
  }

  const batchedResultSummary = `"${entity.key}" data (${records.length} total records) has already been fully checked, batch by batch, against the admin's exact question ("${message}") — this is the complete, final result, not a sample: ${totalMatchingCount} record(s) satisfy it. Every one of their names: ${JSON.stringify(allMatches)}`
  return [datasetSummary, batchedResultSummary].filter(Boolean).join('\n\n')
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
  historyContext?: string,
): Promise<{ reply: string; trace: AssistantTraceEntry[] }> {

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
    entities.map((entity) =>
      buildEntityDataBlock(entity, context, message, uiLanguage, recordsPerBatch, capability.chunkCharBudget, capability.useVerifyPass, historyContext ?? null, modelOverride, trace),
    ),
  )

  const lookupGuidance = entities
    .map((entity) => entity.lookupGuidance)
    .filter(Boolean)
    .join('\n')

  const systemPrompt = [
    languageInstruction(uiLanguage),
    currentDateInstruction(),
    "You are answering a factual question about the Wraps & Coffee admin dashboard's own current data, using only the data provided below — never use outside/general knowledge, and never invent a fact the data doesn't support.",
    'An empty list, a zero count, or "no matches" in the data below is itself a complete, valid answer (e.g. "there are currently none") — do not treat it as missing information to hedge about.',
    'Any data block below that says a count of records "satisfy" the question has already been fully, completely checked against that exact question, record by record — that number and name list are the final answer, not a sample or a subset needing further detail. Report the count as a definite fact (e.g. "there are 7") — never hedge with "I only have example data" or "I\'d need more detail (like dates) to know for sure" when that checking has already been done for you.',
    "If the data below genuinely doesn't contain what's needed to answer, say so honestly rather than guessing.",
    lookupGuidance,
    historyContextPromptLine(historyContext ?? null),
    dataBlocks.join('\n\n'),
  ]
    .filter(Boolean)
    .join('\n\n')

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

/**
 * A generic "just read this photo" mode, entirely separate from the
 * create/update/delete flow above — no entity, no draft, no write path to
 * bypass. Reused for any photographed document the admin wants read back as
 * text (a menu, a price list, a house listing, anything), not just the
 * dashboard's own data — see `AssistantPanel`'s image-mode toggle, which
 * routes here instead of `fillFields` when the admin picks "just read this
 * photo" rather than "fill a form from it". Always uses `generateThenVerify`
 * (never gated by a capability's `useVerifyPass`) since a second look at the
 * same image is the best available lever against a small local vision
 * model's misreads — see the plan behind this feature.
 */
export async function transcribeAttachment(
  message: string,
  uiLanguage: 'no' | 'en',
  image: AssistantImageInput,
  modelOverride?: store.AssistantModel,
): Promise<{ text: string; trace: AssistantTraceEntry[] }> {
  const schema: AssistantJsonSchema = {
    type: 'object',
    properties: { text: { type: 'string', description: 'A complete, faithful transcription of the relevant text/numbers in the photo, following the admin\'s own instructions if given any.' } },
    required: ['text'],
    additionalProperties: false,
  }

  const systemPrompt = [
    languageInstruction(uiLanguage),
    'You are reading a photographed document for the admin — a menu, a price list, a house listing, a notice, or anything else, not limited to this cafe\'s own data.',
    message.trim()
      ? `Follow the admin's own instructions for what to do with it: ${message}`
      : 'No specific instructions were given — produce a complete, faithful transcription of every relevant piece of text/numbers in the photo.',
    'Never invent text that is illegible or not actually present — say so honestly instead of guessing.',
  ]
    .filter(Boolean)
    .join('\n')

  const trace: AssistantTraceEntry[] = []
  const result = await generateThenVerify<{ text: string }>({
    systemPrompt,
    userText: message.trim() || 'Transcribe this photo.',
    image,
    toolName: 'transcribe_attachment',
    toolDescription: 'Report the transcribed text from the photo.',
    schema,
    model: modelOverride,
    trace,
  })
  return { ...result, trace }
}
