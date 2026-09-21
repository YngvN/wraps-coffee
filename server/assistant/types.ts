import type { AdminRole, DashboardSection, SyncedKey } from '../../src/types/sync'
import type { LookupQueryField, LookupQueryRecord } from './lookupQuery'

/** The subset of a server session that the assistant engine needs — matches `store.ts`'s own (unexported) `SessionInfo` shape. */
export interface AssistantSession {
  username: string
  role: AdminRole
  allowedSections?: DashboardSection[]
}

/**
 * Which step-shaped action a chat operation is performing. Extensible on
 * purpose — an entity declares only the subset it actually supports (see
 * `AssistantEntity.supportedActions`), so e.g. `user` never offers `'update'`
 * (no edit route exists for it today) while `product`/`event` never offer
 * `'resetPassword'`.
 */
export type AssistantActionName = 'create' | 'update' | 'delete' | 'resetPassword' | 'trigger'

/** A single field-level problem found by an entity's own `validate()` — `code` maps to an `admin.assistant.validation.<code>` i18n key, never a hardcoded message. */
export interface AssistantValidationIssue {
  code: string
  params?: Record<string, string>
}

/** A minimal JSON Schema shape — deliberately narrow (just what `messages.create`'s `tools[].input_schema` and `strict: true` need), not a general-purpose JSON Schema type. The index signature is only there to satisfy the Anthropic SDK's own `InputSchema` type at the call site (`client.ts`). */
export interface AssistantJsonSchema {
  type: 'object'
  properties: Record<string, unknown>
  required: string[]
  additionalProperties: false
  [key: string]: unknown
}

/** One candidate row offered to `select_item` — a real, current `itemID`/`eventID`/user id plus a short human label, never a free-text guess. */
export interface AssistantCandidate {
  id: string
  label: string
}

/** One row of a structured list reply attachment — see `AssistantReplyList`. */
export interface AssistantListItem {
  label: string
  sublabel?: string
}

/**
 * A structured list of matched records attached to a lookup reply, built
 * entirely in code (`steps.ts`'s `buildEntityQueryDataBlock`) from records
 * `executeLookupQuery` already resolved — never authored by the model. Lets
 * the client render real bullet points instead of asking a small model to
 * regenerate the same list as prose, which real testing showed hallucinating
 * duplicate/malformed entries for no benefit. `style` is a plain `'bullet'`
 * today; `'numbered'` is reserved for a future rendering mode, not yet
 * implemented on the client.
 */
export interface AssistantReplyList {
  style: 'bullet'
  items: AssistantListItem[]
}

/** Everything a `fillFieldsSchema`/`validate` call needs beyond the draft itself — built fresh, server-side, on every call (see `steps.ts`), never trusted from the client. */
export interface AssistantFillContext {
  uiLanguage: 'no' | 'en'
  session: AssistantSession
  /** The requesting device's own kebab-menu "Allow pane editing" toggle (see `AssistantPanel.tsx`) — a self-chosen per-device preference, not a security boundary (same posture as `modelOverride`/`ingestionPosture`), threaded through from `steps.ts`'s own `fillFields` options. Only `screenPane.fillFieldsSchema` ever consults this; every other entity ignores it. `undefined` (not explicitly sent, or an entity that doesn't care) is treated as off. */
  allowPaneContentEditing?: boolean
}

/**
 * One manageable "thing" the assistant can operate on. Adding a new entity to
 * the assistant means writing one new file implementing this contract and
 * registering it in `registry.ts` — the state machine, the HTTP routes, and
 * the confirmation UI never need to change. See the `assistant-entities` skill for the
 * rule that keeps this registry in sync with new dashboard functionality.
 */
export interface AssistantEntity<TDraft> {
  key: string
  supportedActions: AssistantActionName[]
  /** `null` = never available to a `'limited'` role (both `admin` and `subadmin` still allowed, e.g. Users); a real section = gated by that section, same as a synced-key write. */
  section: DashboardSection | null
  /** `imageField` set = an attached chat image can be merged directly into this field of the draft (see `AssistantPanel`'s image-attach flow) — entirely separate from whether the model reads the same image via vision. */
  imageField?: keyof TDraft & string
  /** True for `delete` and any single-shot irreversible `trigger` action — drives the stricter typed-confirmation review UI instead of the plain "mount the real form" one. */
  destructive?: (action: AssistantActionName) => boolean
  /**
   * `knownDraft` is whatever the caller already knows about the target
   * record before this call — the live `current` record on `update`, or the
   * previous pass's own proposed draft on a `create` correction round
   * (`steps.ts` passes `current ?? priorDraft`). Most entities ignore it;
   * it exists for a field whose own *shape* depends on another field's value
   * (e.g. `product.ts`'s `customFieldValues`, which can't be built into the
   * schema until `category` is known — impossible on a `create`'s very first
   * pass, since that call is what picks the category in the first place, but
   * available by the time an admin's follow-up message corrects/adds detail
   * to that same draft).
   */
  fillFieldsSchema(action: AssistantActionName, context: AssistantFillContext, knownDraft?: Partial<TDraft>): AssistantJsonSchema
  /** Omitted for singleton/create-only entities with nothing to pick from. `context.uiLanguage` is the admin's own chat language — a bilingual entity's candidate `label` should read from that one side only (e.g. `product.name[context.uiLanguage]`), never concatenate every language, so the confirmation list the admin sees only ever shows the language they're chatting in. */
  listCandidates?(action: AssistantActionName, context: AssistantFillContext, searchText: string): Promise<AssistantCandidate[]>
  getCurrent?(id: string, context: AssistantFillContext): Promise<TDraft | null>
  /**
   * Fields worth stopping and asking about, rather than silently guessing,
   * for this action — omitted/empty for actions where nothing applies (e.g.
   * `update`/`delete` always have a real `current` value already). Called
   * *after* the model's own pass, with that pass's own raw proposal
   * (`fields`) — the entity itself decides whether a field is genuinely
   * still unresolved, since that can depend on more than just "is this one
   * property null" (e.g. `product.ts` never asks "which category?" once the
   * model has already set `catalogueId`, a deliberate "no category" rather
   * than an unresolved one). Each entry's `field` name matches a property in
   * this same entity's own `fillFieldsSchema`, and `options` reuses the
   * exact live-data list that schema already builds that field's enum from
   * (never a duplicate lookup). `steps.ts` auto-resolves any returned entry
   * with exactly one option (nothing to actually choose between) and only
   * turns the rest into real questions.
   */
  clarifiableFields?(action: AssistantActionName, context: AssistantFillContext, fields: Record<string, unknown>): Promise<{ field: string; questionKey: string; options: AssistantCandidate[] }[]>
  /**
   * Field names (matching this entity's own `fillFieldsSchema` property keys) that a weaker/local
   * model reliably fabricates rather than leaving null, once they're offered in the schema at all —
   * see the "ingestion posture" plan. Stripped from the schema entirely (never sent to the model,
   * never merely a prompt instruction to ignore) under a `'safe'` posture; present unchanged under
   * `'full'`. Omit entirely for an entity with nothing identified as confabulation-risk.
   */
  confabulationRiskFields?: string[]
  /** Merges the model's raw (schema-validated but not yet business-validated) tool `input` into a full draft — `current` is the live record for `update`/`resetPassword`, `null` for `create`. This is the one place bilingual fields land in the right language slot (only `context.uiLanguage`'s side is ever touched) and defaults get applied — steps.ts never special-cases a particular entity. */
  mergeDraft(action: AssistantActionName, current: TDraft | null, fields: unknown, context: AssistantFillContext): TDraft
  validate(action: AssistantActionName, draft: TDraft, context: AssistantFillContext): AssistantValidationIssue[]
  /** Which review UI `AssistantPanel` mounts for a given action — `'existingForm'` reuses the entity's own real admin form component; `'destructiveSummary'` is the typed-confirmation read-only card. */
  reviewComponent(action: AssistantActionName): 'existingForm' | 'destructiveSummary'
  /**
   * Returns this entity's full current live data — an array for an ordinary
   * collection, the single record for a singleton — for `answerLookup`'s own
   * informational Q&A only (see `steps.ts`); never consulted by the CRUD
   * flow above. `unknown` on purpose: every caller only ever `JSON.stringify`s
   * this into a prompt, so there's no shared shape worth typing precisely.
   * Omit this entirely for a sub-resource with no identity of its own outside
   * its parent entity (e.g. `categoryCustomField`/`appearanceThemeColor`,
   * whose data already lives inside `category`/`theme`'s own `listAll`)
   * rather than duplicating that same data confusingly.
   */
  listAll?(context: AssistantFillContext): Promise<unknown>
  /**
   * Extra domain-specific instruction spliced into both `answerLookup`'s own
   * compose prompt and every per-batch `lookup_batch` prompt (`steps.ts`) —
   * for when this entity's real field semantics aren't obvious from the raw
   * JSON alone, so a lookup question phrased in ordinary language doesn't map
   * cleanly onto a literal field check. Two concrete cases that motivated
   * this: a product's `discount` field is the *only* real signal for
   * "on sale"/"discounted" — a weaker model asked "how many products are on
   * sale" has no other cue and can otherwise guess wildly; an event's
   * `status`/`postponedDetails` change what its own `date` field actually
   * means for "has this happened yet" (a `'cancelled'` event never happened
   * regardless of `date`; a `'postponed'` one didn't happen on its original
   * `date`, and only really has a resolved future date once
   * `postponedDetails.newDate` is set). Omit entirely for an entity with no
   * such non-obvious mapping — most don't need this.
   */
  lookupGuidance?: string
  /**
   * A plain, deterministically-computed fact about this entity's *entire*
   * current dataset — not filtered by whatever the admin's specific question
   * was — always appended to this entity's own data block in `answerLookup`,
   * regardless of chunking. For a whole-dataset aggregate that's cheap and
   * exact to compute directly in code (e.g. counting how many records have a
   * given boolean flag set), this is deliberately *not* left to the
   * `lookup_batch` map-reduce the way an admin's own filtering question is —
   * that path already showed real inconsistency on a weaker model even for a
   * literal field check repeated across several batches (see
   * `event.ts`'s own `hasOccurred`/`recurring` handling for the motivating
   * case: "there are 17 events, and 3 of them repeat weekly"). Omit entirely
   * for an entity with no such distinguishing whole-dataset fact worth
   * surfacing.
   */
  datasetSummary?(context: AssistantFillContext): Promise<string>
  /**
   * Which of this entity's fields can be filtered/reported on for a lookup
   * question — see `lookupQuery.ts`'s own module doc comment for why this
   * exists: it turns "does this record match the filter" from a model
   * judgment call (the `lookup_batch` classifier's job, shown by real testing
   * to be unreliable even at 7B) into a small enum pick the model makes,
   * executed deterministically in code (`steps.ts`'s `buildEntityQueryDataBlock`).
   * Omit entirely for an entity with nothing worth exposing this way (e.g.
   * `messageBoard`, whose only field is a plain name) — it then keeps using
   * the existing `listAll`-based batch/full-dump path unchanged. Always
   * implemented together with `listQueryableRecords` below.
   */
  lookupQueryFields?(context: AssistantFillContext): Promise<LookupQueryField[]>
  /**
   * The flattened rows `lookupQueryFields` above filters/reports over —
   * independent of whatever shape `listAll` returns (e.g. `theme`'s `listAll`
   * returns a settings object, not a flat array; this still exposes one row
   * per theme). Only ever consulted by the query engine, never the CRUD flow.
   */
  listQueryableRecords?(context: AssistantFillContext): Promise<LookupQueryRecord[]>
  /**
   * Singular/plural noun for this entity, in both languages — lets
   * `steps.ts`'s `buildEntityQueryDataBlock` phrase a plain count question
   * ("hvor mange produkter har vi?"/"how many products do we have?")
   * entirely in code once `executeLookupQuery` already knows the count,
   * skipping the final `answer_lookup` compose call altogether: real testing
   * showed that call inventing a filter nobody asked for (context bleed from
   * an earlier, unrelated question) even when the query step itself resolved
   * correctly. Only implemented for entities `listQueryableRecords` above
   * already covers — omit for anything else, same "opt-in per entity"
   * convention as `lookupQueryFields`.
   */
  countLabel?: { no: { singular: string; plural: string }; en: { singular: string; plural: string } }
}

/** A `SyncedKey`-backed entity's own commit descriptor — informational only; the actual write still goes through the normal WS `write` path from the browser (see the plan's "hard invariant" — this server module never writes app data itself). */
export interface SyncedCommit {
  via: 'syncPublish'
  key: SyncedKey
}

/** A dedicated-REST-route-backed entity's own commit descriptor (e.g. Users) — same "informational only, browser performs the real write" posture as `SyncedCommit`. */
export interface RestCommit {
  via: 'restEndpoint'
  describe: string
}

export type AssistantCommit = SyncedCommit | RestCommit

/** Thrown by `anthropicClient.ts`/`ollamaClient.ts` when the active provider isn't configured yet (no Claude API key, or no reachable Ollama host/models) — routes map this to a clean 409 rather than a raw 500. */
export class AssistantNotConfiguredError extends Error {
  constructor(message = 'No Claude API key has been configured yet.') {
    super(message)
    this.name = 'AssistantNotConfiguredError'
  }
}

/** Thrown by `ollamaClient.ts` when a local model's reply still isn't usable after the parse/repair/retry pipeline has exhausted its attempts — see the plan's "structured JSON output from small local models" section. */
export class AssistantLocalProviderError extends Error {
  constructor(toolName: string) {
    super(`The local model didn't return a usable answer for "${toolName}" after retrying.`)
    this.name = 'AssistantLocalProviderError'
  }
}

/**
 * Wraps a schema fragment as nullable, using the `anyOf` form Claude's
 * strict tool-use JSON Schema validator actually supports — the seemingly
 * equivalent `{ type: [X, "null"], enum: [...values, null] }` shorthand is
 * rejected at request time for enum fields (confirmed: `400 invalid_request_error`,
 * `"Enum value '<value>' does not match declared type"`), so every nullable
 * property across every entity's `fillFieldsSchema`/`select_item`/`select_intent`
 * tool goes through this helper instead of hand-writing the `type` array.
 */
export function nullable(schema: Record<string, unknown>): Record<string, unknown> {
  return { anyOf: [schema, { type: 'null' }] }
}

/** Removes the given keys from a schema's `properties`/`required` — used under a `'safe'` ingestion posture to strip an entity's own `confabulationRiskFields` before the schema is ever sent to the model. A no-op (returns `schema` unchanged) when `fields` is empty, so every call site can call this unconditionally rather than branching on whether the entity has any risk fields at all. */
export function stripSchemaFields(schema: AssistantJsonSchema, fields: string[]): AssistantJsonSchema {
  if (fields.length === 0) return schema
  const properties = { ...schema.properties }
  for (const field of fields) delete properties[field]
  return { ...schema, properties, required: schema.required.filter((key) => !fields.includes(key)) }
}
