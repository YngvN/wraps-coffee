import * as store from '../store'
import { type AssistantImageInput, type AssistantTraceEntry, callToolOnce, currentDateInstruction, generateThenVerify, languageInstruction } from './client'
import { combineCompoundReplies, combineFocusUpdates, splitCompoundQuestion, type LookupHalfResult } from './compoundSplit'
import { focusFromUpdate, getDialogFocus, setDialogFocus, type DialogFocusUpdate } from './dialogFocus'
import { buildLookupQuerySchema, executeLookupQuery, type LookupQueryField, type LookupQueryFilterInput, type LookupQueryRecord, type LookupQuerySpec } from './lookupQuery'
import { resolvePronounFocus } from './pronounPrefilter'
import { allowedEntitiesFor, findEntity } from './registry'
import {
  nullable,
  type AssistantActionName,
  type AssistantCandidate,
  type AssistantEntity,
  type AssistantFillContext,
  type AssistantJsonSchema,
  type AssistantListItem,
  type AssistantReplyList,
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

/**
 * Norwegian/English nouns that unambiguously name each entity for a general
 * filter/count/list question (e.g. "hvor mange **produkter**..."). Used only
 * by `detectEntitiesFromKeywords` below, itself only used by the local
 * cascade's own `'question'` branch (see `selectIntentCascaded`) — real
 * testing showed the same question ("Hvor mange produkter har vi?", with the
 * entity noun literally in the message) resolved `lookupEntities: ["product"]`
 * on one run and `lookupEntities: []` on another, the second time falling
 * through to a hard "I'm not sure what you mean" — a single bad sample from a
 * 3B model turning a trivially-answerable question into a dead end. A plain
 * keyword match removes that variance for the common case entirely; the
 * existing `selectLookupTarget` LLM call is still the fallback whenever no
 * keyword matches (a genuinely ambiguous question, or a language this table
 * doesn't cover a phrasing for).
 *
 * Deliberately not exhaustive of every entity — `categoryCustomField`/
 * `appearanceThemeColor` (sub-resources) and `contactInfo`/`storeSettings`
 * (singletons rarely asked about by a generic noun) are omitted, same
 * "opt-in per entity" convention `lookupGuidance`/`lookupQueryFields` already
 * use elsewhere. Trivially extensible by adding another entry.
 */
const ENTITY_KEYWORDS: Partial<Record<string, { no: string[]; en: string[] }>> = {
  product: { no: ['produkt', 'produkter', 'vare', 'varer'], en: ['product', 'products'] },
  event: { no: ['arrangement', 'arrangementer', 'hendelse', 'hendelser'], en: ['event', 'events'] },
  category: { no: ['kategori', 'kategorier'], en: ['category', 'categories'] },
  catalogue: { no: ['katalog', 'kataloger', 'meny', 'menyer'], en: ['catalogue', 'catalog', 'menu', 'menus'] },
  user: { no: ['bruker', 'brukere', 'ansatt', 'ansatte'], en: ['user', 'users', 'staff'] },
  messageBoard: { no: ['oppslagstavle', 'oppslagstavler'], en: ['message board', 'message boards'] },
  messageBoardPost: { no: ['innlegg'], en: ['post', 'posts'] },
  theme: { no: ['tema', 'temaer'], en: ['theme', 'themes'] },
  integrationToggle: { no: ['integrasjon', 'integrasjoner'], en: ['integration', 'integrations'] },
}

/**
 * Plain substring matching, not exhaustive word-boundary regex — deliberately
 * simple, since a false *miss* here just falls through to the existing (and
 * already mostly-working) `selectLookupTarget` LLM call, never a false
 * failure. A false *extra* match (e.g. a compound word containing another
 * entity's keyword as a substring) can at worst add an extra entity to a
 * multi-entity lookup, which the existing `MAX_LOOKUP_ENTITIES` cap and
 * per-entity data blocks already handle safely — never a hard failure.
 */
function detectEntitiesFromKeywords(message: string, allowedEntityKeys: string[], uiLanguage: 'no' | 'en'): string[] {
  const lower = message.toLowerCase()
  return allowedEntityKeys.filter((key) => ENTITY_KEYWORDS[key]?.[uiLanguage]?.some((word) => lower.includes(word)))
}

/**
 * "alle"/"all" combined with a known entity noun (see `detectEntitiesFromKeywords`) is a stronger,
 * safer signal than a bare interrogative — unlike the entity-keyword prefilter above (only ever
 * replaces `selectLookupTarget`, never `classifyMessageType`, since real ambiguity remained there),
 * this specific combination is safe to skip `classifyMessageType` for entirely: you never "create
 * all products," and you'd never say "all" referring to your own previous reply, so there's no
 * command/meta case this could misroute. Added after real testing showed "Gi meg en liste over alle
 * produkter" ("Give me a list of all products") got classified as a `create` command, and its
 * `fill_fields_product` verify pass then fabricated an entire fake product from the empty draft —
 * see `fillFields`'s own empty-draft guard below for the second, independent layer against that
 * same failure. Checked at the very top of `selectIntentCascaded`, before any model call at all.
 */
const BULK_LIST_WORDS: Record<'no' | 'en', string[]> = { no: ['alle'], en: ['all'] }

function detectBulkListQuestion(message: string, allowedEntityKeys: string[], uiLanguage: 'no' | 'en'): string[] {
  const lower = message.toLowerCase()
  if (!BULK_LIST_WORDS[uiLanguage].some((word) => lower.includes(word))) return []
  return detectEntitiesFromKeywords(message, allowedEntityKeys, uiLanguage)
}

/** "hvor mange"/"how many" is a near-100% signal for a plain count question in both languages — used by `buildEntityQueryDataBlock` to decide whether it can phrase the reply itself (see `AssistantEntity.countLabel`) instead of handing it to the final `answer_lookup` compose call, which real testing showed can invent a filter nobody asked for (context bleed from an earlier, unrelated question) even when the query step itself resolved correctly. */
const COUNT_QUESTION_PATTERNS: Record<'no' | 'en', RegExp> = { no: /hvor mange/i, en: /how many/i }

function isCountQuestion(message: string, uiLanguage: 'no' | 'en'): boolean {
  return COUNT_QUESTION_PATTERNS[uiLanguage].test(message)
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
async function compactHistory(
  historyText: string,
  uiLanguage: 'no' | 'en',
  modelOverride: store.AssistantModel | undefined,
  providerOverride: store.AssistantProvider | undefined,
  localModelOverride: string | undefined,
  trace: AssistantTraceEntry[],
): Promise<string> {
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
    provider: providerOverride,
    localModel: localModelOverride,
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
  providerOverride: store.AssistantProvider | undefined,
  localModelOverride: string | undefined,
  trace: AssistantTraceEntry[],
): Promise<string | null> {
  if (input.historyContext) return input.historyContext
  if (!input.history?.trim()) return null
  const boundedHistory = input.history.slice(-HISTORY_CHAR_CAP)
  const capability = resolveModelCapability(modelOverride, providerOverride)
  if (capability.historyMode === 'full' || boundedHistory.length < HISTORY_COMPACTION_THRESHOLD) return boundedHistory
  return compactHistory(boundedHistory, uiLanguage, modelOverride, providerOverride, localModelOverride, trace)
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
  /** Meaningful for a real entity action (finds the update/delete target), or for a `'chat'`+`lookupEntities` question about one specific, already-named item — see `answerLookup`'s own single-item fast path, which uses this the same way `selectItem` uses it for the CRUD flow. `null` for a filter/count/list question with no one named item to search for. */
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
  /**
   * Only ever set by the deterministic pronoun prefilter (see `pronounPrefilter.ts`) when a
   * plural referring pronoun ("de"/"dem"/"disse") resolved against the conversation's own
   * `DialogFocus.lastSet` — the filter that set was itself narrowed by, composed (AND'd) with
   * whatever filter this turn's own `lookup_query` call resolves, so a follow-up like "hvor mange
   * av dem koster over 100 kr" doesn't lose the prior turn's own scope. The client threads this
   * straight through to `answerLookup`, same posture as `historyContext`/`searchText`. `null`/
   * `undefined` for every other case (nothing to compose).
   */
  baseFilters?: LookupQueryFilterInput[] | null
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
  providerOverride?: store.AssistantProvider,
  localModelOverride?: string,
  /** This chat's own id (see `useAssistantFlow.ts`) — only ever consulted by the local cascade's pronoun prefilter (see `selectIntentCascaded`/`resolvePronounFocus`) to look up this conversation's `DialogFocus`. Never touched on the Claude path. */
  conversationId?: string,
): Promise<IntentResult> {
  const entities = allowedEntitiesFor(session)
  if (entities.length === 0) throw new Error('No assistant actions are available to this account.')

  const trace: AssistantTraceEntry[] = []
  const historyContext = await resolveHistoryContext({ history }, uiLanguage, modelOverride, providerOverride, localModelOverride, trace)

  const provider = providerOverride ?? store.getAssistantProvider()
  const raw =
    provider === 'local'
      ? await selectIntentCascaded(entities, message, uiLanguage, modelOverride, providerOverride, localModelOverride, history, historyContext, trace, conversationId)
      : await selectIntentSinglePass(entities, message, uiLanguage, modelOverride, providerOverride, historyContext, trace)

  // Never trust the model to have kept `entity`/`action`/`reply`/`lookupEntities` mutually
  // consistent on its own — a non-empty `lookupEntities` is treated as authoritative regardless of
  // whatever `entity`/`action` the model also filled in, not just when `entity === 'chat'`. Real
  // testing against a local model showed it can correctly recognize a factual question (setting
  // `lookupEntities`) while *also* misfiring `entity`/`action` into a bogus create/update/delete
  // choice on the very same call (e.g. "which products are on sale?" got `lookupEntities:
  // ["product"]` — right — alongside `entity: "product", action: "update"` — wrong); discarding the
  // correct signal just because `entity` wasn't literally `"chat"` routed that message into editing
  // a random product instead of just answering the question. Preferring the lookup path on any
  // ambiguity/contradiction is also strictly the safer choice per this function's own doc
  // comment — a lookup misroute is harmless by construction, since it never proposes a write. Kept
  // as a shared safety net for both paths below even though `selectIntentCascaded`'s own branches
  // can no longer produce a contradictory combination by construction — cheap insurance either way.
  const hasLookup = Boolean(raw.lookupEntities && raw.lookupEntities.length > 0)
  if (raw.entity === 'chat' || hasLookup) {
    return { ...raw, entity: 'chat', action: null, reply: hasLookup ? null : raw.reply, lookupEntities: hasLookup ? raw.lookupEntities : null, historyContext, trace }
  }

  const entity = entities.find((candidate) => candidate.key === raw.entity)
  if (!entity || !raw.action || !entity.supportedActions.includes(raw.action)) {
    throw new Error("Couldn't confidently tell what you want to do — try rephrasing with a specific entity and action.")
  }
  return { ...raw, lookupEntities: null, historyContext, trace }
}

type RawIntentResult = Omit<IntentResult, 'trace' | 'historyContext'>

const SEARCH_TEXT_DESCRIPTION =
  'A short phrase to help find the target existing item — meaningful when action is not "create", or when entity is "chat" and lookupEntities names a single entity because the question is actually about one specific, already-named item (e.g. "how much does the Chicken Fajitas wrap cost?" → "Chicken Fajitas") rather than a filter/count across many records (e.g. "how many products are on sale?" leaves this null — there is no one named item to search for).'

/** Used verbatim by `selectIntentSinglePass` — Claude's own path stays byte-for-byte unchanged from before this cascade existed. */
const LOOKUP_ENTITIES_DESCRIPTION_FOR_CHAT_ENTITY =
  'Only when entity is "chat": set this instead of reply when the message is a factual question about the cafe\'s own current data (e.g. "what message boards exist?", "how many products are in category X?", "what are our opening hours?") — which of the entities above would have the data to answer it (usually 1, rarely more than 2-3). This includes a question naming one specific, already-identifiable item (e.g. "how much does the Chicken Fajitas wrap cost?", "is the Chicken Fajitas wrap on sale?") — that is still a factual question, not a create/update/delete request, even though a specific item is named; set lookupEntities to ["product"] for it rather than treating the named item as something to edit. A question about products\' own price/discount/availability (e.g. "how many products are on sale") always means "product", never "category", even though the word "products" appears — see the entity descriptions above for why. Leave null for a generic question/greeting/small talk with no real data need, and answer via reply instead.'

/** Used by the local cascade's `selectLookupTarget` — same rule as `LOOKUP_ENTITIES_DESCRIPTION_FOR_CHAT_ENTITY` above, reworded for a schema with no `entity`/`reply` fields to reference (this branch only ever runs once `classifyMessageType` already committed to "question"). */
const LOOKUP_ENTITIES_DESCRIPTION =
  'Which of the entities above would have the data to answer this factual question about the cafe\'s own current data (e.g. "what message boards exist?", "how many products are in category X?", "what are our opening hours?") — usually 1, rarely more than 2-3. This includes a question naming one specific, already-identifiable item (e.g. "how much does the Chicken Fajitas wrap cost?", "is the Chicken Fajitas wrap on sale?") — that is still a factual question, not a create/update/delete request, even though a specific item is named; set this to ["product"] for it rather than treating the named item as something to edit. A question about products\' own price/discount/availability (e.g. "how many products are on sale") always means "product", never "category", even though the word "products" appears — see the entity descriptions above for why.'

/** Used verbatim by `selectIntentSinglePass` — Claude's own path stays byte-for-byte unchanged from before this cascade existed. */
const REFERENCE_RESOLUTION_LINE_WITH_REPLY =
  'If resolving a reference like "it"/"that one" via the conversation context below turns the message into a factual data question (e.g. "how much is it on sale for?" once "it" resolves to a specific product), set lookupEntities for it the same as any other factual data question — do not just report back what you resolved in a reply instead of actually looking it up; reply is only for an actual greeting/generic question with no real data need. This includes searchText too: once a reference resolves to one specific, already-discussed item, set searchText to that item\'s own name (e.g. "how much is it in kroner?" right after discussing "Chicken Fajitas" still sets searchText to "Chicken Fajitas") — every later follow-up about the same item needs this set again, not just the first question that named it.'

/** Used by the local cascade's `selectLookupTarget` — same rule as `REFERENCE_RESOLUTION_LINE_WITH_REPLY` above, minus the "reply" field callout, since that branch's own schema has no `reply` field to confuse it with. */
const REFERENCE_RESOLUTION_LINE =
  'If resolving a reference like "it"/"that one" via the conversation context below turns the message into a factual data question (e.g. "how much is it on sale for?" once "it" resolves to a specific product), treat it the same as any other factual data question — do not just report back what you resolved instead of actually looking it up. This includes searchText too: once a reference resolves to one specific, already-discussed item, set searchText to that item\'s own name (e.g. "how much is it in kroner?" right after discussing "Chicken Fajitas" still sets searchText to "Chicken Fajitas") — every later follow-up about the same item needs this set again, not just the first question that named it.'

/** The "who you are" line every `selectIntent` prompt (single-pass or cascaded) opens with. */
const ASSISTANT_INTRO_LINE =
  'You are the AI assistant built into the Wraps & Coffee admin dashboard — a flexible catalogue/category/product system a business uses to manage whatever it sells, not limited to food and drink: a catalogue and its categories can represent any product line (e.g. a "Cars" catalogue with categories like "Sedans"/"SUVs", using custom fields such as "Mileage"/"Fuel type" the same way a food category might use its own custom fields), plus events, message boards, and staff accounts.'

function entityListLine(entityListForPrompt: string, hasUserEntity: boolean): string {
  return `You can create, update, or delete: ${entityListForPrompt}${hasUserEntity ? ' (non-admin accounts only)' : ''}.`
}

/** Shared "a named item's own price is always that item, never its category" rule — applies equally to a CRUD price edit and a factual price/discount question. */
const PRODUCT_VS_CATEGORY_PRICE_LINE =
  'A named menu item\'s own price (e.g. "change the price of Nachos to 110kr") is always a product update — never a category update. A category only has one optional shared *default* price applied to items that have no price of their own; naming a specific item always means that item, not its category. The same distinction applies to a factual question about price/discount/availability (e.g. "how many products are on sale?", "how much does Nachos cost?") — that always needs product data, never category, regardless of whether the word "product(s)" or a specific item name appears in the message.'

/** `action is one of: ...` — shared verbatim between Claude's single-pass schema and the local cascade's `selectCommand` branch. */
const ACTION_ENUM_LINE = 'action is one of: "create" (make a brand new one), "update" (change an existing one), "delete" (remove one), "resetPassword" (user accounts only), "trigger" (a one-off action with no fields to fill).'

/** Bundled shared context for the local cascade's own branch calls (`classifyMessageType`/`selectCommand`/`composeChatReply`) — order/bundling here has no "byte-identical" constraint the way `selectIntentSinglePass` does, since this prompt surface is new. */
function assistantIntroLines(entityListForPrompt: string, hasUserEntity: boolean): string[] {
  return [ASSISTANT_INTRO_LINE, entityListLine(entityListForPrompt, hasUserEntity), PRODUCT_VS_CATEGORY_PRICE_LINE]
}

/** Claude's own path — unchanged single-pass call (a coarse, low-ambiguity choice from a small enum; any mistake on the CRUD path is still caught by the later confirm-before-write review). See `selectIntent`'s own doc comment for why this stays single-pass here: real testing found no reliability problem with Claude keeping these fields mutually consistent, unlike the local provider (see `selectIntentCascaded`). */
async function selectIntentSinglePass(
  entities: AssistantEntity<unknown>[],
  message: string,
  uiLanguage: 'no' | 'en',
  modelOverride: store.AssistantModel | undefined,
  providerOverride: store.AssistantProvider | undefined,
  historyContext: string | null,
  trace: AssistantTraceEntry[],
): Promise<RawIntentResult> {
  const entityKeys = entities.map((entity) => entity.key)
  const entityListForPrompt = entities.map((entity) => `${entity.key} (${ENTITY_DESCRIPTIONS[entity.key] ?? ''})`).join(', ')
  const schema: AssistantJsonSchema = {
    type: 'object',
    properties: {
      entity: { type: 'string', enum: [...entityKeys, 'chat'] },
      action: nullable({ type: 'string', enum: ALL_ACTIONS }),
      searchText: nullable({ type: 'string', description: SEARCH_TEXT_DESCRIPTION }),
      reply: nullable({ type: 'string', description: 'Your conversational reply, in the admin\'s own language — set only when entity is "chat" and lookupEntities is empty, otherwise leave null.' }),
      lookupEntities: nullable({
        type: 'array',
        items: { type: 'string', enum: entityKeys },
        description: LOOKUP_ENTITIES_DESCRIPTION_FOR_CHAT_ENTITY,
      }),
    },
    required: ['entity', 'action', 'searchText', 'reply', 'lookupEntities'],
    additionalProperties: false,
  }

  const systemPrompt = [
    languageInstruction(uiLanguage),
    currentDateInstruction(),
    ASSISTANT_INTRO_LINE,
    entityListLine(entityListForPrompt, entityKeys.includes('user')),
    "If the admin's message is a specific request to create/update/delete one of those, pick exactly one entity and one action — don't try to handle more than one thing at once — and leave reply/lookupEntities null. This includes setting up an entirely new kind of product line (e.g. \"I'm going to sell cars, what do I need to do?\") — help them create a catalogue/categories/products for it, never say this dashboard doesn't support what they sell.",
    PRODUCT_VS_CATEGORY_PRICE_LINE,
    ACTION_ENUM_LINE,
    'If the message is a factual question about the cafe\'s own current data rather than a create/update/delete request, set entity to "chat", leave action/searchText/reply null, and set lookupEntities instead (see its own description).',
    'If the message is a general question (e.g. "what can you do?"), a greeting, small talk, or anything else that is neither a create/update/delete request nor a factual data question, set entity to "chat", leave action/searchText/lookupEntities null, and write a short, helpful, conversational reply in the reply field — mention what you can help with on this dashboard when it\'s relevant to the question.',
    REFERENCE_RESOLUTION_LINE_WITH_REPLY,
    historyContextPromptLine(historyContext),
  ]
    .filter(Boolean)
    .join('\n')

  return callToolOnce<RawIntentResult>({
    systemPrompt,
    userText: message,
    toolName: 'select_intent',
    toolDescription: "Choose which entity and action the admin's message is about, or answer directly/look up data via the chat fallback.",
    schema,
    model: modelOverride,
    provider: providerOverride,
    trace,
  })
}

/** The 4-way split `selectIntentCascaded` classifies every local-provider message into — see that function's own doc comment for why this exists instead of one combined call. */
type MessageType = 'command' | 'question' | 'meta' | 'chat'

/** The literal last `Assistant: ...` line from `historyRaw` (see `useAssistantFlow.ts`'s own `transcriptToText`), uncompacted — specifically for the `'meta'` classification/reply below, where the exact wording of the assistant's own last answer matters and a `resolveHistoryContext`-compacted blurb could lose it. `null` if there's no prior assistant line yet (the very first message of a conversation). */
function extractLastAssistantLine(historyRaw: string | undefined): string | null {
  if (!historyRaw) return null
  const lines = historyRaw.split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].startsWith('Assistant: ')) return lines[i].slice('Assistant: '.length)
  }
  return null
}

/** First step of the local cascade — a tiny, single-field classification. See `selectIntentCascaded`'s own doc comment for why this exists. */
async function classifyMessageType(
  entityListForPrompt: string,
  hasUserEntity: boolean,
  historyContext: string | null,
  lastAssistantReply: string | null,
  message: string,
  uiLanguage: 'no' | 'en',
  modelOverride: store.AssistantModel | undefined,
  providerOverride: store.AssistantProvider | undefined,
  localModelOverride: string | undefined,
  trace: AssistantTraceEntry[],
): Promise<MessageType> {
  const schema: AssistantJsonSchema = {
    type: 'object',
    properties: {
      messageType: {
        type: 'string',
        enum: ['command', 'question', 'meta', 'chat'],
        description:
          '"command" = a specific create/update/delete request naming one entity/item. "question" = a factual question about the cafe\'s own current data (products, events, prices, settings, etc.), including one naming a specific already-known item. "meta" = the message is about YOUR OWN previous reply below (correcting it, doubting it, asking to clarify/expand on it) rather than asking for anything new — e.g. "isn\'t that a percentage, not the price?" right after you answered a price question. "chat" = a greeting, small talk, or a generic question with no real data need.',
      },
    },
    required: ['messageType'],
    additionalProperties: false,
  }

  const systemPrompt = [
    languageInstruction(uiLanguage),
    currentDateInstruction(),
    ...assistantIntroLines(entityListForPrompt, hasUserEntity),
    lastAssistantReply ? `Your own last reply in this conversation was: "${lastAssistantReply}" — use this to recognize a "meta" message referring back to it.` : '',
    historyContextPromptLine(historyContext),
  ]
    .filter(Boolean)
    .join('\n')

  const result = await callToolOnce<{ messageType: MessageType }>({
    systemPrompt,
    userText: message,
    toolName: 'classify_message',
    toolDescription: 'Classify what kind of message this is.',
    schema,
    model: modelOverride,
    provider: providerOverride,
    localModel: localModelOverride,
    trace,
  })
  return result.messageType
}

/** The `'command'` branch's own narrow call — today's single-pass schema minus `reply`/`lookupEntities`, since the classify step above has already ruled those out. */
async function selectCommand(
  entities: AssistantEntity<unknown>[],
  entityListForPrompt: string,
  historyContext: string | null,
  message: string,
  uiLanguage: 'no' | 'en',
  modelOverride: store.AssistantModel | undefined,
  providerOverride: store.AssistantProvider | undefined,
  localModelOverride: string | undefined,
  trace: AssistantTraceEntry[],
): Promise<Pick<RawIntentResult, 'entity' | 'action' | 'searchText'>> {
  const entityKeys = entities.map((entity) => entity.key)
  const schema: AssistantJsonSchema = {
    type: 'object',
    properties: {
      entity: { type: 'string', enum: entityKeys },
      action: nullable({ type: 'string', enum: ALL_ACTIONS }),
      searchText: nullable({ type: 'string', description: SEARCH_TEXT_DESCRIPTION }),
    },
    required: ['entity', 'action', 'searchText'],
    additionalProperties: false,
  }

  const systemPrompt = [
    languageInstruction(uiLanguage),
    currentDateInstruction(),
    ...assistantIntroLines(entityListForPrompt, entityKeys.includes('user')),
    "Pick exactly one entity and one action for this create/update/delete request — don't try to handle more than one thing at once. This includes setting up an entirely new kind of product line (e.g. \"I'm going to sell cars, what do I need to do?\") — help them create a catalogue/categories/products for it, never say this dashboard doesn't support what they sell.",
    ACTION_ENUM_LINE,
    historyContextPromptLine(historyContext),
  ]
    .filter(Boolean)
    .join('\n')

  return callToolOnce<Pick<RawIntentResult, 'entity' | 'action' | 'searchText'>>({
    systemPrompt,
    userText: message,
    toolName: 'select_command',
    toolDescription: 'Choose which entity and action this create/update/delete request is about.',
    schema,
    model: modelOverride,
    provider: providerOverride,
    localModel: localModelOverride,
    trace,
  })
}

/** The `'question'` branch's own narrow call — just `lookupEntities`/`searchText`, no `entity`/`action`/`reply` fields for a local model to conflate them with. */
async function selectLookupTarget(
  entityKeys: string[],
  historyContext: string | null,
  message: string,
  uiLanguage: 'no' | 'en',
  modelOverride: store.AssistantModel | undefined,
  providerOverride: store.AssistantProvider | undefined,
  localModelOverride: string | undefined,
  trace: AssistantTraceEntry[],
): Promise<{ lookupEntities: string[]; searchText: string | null }> {
  const schema: AssistantJsonSchema = {
    type: 'object',
    properties: {
      lookupEntities: { type: 'array', items: { type: 'string', enum: entityKeys }, description: LOOKUP_ENTITIES_DESCRIPTION },
      searchText: nullable({ type: 'string', description: SEARCH_TEXT_DESCRIPTION }),
    },
    required: ['lookupEntities', 'searchText'],
    additionalProperties: false,
  }

  const systemPrompt = [languageInstruction(uiLanguage), currentDateInstruction(), REFERENCE_RESOLUTION_LINE, historyContextPromptLine(historyContext)].filter(Boolean).join('\n')

  return callToolOnce<{ lookupEntities: string[]; searchText: string | null }>({
    systemPrompt,
    userText: message,
    toolName: 'select_lookup_target',
    toolDescription: "Choose which entities' data would answer this factual question.",
    schema,
    model: modelOverride,
    provider: providerOverride,
    localModel: localModelOverride,
    trace,
  })
}

/** The `'chat'` branch's own narrow call — a plain reply, nothing else. */
async function composeChatReply(
  entityListForPrompt: string,
  hasUserEntity: boolean,
  historyContext: string | null,
  message: string,
  uiLanguage: 'no' | 'en',
  modelOverride: store.AssistantModel | undefined,
  providerOverride: store.AssistantProvider | undefined,
  localModelOverride: string | undefined,
  trace: AssistantTraceEntry[],
): Promise<string> {
  const schema: AssistantJsonSchema = { type: 'object', properties: { reply: { type: 'string' } }, required: ['reply'], additionalProperties: false }
  const systemPrompt = [
    languageInstruction(uiLanguage),
    ...assistantIntroLines(entityListForPrompt, hasUserEntity),
    'Write a short, helpful, conversational reply to this greeting/small talk/generic question, in the admin\'s own language — mention what you can help with on this dashboard when relevant.',
    historyContextPromptLine(historyContext),
  ]
    .filter(Boolean)
    .join('\n')
  const result = await callToolOnce<{ reply: string }>({
    systemPrompt,
    userText: message,
    toolName: 'compose_chat_reply',
    toolDescription: 'Write a conversational reply.',
    schema,
    model: modelOverride,
    provider: providerOverride,
    localModel: localModelOverride,
    trace,
  })
  return result.reply
}

/** The `'meta'` branch's own narrow call — the reviewing AI's own suggested fix for the "isn't 80 the percentage, not the price?" misroute: instead of routing a challenge to your own last answer into a fresh data lookup, correct/clarify/expand on it directly from what you already said, with no new data fetch. */
async function composeMetaReply(
  lastAssistantReply: string | null,
  historyContext: string | null,
  message: string,
  uiLanguage: 'no' | 'en',
  modelOverride: store.AssistantModel | undefined,
  providerOverride: store.AssistantProvider | undefined,
  localModelOverride: string | undefined,
  trace: AssistantTraceEntry[],
): Promise<string> {
  const schema: AssistantJsonSchema = { type: 'object', properties: { reply: { type: 'string' } }, required: ['reply'], additionalProperties: false }
  const systemPrompt = [
    languageInstruction(uiLanguage),
    "The admin's message below is about YOUR OWN previous reply in this conversation, not a request for fresh data — a correction, a doubt, or a request to clarify/expand on it.",
    lastAssistantReply ? `Your own last reply was: "${lastAssistantReply}"` : '',
    'Respond directly to what the admin is saying about that reply — acknowledge/correct yourself if they\'re right, clarify if they\'re confused, or explain further if asked. Only say you\'d need to look something up fresh if answering genuinely requires data neither your last reply nor the conversation below already contains — never silently re-run a fresh lookup instead of addressing what was actually said.',
    historyContextPromptLine(historyContext),
  ]
    .filter(Boolean)
    .join('\n')
  const result = await callToolOnce<{ reply: string }>({
    systemPrompt,
    userText: message,
    toolName: 'compose_meta_reply',
    toolDescription: 'Respond to a message about your own previous reply.',
    schema,
    model: modelOverride,
    provider: providerOverride,
    localModel: localModelOverride,
    trace,
  })
  return result.reply
}

/**
 * The local-provider-only cascade (see `selectIntent`'s own branch on
 * `provider`) — splits the single Claude call above into a tiny classify call
 * plus one small, single-purpose branch call. Real testing found a local
 * model can correctly recognize a factual question (`lookupEntities`) while
 * *also* misfiring `entity`/`action` into a bogus create/update/delete choice
 * on that same combined call — a compounding-error pattern from asking one
 * small model to juggle 4+ signals at once. Splitting into "which of 4
 * buckets is this" followed by "given that bucket, extract only what it
 * needs" removes the chance of that contradiction by construction, at the
 * cost of one extra small round-trip per turn. Also folds in the "meta"
 * bucket (a message about the assistant's own previous reply, e.g. "isn't 80
 * the percentage, not the price?") — a gap no branch of the single-pass
 * schema above ever covered, for either provider, until now.
 */
async function selectIntentCascaded(
  entities: AssistantEntity<unknown>[],
  message: string,
  uiLanguage: 'no' | 'en',
  modelOverride: store.AssistantModel | undefined,
  providerOverride: store.AssistantProvider | undefined,
  localModelOverride: string | undefined,
  historyRaw: string | undefined,
  historyContext: string | null,
  trace: AssistantTraceEntry[],
  conversationId: string | undefined,
): Promise<RawIntentResult> {
  const entityKeys = entities.map((entity) => entity.key)

  // Checked before any model call at all — see `detectBulkListQuestion`'s own doc comment for why
  // this exact combination is safe to skip `classifyMessageType` for entirely, unlike the plain
  // entity-keyword prefilter below (which only ever replaces `selectLookupTarget`).
  const bulkListEntities = detectBulkListQuestion(message, entityKeys, uiLanguage)
  if (bulkListEntities.length > 0) {
    return { entity: 'chat', action: null, searchText: null, reply: null, lookupEntities: bulkListEntities }
  }

  // Same "unambiguous signal, skip the LLM entirely" precedent as the bulk-list check above — a
  // referring pronoun ("den"/"de"/"dem"/"disse") resolved against this conversation's own
  // `DialogFocus` (see `pronounPrefilter.ts`) means there's nothing left for `classifyMessageType`/
  // `selectLookupTarget` to guess at. Returns `null` (falls through unchanged) for a message with no
  // referring pronoun, or one whose matching focus slot is empty — never a guessed referent.
  const pronounResult = resolvePronounFocus(message, uiLanguage, getDialogFocus(conversationId))
  if (pronounResult) return pronounResult

  const entityListForPrompt = entities.map((entity) => `${entity.key} (${ENTITY_DESCRIPTIONS[entity.key] ?? ''})`).join(', ')
  const hasUserEntity = entityKeys.includes('user')
  const lastAssistantReply = extractLastAssistantLine(historyRaw)

  const messageType = await classifyMessageType(entityListForPrompt, hasUserEntity, historyContext, lastAssistantReply, message, uiLanguage, modelOverride, providerOverride, localModelOverride, trace)

  if (messageType === 'meta') {
    const reply = await composeMetaReply(lastAssistantReply, historyContext, message, uiLanguage, modelOverride, providerOverride, localModelOverride, trace)
    return { entity: 'chat', action: null, searchText: null, reply, lookupEntities: null }
  }

  if (messageType === 'chat') {
    const reply = await composeChatReply(entityListForPrompt, hasUserEntity, historyContext, message, uiLanguage, modelOverride, providerOverride, localModelOverride, trace)
    return { entity: 'chat', action: null, searchText: null, reply, lookupEntities: null }
  }

  if (messageType === 'question') {
    // Try a deterministic keyword match before ever calling the model — see `detectEntitiesFromKeywords`'s
    // own doc comment for the exact failure this removes. `searchText` stays `null` here: a generic
    // "how many X" question naming only the entity noun (not one specific item) has nothing to search
    // for, and a single-item question ("how much does Kylling Fajitas cost") won't contain a bare
    // entity noun in the first place, so it's untouched and still falls through to the LLM below.
    const keywordEntities = detectEntitiesFromKeywords(message, entityKeys, uiLanguage)
    if (keywordEntities.length > 0) {
      return { entity: 'chat', action: null, searchText: null, reply: null, lookupEntities: keywordEntities }
    }

    const { lookupEntities, searchText } = await selectLookupTarget(entityKeys, historyContext, message, uiLanguage, modelOverride, providerOverride, localModelOverride, trace)
    if (lookupEntities.length === 0) {
      // Shouldn't happen given `classifyMessageType` already committed to "question", but never
      // leave the admin with silence if it does.
      return { entity: 'chat', action: null, searchText: null, reply: uiLanguage === 'no' ? 'Jeg er ikke sikker på hva du mener.' : "I'm not sure what you mean.", lookupEntities: null }
    }
    return { entity: 'chat', action: null, searchText, reply: null, lookupEntities }
  }

  // 'command'
  const commandResult = await selectCommand(entities, entityListForPrompt, historyContext, message, uiLanguage, modelOverride, providerOverride, localModelOverride, trace)
  return { ...commandResult, reply: null, lookupEntities: null }
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
  providerOverride?: store.AssistantProvider,
  localModelOverride?: string,
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
    provider: providerOverride,
    localModel: localModelOverride,
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

/** Every field the model proposed came back empty — nothing to extract from the message at all. Used both to skip `fillFields`'s own verify pass (see `generateThenVerify`'s `skipVerifyIf`) and, on a `create`, to abort before staging a draft with nothing real behind it. */
function isEmptyFieldsObject(fields: Record<string, unknown>): boolean {
  return Object.values(fields).every((value) => value === null || value === undefined)
}

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
    providerOverride?: store.AssistantProvider
    localModelOverride?: string
    /** See `ToolCallInput.localVisionModel` — only consulted when `image` above is set. */
    localVisionModelOverride?: string
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
  const historyContext = await resolveHistoryContext(
    { history: options.history, historyContext: options.historyContext },
    uiLanguage,
    options.modelOverride,
    options.providerOverride,
    options.localModelOverride,
    trace,
  )

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
    provider: options.providerOverride,
    localModel: options.localModelOverride,
    localVisionModel: options.localVisionModelOverride,
    trace,
    skipVerifyIf: isEmptyFieldsObject,
  })

  // The admin's own answers to a prior clarifying round are authoritative — they override whatever the model itself proposed (or failed to) for that same field.
  const fields = { ...rawFields, ...options.resolvedFields }

  // A `create` with nothing extractable at all (checked *after* merging any clarifying-round
  // answers above, so a create that already resolved e.g. its category isn't wrongly aborted here)
  // means the command classification itself was almost certainly wrong — proceeding would stage a
  // draft with nothing real behind it, which is exactly what let a local model's own `fillFields`
  // verify pass fabricate an entire fake product from an empty draft in real testing. `update`/
  // `resetPassword` are exempt: an empty draft there just means "no changes mentioned," which is a
  // harmless no-op once merged onto the existing record, not a fabrication risk.
  if (action === 'create' && isEmptyFieldsObject(fields)) {
    throw new Error(`Couldn't find anything to create from your message — try describing what you'd like to add.`)
  }

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
export async function generateTitle(
  transcriptText: string,
  uiLanguage: 'no' | 'en',
  modelOverride?: store.AssistantModel,
  providerOverride?: store.AssistantProvider,
  localModelOverride?: string,
): Promise<{ title: string }> {
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
    provider: providerOverride,
    localModel: localModelOverride,
  })
}

/** The admin's own override of how much data `answerLookup` processes per call at once (see `AssistantPanel`'s kebab-menu chunk-size setting) — `'auto'` just means "use the active model/provider's own profile below, unmodified." */
export type ChunkSizePreference = 'auto' | 'small' | 'medium' | 'large' | 'custom'

interface AssistantModelCapability {
  /** The primary, admin-facing unit (see `ChunkSizePreference`'s own "Custom" option, which sets this same value directly) — how many of an entity's live records go into one map-step batch before `answerLookup` needs to chunk at all. */
  recordsPerBatch: number
  /** A secondary ceiling applied alongside `recordsPerBatch`, not after it — `packRecordsIntoBatches` closes a batch as soon as either bound would be exceeded, so a batch of unusually content-heavy records (bilingual name/description, custom fields, etc.) gets split into more, smaller batches rather than ever having its serialized JSON truncated mid-record. */
  chunkCharBudget: number
  /** Whether the extra `generateThenVerify` pass is worth the added latency for this tier — always used for cloud Claude and, despite the extra latency, for `local` too: real testing showed a small Ollama model over-includes an entire batch on a filtering question (e.g. confidently marking most of a batch "on sale" when none of it actually had a discount field set) at a high enough rate that skipping the verify pass there isn't actually a good tradeoff — see `LOOKUP_BATCH_SCHEMA`'s own doc comment, which named this exact failure mode. */
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
  local: { recordsPerBatch: 10, chunkCharBudget: 2400, useVerifyPass: true, maxParallelChunkCalls: 1, historyMode: 'compact' },
}

/** Bounds enforced on an admin's own "Custom" record-per-batch entry — re-clamped here regardless of whatever the client-side `NumberInput` already enforces, since a client-supplied number is never trusted as-is. Guards against both an oversized single batch (could blow past `client.ts`'s shared `max_tokens: 1024`) and a `0`/negative value (would break the batch-splitting loop below). */
const CUSTOM_RECORDS_PER_BATCH_MIN = 1
const CUSTOM_RECORDS_PER_BATCH_MAX = 1000

/** Hard cap on how many entities one lookup ever pulls data for, regardless of how many the model names — keeps a single lookup message's total cost bounded even in the worst case. */
const MAX_LOOKUP_ENTITIES = 5

function resolveModelCapability(modelOverride: store.AssistantModel | undefined, providerOverride?: store.AssistantProvider): AssistantModelCapability {
  const provider = providerOverride ?? store.getAssistantProvider()
  if (provider !== 'claude') return ASSISTANT_MODEL_CAPABILITIES.local
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
        "Every matching record's short, human-readable name/title from this batch (e.g. a product's real display name like \"Chicken Fajitas\") — never an internal id/key/slug field (e.g. never something like \"wraps-chickenFajitasWrap\"), even if that's the field name that stood out while scanning the record. If the record has its own category/location field (e.g. a product's resolved location), append it in parentheses (e.g. \"Chicken Fajitas (Wraps)\") — two real records can share the exact same name across different categories (e.g. a \"Chicken Fajitas\" wrap and a \"Chicken Fajitas\" nachos), and the bare name alone can't tell them apart later in the conversation. The complete list of matches, not a capped sample, since the admin may be asking to see everything, not just a count. Empty if matchingCount is 0.",
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
 * the model actually reads it. When the map-reduce narrows to exactly one
 * match, that one record's real field data is additionally resolved (via the
 * same deterministic `listCandidates`/`getCurrent` lookup `selectItem` uses,
 * no extra model call) and appended as its own block — without this, a
 * question needing a specific field value (e.g. a price) had nothing to work
 * with beyond a name and a count, and real testing showed that led to an
 * invented answer rather than an honest "I don't have that detail."
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
  providerOverride: store.AssistantProvider | undefined,
  localModelOverride: string | undefined,
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
      provider: providerOverride,
      localModel: localModelOverride,
      trace,
    }
    const result = useVerifyPass ? await generateThenVerify<LookupBatchFacts>(batchCallArgs) : await callToolOnce<LookupBatchFacts>(batchCallArgs)
    totalMatchingCount += result.matchingCount
    allMatches.push(...result.matchingExamples)
  }

  // Deliberately *not* phrased as a ready-made sentence (e.g. never "N record(s) satisfy it") —
  // real testing against a local model showed it will literally copy a quotable phrase like that
  // verbatim as its entire final reply instead of composing its own natural-language answer that
  // actually names the matches (see the plan behind this feature). Presented as plain labeled
  // facts instead, which there's nothing grammatical to copy-paste from.
  const batchedResultSummary = `"${entity.key}" data (${records.length} total records) — already fully checked, batch by batch, against the admin's exact question ("${message}"); this is the complete, final result, not a sample.\nmatchingCount: ${totalMatchingCount}\nmatchingNames: ${JSON.stringify(allMatches)}`

  // When the batch scan narrows to exactly one match, resolve that one name to its real record via
  // the same deterministic (no model call) candidate lookup `selectItem`/the single-item fast path
  // above already rely on — never by asking the classifier model itself to also echo back a raw
  // id, which is exactly the kind of string it's already shown to mangle (see `LOOKUP_BATCH_SCHEMA`'s
  // own `matchingExamples` doc comment). Without this, the final compose call below only ever has a
  // name and a count to work with — enough for a "which"/"how many" question, but nothing for a
  // "how much does it cost?"-shaped one, which is exactly what led it to invent a price out of thin
  // air in real testing rather than admit the data here doesn't include it.
  let singleMatchRecordBlock = ''
  if (totalMatchingCount === 1 && allMatches.length === 1 && entity.listCandidates && entity.getCurrent) {
    const candidates = await entity.listCandidates('update', context, allMatches[0])
    if (candidates.length === 1) {
      const record = await entity.getCurrent(candidates[0].id, context)
      if (record) singleMatchRecordBlock = `Full record for the one match found above (${candidates[0].label}):\n${JSON.stringify(record)}`
    }
  }

  return [datasetSummary, batchedResultSummary, singleMatchRecordBlock].filter(Boolean).join('\n\n')
}

/**
 * The deterministic sibling of `buildEntityDataBlock` above — used instead of
 * it whenever `entity` implements `lookupQueryFields`/`listQueryableRecords`
 * (see `lookupQuery.ts`'s own module doc comment for why: it turns "does this
 * record match the filter" from a model judgment call — the `lookup_batch`
 * classifier's job, shown by real testing to be unreliable even at 7B — into
 * a small enum pick the model makes once, executed deterministically in code).
 * No batch loop, no chunking, no model ever asked to eyeball raw JSON.
 * Returns the exact same data-block string shape `buildEntityDataBlock`
 * returns, so `answerLookup`'s own final compose call/prompt/schema is
 * completely unaware of which builder produced it.
 */
interface EntityDataBlockResult {
  dataBlock: string
  /**
   * Set only by the query engine below, either for a plain count question
   * (see `isCountQuestion`/`AssistantEntity.countLabel`) or a plain
   * "which/list" question with no specific field requested — when present,
   * `answerLookup` returns this directly instead of running its own final
   * compose call at all. For a "list" question with 2+ matches, this is just
   * the intro sentence; the matches themselves are in `templatedList`.
   */
  templatedReply?: string
  /** Set alongside `templatedReply` only for a "list" question with 2+ matches — see `templatedReply`'s own doc comment. */
  templatedList?: AssistantReplyList
  /** Set for a `'count'`/`'list'` shape (never `'report'`) — see `DialogFocusUpdate`'s own doc comment for how `answerLookup` applies this to the conversation's `DialogFocus`. */
  focusUpdate?: DialogFocusUpdate
}

/** `record.label` alongside its `sublabel` (if any), reconstructed as the single combined string every compose-LLM-facing prompt (`matchingNames`, a report's per-match line) has always used — kept byte-identical to before `sublabel` existed as its own field, so splitting `label`/`sublabel` for the new deterministic list reply (see `AssistantReplyList`) never changes what any LLM-facing prompt sees. */
function recordDisplayName(record: LookupQueryRecord): string {
  return record.sublabel ? `${record.label} (${record.sublabel})` : record.label
}

/** Turns `spec.filters` into a short natural-language suffix for the deterministic list-shape reply below (e.g. " på tilbud") — purely display text, built from each field's own opt-in `filterPhrase` (see `LookupQueryField`), never sent to or asked of the model. A filter whose field has no `filterPhrase` (or whose value has no natural phrase) is silently omitted rather than guessed at; an empty result just means the reply names no filter at all. */
function buildFilterSuffix(filters: LookupQueryFilterInput[], fields: LookupQueryField[], uiLanguage: 'no' | 'en'): string {
  const phrases = filters
    .map((filter) => fields.find((field) => field.key === filter.field)?.filterPhrase?.(filter.value, uiLanguage) ?? null)
    .filter((phrase): phrase is string => Boolean(phrase))
  if (phrases.length === 0) return ''
  return ` ${phrases.join(uiLanguage === 'no' ? ' og ' : ' and ')}`
}

async function buildEntityQueryDataBlock(
  entity: AssistantEntity<unknown>,
  context: AssistantFillContext,
  message: string,
  uiLanguage: 'no' | 'en',
  useVerifyPass: boolean,
  modelOverride: store.AssistantModel | undefined,
  providerOverride: store.AssistantProvider | undefined,
  localModelOverride: string | undefined,
  /** A prior turn's own `DialogFocus.lastSet.filter`, resolved by the pronoun prefilter (see `resolvePronounFocus`) — AND'd onto whatever filter this call's own `lookup_query` resolves, so a follow-up like "hvor mange av dem koster over 100 kr" composes with the set the admin was already looking at instead of starting over. `undefined`/empty for an ordinary, non-follow-up question. */
  baseFilters: LookupQueryFilterInput[] | undefined,
  trace: AssistantTraceEntry[],
): Promise<EntityDataBlockResult> {
  const fields = await entity.lookupQueryFields!(context)
  const schema = buildLookupQuerySchema(fields)
  const datasetSummary = (await entity.datasetSummary?.(context)) ?? ''

  // No `historyContextPromptLine` here (unlike most other steps) — by the time this runs, which
  // entity to query is already a settled fact (resolved upstream, before this is even called); real
  // testing showed a local model reaching into an earlier, unrelated exchange's own topic here
  // instead of just building a query for the question actually asked (see the plan behind this fix).
  const systemPrompt = [
    languageInstruction(uiLanguage),
    currentDateInstruction(),
    `You're building a structured query to answer a factual question about "${entity.key}" records from the Wraps & Coffee admin dashboard — pick filters only from the fields you're given below, never invent a field, and never add a condition the admin's question doesn't actually ask for.`,
    entity.lookupGuidance ?? '',
    `Admin's question: ${message}`,
  ]
    .filter(Boolean)
    .join('\n\n')

  const callArgs = {
    systemPrompt,
    userText: message,
    toolName: 'lookup_query',
    toolDescription: "Build a structured filter/report query to answer the admin's question.",
    schema,
    model: modelOverride,
    provider: providerOverride,
    localModel: localModelOverride,
    trace,
  }
  const spec = useVerifyPass ? await generateThenVerify<LookupQuerySpec>(callArgs) : await callToolOnce<LookupQuerySpec>(callArgs)
  // Composed in code, never asked of the model — see `baseFilters`' own doc comment above.
  const filters = [...(baseFilters ?? []), ...spec.filters]

  // Debug-only tag (see `AssistantTraceEntry.shape`) — derived from the same signals the branches
  // below use, never asked of the model. A count question with no `countLabel` on this entity still
  // falls through to the plain "list" behavior below, same as it always has.
  const shape: 'count' | 'list' | 'report' = spec.reportField !== null ? 'report' : isCountQuestion(message, uiLanguage) && entity.countLabel ? 'count' : 'list'
  trace.filter((entry) => entry.toolName === 'lookup_query').forEach((entry) => {
    entry.shape = shape
  })

  const records = await entity.listQueryableRecords!(context)
  const matches = executeLookupQuery(records, { filters, reportField: spec.reportField }, fields)
  // A filtered/counted result that happens to narrow to exactly one record behaves like a named
  // single item for a follow-up singular pronoun ("er den...") — see `DialogFocusUpdate`'s own doc
  // comment. Computed once, shared by both the count and list branches below.
  const singleMatchFocusUpdate: DialogFocusUpdate | undefined =
    matches.length === 1 ? { kind: 'item', entity: entity.key, id: matches[0].id, label: recordDisplayName(matches[0]) } : undefined

  // A plain count question ("hvor mange produkter har vi?") with no specific field requested can be
  // answered exactly in code — `matches.length` already reflects any filters that were applied —
  // rather than handing a fluent-but-hallucination-prone compose call a data block it might
  // misread (see the plan behind this fix, and `AssistantEntity.countLabel`'s own doc comment).
  // Every non-single-match count/list reply focuses the conversation on the whole matched set — see
  // `DialogFocusUpdate`'s own doc comment. Computed once, shared by both branches below.
  const setFocusUpdate: DialogFocusUpdate = { kind: 'set', entity: entity.key, filter: filters, ids: matches.map((record) => record.id), label: entity.countLabel?.[uiLanguage]?.plural ?? entity.key }

  if (shape === 'count') {
    const label = entity.countLabel![uiLanguage]
    const noun = matches.length === 1 ? label.singular : label.plural
    const templatedReply = uiLanguage === 'no' ? `Vi har ${matches.length} ${noun}.` : `We have ${matches.length} ${noun}.`
    return { dataBlock: '', templatedReply, focusUpdate: singleMatchFocusUpdate ?? setFocusUpdate }
  }

  // A plain "which/list" question ("hvilke produkter er på tilbud?", "gi meg en liste over alle
  // produkter") with no specific field requested — same reasoning as the count case above: the
  // matches are already the exact, correct answer, so there's nothing left for a compose call to
  // contribute except cost and a fresh place to hallucinate (real testing showed exactly that: a
  // regenerated list with a duplicated tail entry). Phrased and, for 2+ matches, listed entirely in
  // code instead.
  if (shape === 'list') {
    const filterSuffix = buildFilterSuffix(filters, fields, uiLanguage)
    const noun = entity.countLabel?.[uiLanguage]
    const nounPlural = noun?.plural ?? entity.key

    if (matches.length === 0) {
      const templatedReply = uiLanguage === 'no' ? `Ingen ${nounPlural}${filterSuffix}.` : `No ${nounPlural}${filterSuffix}.`
      return { dataBlock: '', templatedReply, focusUpdate: setFocusUpdate }
    }
    if (matches.length === 1) {
      const item = matches[0]
      const sublabelPart = item.sublabel ? ` (${item.sublabel})` : ''
      const templatedReply =
        uiLanguage === 'no' ? `Det er bare ${item.label}${sublabelPart}${filterSuffix}.` : `There's only ${item.label}${sublabelPart}${filterSuffix}.`
      return { dataBlock: '', templatedReply, focusUpdate: singleMatchFocusUpdate }
    }
    const templatedReply = uiLanguage === 'no' ? `Her er ${matches.length} ${nounPlural}${filterSuffix}:` : `Here are ${matches.length} ${nounPlural}${filterSuffix}:`
    const items: AssistantListItem[] = matches.map((record) => ({ label: record.label, sublabel: record.sublabel }))
    return { dataBlock: '', templatedReply, templatedList: { style: 'bullet', items }, focusUpdate: setFocusUpdate }
  }

  // From here on, `shape === 'report'` — the question asked for one specific field's real value
  // across the matches, which still needs the final `answer_lookup` compose call to phrase (see
  // `answerLookup`) since there's genuine prose synthesis left to do, not just a plain listing.
  const reportField = fields.find((field) => field.key === spec.reportField)!
  const reported = matches.slice(0, 50).map((record) => `${recordDisplayName(record)}: ${JSON.stringify(record.fields[reportField.key])}`)
  const reportBlock = `Real "${reportField.label}" value for each match below — read it directly from here, never compute/guess it:\n${reported.join('\n')}`

  // Same "plain labeled facts, nothing quotable" shape as `buildEntityDataBlock`'s own
  // `batchedResultSummary` — real testing showed a model will otherwise copy a ready-made sentence
  // verbatim instead of composing its own answer.
  const matchingNames = matches.map((record) => recordDisplayName(record))
  const resultSummary = `"${entity.key}" data (${records.length} total records) — already fully, exactly filtered against the admin's question ("${message}"); this is the complete, final result, not a sample.\nmatchingCount: ${matches.length}\nmatchingNames: ${JSON.stringify(matchingNames)}`

  return { dataBlock: [datasetSummary, resultSummary, reportBlock].filter(Boolean).join('\n\n') }
}

/**
 * Composes the final natural-language answer from one already-resolved
 * record — shared by `answerLookup`'s own single-item fast path and
 * `answerLookupForItem` (the continuation call once the admin has picked one
 * candidate off a `'clarifyItem'` result). Never asks the model to pick or
 * search anything itself; by the time this runs, which record to use is
 * already a settled, deterministic fact.
 */
async function answerFromRecord(
  entity: AssistantEntity<unknown>,
  record: unknown,
  matchedLabel: string | undefined,
  message: string,
  uiLanguage: 'no' | 'en',
  historyContext: string | undefined,
  modelOverride: store.AssistantModel | undefined,
  providerOverride: store.AssistantProvider | undefined,
  localModelOverride: string | undefined,
  capability: AssistantModelCapability,
  trace: AssistantTraceEntry[],
): Promise<{ reply: string; trace: AssistantTraceEntry[] }> {
  const systemPrompt = [
    languageInstruction(uiLanguage),
    currentDateInstruction(),
    `You are answering a factual question about one specific "${entity.key}" record from the Wraps & Coffee admin dashboard's own current data (the admin already named/picked it) — using only the record below, never outside/general knowledge, and never inventing a fact it doesn't support.`,
    entity.lookupGuidance ?? '',
    'Write your own complete sentence in the admin\'s own language — never literally copy a label or field name straight out of the record below.',
    'If the question is about a price/cost, give the actual concrete amount (e.g. "80 kr") — never just a relative/percentage description like "80% of the normal price" on its own. If the record has its own already-computed effective/final price field, always read the answer directly from that field — never calculate a discounted price yourself from a base price and a discount percentage/amount, even if both are right there in the record: real testing showed that arithmetic gets it wrong. Only mention a discount percentage/amount as additional context alongside the real price, never as a substitute for it, and never as something to compute from.',
    historyContextPromptLine(historyContext ?? null),
    `"${entity.key}" record${matchedLabel ? ` (${matchedLabel})` : ''}:\n${JSON.stringify(record)}`,
  ]
    .filter(Boolean)
    .join('\n\n')
  const schema: AssistantJsonSchema = {
    type: 'object',
    properties: { reply: { type: 'string', description: "A short, direct answer to the admin's question, in their own language, based only on the record above." } },
    required: ['reply'],
    additionalProperties: false,
  }
  const callArgs = {
    systemPrompt,
    userText: message,
    toolName: 'answer_lookup_item',
    toolDescription: 'Answer the question using the provided record.',
    schema,
    model: modelOverride,
    provider: providerOverride,
    localModel: localModelOverride,
    trace,
  }
  const result = capability.useVerifyPass ? await generateThenVerify<{ reply: string }>(callArgs) : await callToolOnce<{ reply: string }>(callArgs)
  return { ...result, trace }
}

/**
 * `'ready'` — a complete answer. `'clarifyItem'` — the question was about one
 * specific item, but more than one real candidate matched and nothing
 * (search text, conversation history) confidently narrowed it down further —
 * asking which one is the honest alternative to silently guessing (which is
 * exactly what a small local model was observed doing: confidently picking
 * one of two identically-named products with no real signal favoring either).
 * The caller shows `candidates` as a plain pick-one list and re-answers via
 * `answerLookupForItem` once the admin picks.
 */
export type AnswerLookupResult =
  | { status: 'ready'; reply: string; list?: AssistantReplyList; trace: AssistantTraceEntry[] }
  | { status: 'clarifyItem'; entityKey: string; candidates: AssistantCandidate[]; trace: AssistantTraceEntry[] }

/**
 * Resolves one single-entity, query-engine-capable lookup question — either the whole message
 * (the ordinary case), or one half of a compound question (see `answerLookup`'s own
 * `splitCompoundQuestion` branch). Factored out purely so both cases share the exact same
 * "try the deterministic query engine, fall back to the `answer_lookup` compose call" logic
 * without duplicating the compose prompt/schema — a compound question's halves must each be
 * capable of the *same* fallback a single ordinary question already has.
 */
async function resolveSingleEntityLookup(
  entity: AssistantEntity<unknown>,
  context: AssistantFillContext,
  message: string,
  uiLanguage: 'no' | 'en',
  capability: AssistantModelCapability,
  modelOverride: store.AssistantModel | undefined,
  providerOverride: store.AssistantProvider | undefined,
  localModelOverride: string | undefined,
  baseFilters: LookupQueryFilterInput[] | undefined,
  trace: AssistantTraceEntry[],
): Promise<LookupHalfResult> {
  const dataBlockResult = await buildEntityQueryDataBlock(entity, context, message, uiLanguage, capability.useVerifyPass, modelOverride, providerOverride, localModelOverride, baseFilters, trace)

  if (dataBlockResult.templatedReply) {
    return { reply: dataBlockResult.templatedReply, list: dataBlockResult.templatedList, focusUpdate: dataBlockResult.focusUpdate }
  }

  // Same compose prompt/schema `answerLookup` itself used before this was extracted — scoped to
  // this one entity's own data block/guidance, since a compound half is always single-entity by
  // construction (see `answerLookup`'s own `entities.length === 1` gate).
  const systemPrompt = [
    languageInstruction(uiLanguage),
    currentDateInstruction(),
    "You are answering a factual question about the Wraps & Coffee admin dashboard's own current data, using only the data provided below — never use outside/general knowledge, and never invent a fact the data doesn't support.",
    'An empty list, a zero count, or "no matches" in the data below is itself a complete, valid answer (e.g. "there are currently none") — do not treat it as missing information to hedge about.',
    'A data block below with a "matchingCount"/"matchingNames" pair has already been fully, completely checked against that exact question, record by record — that count and name list are the final answer, not a sample or a subset needing further detail. Report the count as a definite fact (e.g. "there are 7") — never hedge with "I only have example data" or "I\'d need more detail (like dates) to know for sure" when that checking has already been done for you.',
    'Write your own complete sentence in the admin\'s own language — never literally copy a label or phrase straight out of the data block below (e.g. never answer with something like "7 record(s) satisfy it"). If the question asks "which"/"what" ones (not just a count), your sentence must actually name every one of them from "matchingNames" — a bare count alone does not answer a "which" question.',
    "If the data below genuinely doesn't contain what's needed to answer, say so honestly rather than guessing.",
    'A "matchingCount"/"matchingNames" data block only tells you whether each record matched the question and its name — never any other field (price, discount, stock, allergens, etc.) by itself. When exactly one match was found, a separate "Full record for the one match found above" block may also be present below with that record\'s real field data — check for it and use it if the question needs a specific field value. If the question asks for a specific field value (e.g. "how much does it cost?", "what\'s the discount amount?") and that value genuinely isn\'t present anywhere in the data below (no such full-record block, or it\'s missing the needed field), say you don\'t have that specific detail rather than inventing a plausible-sounding number — a fabricated price is far worse than admitting the data below doesn\'t include it.',
    entity.lookupGuidance ?? '',
    dataBlockResult.dataBlock,
  ]
    .filter(Boolean)
    .join('\n\n')

  const schema: AssistantJsonSchema = {
    type: 'object',
    properties: {
      reply: {
        type: 'string',
        description:
          "A short, direct answer to the admin's question, in their own language, based only on the data above — your own complete sentence, never a phrase copied verbatim from the data block. If the question asks which/what items match, name them (from \"matchingNames\"), not just a bare count.",
      },
    },
    required: ['reply'],
    additionalProperties: false,
  }

  const callArgs = {
    systemPrompt,
    userText: message,
    toolName: 'answer_lookup',
    toolDescription: 'Answer the question using the provided data.',
    schema,
    model: modelOverride,
    provider: providerOverride,
    localModel: localModelOverride,
    trace,
  }
  const result = capability.useVerifyPass ? await generateThenVerify<{ reply: string }>(callArgs) : await callToolOnce<{ reply: string }>(callArgs)
  return { reply: result.reply }
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
  providerOverride?: store.AssistantProvider,
  /** Set by `selectIntent` (the same `searchText` field the update/delete flow uses to find a target item) when the question is actually about one specific, already-named item (e.g. "how much does the Chicken Fajitas wrap cost?") rather than a filter/count across many records — see the single-item fast path below. `undefined` for an ordinary filter/count/list question. */
  itemSearchText?: string,
  localModelOverride?: string,
  /** See `buildEntityQueryDataBlock`'s own `baseFilters` doc comment — set by `selectIntent`'s pronoun prefilter, threaded straight through. */
  baseFilters?: LookupQueryFilterInput[] | null,
  /** This chat's own id (see `useAssistantFlow.ts`) — used only to write this turn's resolved `DialogFocus` once a final reply is known (see the single-item fast path and the query-engine branch below). Never touched by the legacy multi-entity path. */
  conversationId?: string,
): Promise<AnswerLookupResult> {
  // Never trust the model's/client's own entity list — re-filter through the same session-scoped gate every other step uses, then drop anything with no `listAll` implemented (a sub-resource, or an entity that simply doesn't support lookup), then bound the total count regardless.
  const allowed = allowedEntitiesFor(session)
  const entities = entityKeys
    .map((key) => allowed.find((entity) => entity.key === key))
    .filter((entity): entity is AssistantEntity<unknown> => Boolean(entity?.listAll))
    .slice(0, MAX_LOOKUP_ENTITIES)

  if (entities.length === 0) {
    return {
      status: 'ready',
      reply: uiLanguage === 'no' ? 'Jeg har ikke informasjon til å svare på det.' : "I don't have information to answer that.",
      trace: [],
    }
  }

  const context: AssistantFillContext = { uiLanguage, session }
  const capability = resolveModelCapability(modelOverride, providerOverride)

  // Single-item fast path — a question about one specific, already-named item (see
  // `itemSearchText`'s own doc comment) is answered directly from that one record instead of
  // scanning/batching the entire dataset: both faster and far more reliable than the batch
  // classifier below for this question shape. Resolving *which* record uses the exact same
  // machinery `selectItem` already relies on for the CRUD flow — including its own real narrowing
  // call for the ambiguous case, not just a "must already be exactly 1 substring match" check:
  // an initial version of this fast path required `listCandidates` to return exactly one match up
  // front, but a search text can easily substring-match more than one real record (e.g. "Chicken
  // Fajitas" also matching "Chicken Fajitas Nachos") — silently falling through to the full batch
  // scan in that case defeated the entire point for exactly the questions this was built for.
  // Reusing `selectItem` here means: 0 candidates → falls through below unchanged; exactly 1 → its
  // own zero-model-call fast path; 2+ → one real (and already-proven) narrowing call. If that
  // narrowing call *still* can't confidently resolve one record — real testing showed a small local
  // model will otherwise just confidently pick one of two identically-named products with no real
  // signal favoring either — this returns `'clarifyItem'` instead of silently guessing or falling
  // through to a batch scan that's just as unequipped to disambiguate. Only truly falls through to
  // the batch path below when there's genuinely nothing to work with (0 candidates).
  let fastPathTrace: AssistantTraceEntry[] = []
  if (itemSearchText && entities.length === 1) {
    const [singleEntity] = entities
    if (singleEntity.listCandidates && singleEntity.getCurrent) {
      const selection = await selectItem(singleEntity.key, 'update', session, message, itemSearchText, uiLanguage, undefined, modelOverride, historyContext, providerOverride, localModelOverride)
      fastPathTrace = selection.trace
      if (selection.itemID) {
        const record = await singleEntity.getCurrent(selection.itemID, context)
        const matchedLabel = selection.candidates.find((candidate) => candidate.id === selection.itemID)?.label
        if (record) {
          const trace: AssistantTraceEntry[] = [...selection.trace]
          const result = await answerFromRecord(singleEntity, record, matchedLabel, message, uiLanguage, historyContext, modelOverride, providerOverride, localModelOverride, capability, trace)
          setDialogFocus(conversationId, focusFromUpdate({ kind: 'item', entity: singleEntity.key, id: selection.itemID, label: matchedLabel ?? itemSearchText }))
          return { status: 'ready', ...result }
        }
        console.log(`[assistant] answerLookup: single-item fast path resolved itemID "${selection.itemID}" but getCurrent found no record — falling back to the full batch scan`)
      } else if (selection.candidates.length > 1) {
        // Genuine ambiguity (2+ real candidates, no confident pick even after a real narrowing
        // call) — ask, rather than guess or fall through to a batch scan that has no better way to
        // pick between them either.
        return { status: 'clarifyItem', entityKey: singleEntity.key, candidates: selection.candidates, trace: fastPathTrace }
      } else {
        // See the doc comment on `fastPathTrace` above: this is the one place that explains *why* a fallthrough happened, instead of it looking identical to "never attempted."
        console.log(
          `[assistant] answerLookup: single-item fast path for "${singleEntity.key}" fell through (itemSearchText=${JSON.stringify(itemSearchText)}, ${selection.candidates.length} candidate(s), no confident itemID) — falling back to the full batch scan`,
        )
      }
    }
  }

  const trace: AssistantTraceEntry[] = [...fastPathTrace]

  // The deterministic query engine (see `buildEntityQueryDataBlock`) is strictly better than the
  // batch classifier whenever it's available — faster (no batch loop) and immune to the
  // over-inclusion failure mode real testing found even at 7B — so it's preferred outright, not just
  // as a fallback for an oversized dataset. Only engaged for a single-entity question: a multi-entity
  // lookup keeps using the legacy path below unchanged, same constraint the single-item fast path
  // above already applies. This is also the only branch compound-question splitting applies to —
  // see `splitCompoundQuestion`'s own doc comment for why (both providers were observed dropping
  // half of "hvor mange produkter har vi og hvem er på tilbud?", since `LookupQuerySpec` can't
  // represent two independent questions in one call).
  if (entities.length === 1 && entities[0].lookupQueryFields && entities[0].listQueryableRecords) {
    const [entity] = entities
    const halves = splitCompoundQuestion(message, uiLanguage)
    const resolveHalf = (text: string) => resolveSingleEntityLookup(entity, context, text, uiLanguage, capability, modelOverride, providerOverride, localModelOverride, baseFilters ?? undefined, trace)

    let result: { reply: string; list?: AssistantReplyList }
    let focusUpdate: DialogFocusUpdate | undefined
    if (halves) {
      const [a, b] = await Promise.all(halves.map(resolveHalf))
      result = combineCompoundReplies(a, b)
      focusUpdate = combineFocusUpdates(a, b)
    } else {
      const single = await resolveHalf(message)
      result = single
      focusUpdate = single.focusUpdate
    }

    if (focusUpdate) setDialogFocus(conversationId, focusFromUpdate(focusUpdate))
    return { status: 'ready', reply: result.reply, list: result.list, trace }
  }

  const recordsPerBatch = resolveRecordsPerBatch(capability, chunkSizePreference, customChunkRecordCount)

  const dataBlockResults = await Promise.all(
    entities.map((entity) =>
      buildEntityDataBlock(entity, context, message, uiLanguage, recordsPerBatch, capability.chunkCharBudget, capability.useVerifyPass, historyContext ?? null, modelOverride, providerOverride, localModelOverride, trace).then(
        (dataBlock) => ({ dataBlock }),
      ),
    ),
  )

  const lookupGuidance = entities
    .map((entity) => entity.lookupGuidance)
    .filter(Boolean)
    .join('\n')

  // No `historyContextPromptLine` here — this is exactly where a local model was observed
  // inventing "på tilbud" for an unrelated count question, pattern-matching onto a *previous*
  // exchange's own topic; the data block below already contains everything a correct reply needs
  // (see the plan behind this fix — this is a scoping correction, not a small-model-only
  // workaround, so it applies to both providers).
  const systemPrompt = [
    languageInstruction(uiLanguage),
    currentDateInstruction(),
    "You are answering a factual question about the Wraps & Coffee admin dashboard's own current data, using only the data provided below — never use outside/general knowledge, and never invent a fact the data doesn't support.",
    'An empty list, a zero count, or "no matches" in the data below is itself a complete, valid answer (e.g. "there are currently none") — do not treat it as missing information to hedge about.',
    'A data block below with a "matchingCount"/"matchingNames" pair has already been fully, completely checked against that exact question, record by record — that count and name list are the final answer, not a sample or a subset needing further detail. Report the count as a definite fact (e.g. "there are 7") — never hedge with "I only have example data" or "I\'d need more detail (like dates) to know for sure" when that checking has already been done for you.',
    'Write your own complete sentence in the admin\'s own language — never literally copy a label or phrase straight out of the data block below (e.g. never answer with something like "7 record(s) satisfy it"). If the question asks "which"/"what" ones (not just a count), your sentence must actually name every one of them from "matchingNames" — a bare count alone does not answer a "which" question.',
    "If the data below genuinely doesn't contain what's needed to answer, say so honestly rather than guessing.",
    'A "matchingCount"/"matchingNames" data block only tells you whether each record matched the question and its name — never any other field (price, discount, stock, allergens, etc.) by itself. When exactly one match was found, a separate "Full record for the one match found above" block may also be present below with that record\'s real field data — check for it and use it if the question needs a specific field value. If the question asks for a specific field value (e.g. "how much does it cost?", "what\'s the discount amount?") and that value genuinely isn\'t present anywhere in the data below (no such full-record block, or it\'s missing the needed field), say you don\'t have that specific detail rather than inventing a plausible-sounding number — a fabricated price is far worse than admitting the data below doesn\'t include it.',
    lookupGuidance,
    dataBlockResults.map((result) => result.dataBlock).join('\n\n'),
  ]
    .filter(Boolean)
    .join('\n\n')

  const schema: AssistantJsonSchema = {
    type: 'object',
    properties: {
      reply: {
        type: 'string',
        description:
          "A short, direct answer to the admin's question, in their own language, based only on the data above — your own complete sentence, never a phrase copied verbatim from the data block. If the question asks which/what items match, name them (from \"matchingNames\"), not just a bare count.",
      },
    },
    required: ['reply'],
    additionalProperties: false,
  }

  const callArgs = {
    systemPrompt,
    userText: message,
    toolName: 'answer_lookup',
    toolDescription: 'Answer the question using the provided data.',
    schema,
    model: modelOverride,
    provider: providerOverride,
    localModel: localModelOverride,
    trace,
  }
  const result = capability.useVerifyPass ? await generateThenVerify<{ reply: string }>(callArgs) : await callToolOnce<{ reply: string }>(callArgs)
  return { status: 'ready', ...result, trace }
}

/**
 * The continuation call once the admin has picked one specific candidate off
 * an `answerLookup` `'clarifyItem'` result — answers directly from that one,
 * now-unambiguous record. Never searches or picks anything itself; `itemID`
 * is already a settled fact by the time this runs.
 */
export async function answerLookupForItem(
  entityKey: string,
  itemID: string,
  message: string,
  uiLanguage: 'no' | 'en',
  session: AssistantSession,
  historyContext?: string,
  modelOverride?: store.AssistantModel,
  providerOverride?: store.AssistantProvider,
  localModelOverride?: string,
  /** The picked candidate's own label (the client already has this from the `clarifyItem` candidate list it rendered) — used both to tell `answerFromRecord` which record this is and to write this turn's `DialogFocus`. */
  label?: string,
  /** This chat's own id (see `useAssistantFlow.ts`) — used only to write this turn's resolved `DialogFocus` once the reply is ready. */
  conversationId?: string,
): Promise<{ reply: string; trace: AssistantTraceEntry[] }> {
  const entity = requireAccessibleEntity(entityKey, session)
  if (!entity.getCurrent) throw new Error(`"${entityKey}" has nothing to look up.`)
  const context: AssistantFillContext = { uiLanguage, session }
  const record = await entity.getCurrent(itemID, context)
  if (!record) throw new Error("Couldn't find that item anymore — it may have been deleted.")
  const capability = resolveModelCapability(modelOverride, providerOverride)
  const result = await answerFromRecord(entity, record, label, message, uiLanguage, historyContext, modelOverride, providerOverride, localModelOverride, capability, [])
  setDialogFocus(conversationId, focusFromUpdate({ kind: 'item', entity: entityKey, id: itemID, label: label ?? itemID }))
  return result
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
  providerOverride?: store.AssistantProvider,
  localModelOverride?: string,
  localVisionModelOverride?: string,
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
    provider: providerOverride,
    localModel: localModelOverride,
    localVisionModel: localVisionModelOverride,
    trace,
  })
  return { ...result, trace }
}
