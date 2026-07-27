import type { AdminRole, DashboardSection, SyncedKey } from '../../src/types/sync'

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

/** Everything a `fillFieldsSchema`/`validate` call needs beyond the draft itself — built fresh, server-side, on every call (see `steps.ts`), never trusted from the client. */
export interface AssistantFillContext {
  uiLanguage: 'no' | 'en'
  session: AssistantSession
}

/**
 * One manageable "thing" the assistant can operate on. Adding a new entity to
 * the assistant means writing one new file implementing this contract and
 * registering it in `registry.ts` — the state machine, the HTTP routes, and
 * the confirmation UI never need to change. See this repo's CLAUDE.md for the
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

/** Thrown by `client.ts` when no Anthropic API key is stored yet. */
export class AssistantNotConfiguredError extends Error {
  constructor() {
    super('No Claude API key has been configured yet.')
    this.name = 'AssistantNotConfiguredError'
  }
}

/** Thrown by `steps.ts` when the configured provider (`server/store.ts`'s `getAssistantProvider()`) isn't actually implemented — today, only `'local'`. */
export class AssistantProviderNotAvailableError extends Error {
  constructor(provider: string) {
    super(`The "${provider}" assistant provider isn't available yet.`)
    this.name = 'AssistantProviderNotAvailableError'
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
