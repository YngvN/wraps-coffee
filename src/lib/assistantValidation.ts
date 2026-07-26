import type { AppearanceTheme } from '../types/appearanceTheme'
import type { Catalogue, Category } from '../types/category'
import type { ContactInfo } from '../types/contactInfo'
import type { CustomFieldDefinition } from '../types/customFields'
import type { EventRecord } from '../types/event'
import type { IntegrationsConfig } from '../types/integrations'
import type { MessageBoard, MessageBoardPost } from '../types/messageBoard'
import { MESSAGE_BOARD_BODY_MAX_LENGTH, MESSAGE_BOARD_TITLE_MAX_LENGTH } from '../types/messageBoard'
import { ALLERGEN_OPTIONS, DIETARY_TAG_ORDER, type Product } from '../types/product'

/** A single field-level problem found in an AI-assistant-proposed draft — `code` maps to an `admin.assistant.validation.<code>` i18n key. Framework-agnostic: importable from both `server/*` (the pre-review check) and `src/*` (the client's own re-check right before Save, in case the admin edited the draft in the review form). */
export interface AssistantValidationIssue {
  code: string
  params?: Record<string, string>
}

function priceIssues(price: Product['price'], fieldLabel: string): AssistantValidationIssue[] {
  if (price === undefined) return []
  if (typeof price === 'number') return price < 0 ? [{ code: 'negativeNumber', params: { field: fieldLabel } }] : []
  const issues: AssistantValidationIssue[] = []
  if (price.takeaway < 0) issues.push({ code: 'negativeNumber', params: { field: 'takeaway price' } })
  if (price.eatIn < 0) issues.push({ code: 'negativeNumber', params: { field: 'eat-in price' } })
  return issues
}

/** Checks a proposed Product draft — non-negative numbers, discount bounds, category/allergen/dietary-tag values within the real, live enums, and the `category`-xor-`catalogueId` invariant (see `Product.catalogueId`'s own doc comment): exactly one of them should be set, and whichever one is should reference something real. */
export function validateProductDraft(draft: Product, categories: Category[], catalogues: Catalogue[]): AssistantValidationIssue[] {
  const issues: AssistantValidationIssue[] = [...priceIssues(draft.price, 'price')]

  if (draft.discount?.type === 'percentage' && (draft.discount.percentage < 0 || draft.discount.percentage > 100)) {
    issues.push({ code: 'percentageOutOfRange', params: { field: 'discount percentage' } })
  }
  if (draft.discount?.type === 'amount' && draft.discount.amount < 0) {
    issues.push({ code: 'negativeNumber', params: { field: 'discount amount' } })
  }

  if (draft.category) {
    if (!categories.some((category) => category.id === draft.category)) issues.push({ code: 'unknownCategory', params: { category: draft.category } })
  } else if (draft.catalogueId) {
    if (!catalogues.some((catalogue) => catalogue.id === draft.catalogueId)) issues.push({ code: 'unknownCatalogue', params: { catalogue: draft.catalogueId } })
  } else {
    issues.push({ code: 'missingCategoryOrCatalogue' })
  }

  const validAllergens = new Set(ALLERGEN_OPTIONS.map((option) => option.code as string))
  for (const allergen of draft.allergens) {
    if (!validAllergens.has(allergen)) issues.push({ code: 'unknownAllergen', params: { value: allergen } })
  }
  const validDietaryTags = new Set<string>(DIETARY_TAG_ORDER)
  for (const tag of draft.dietaryTags) {
    if (!validDietaryTags.has(tag)) issues.push({ code: 'unknownDietaryTag', params: { value: tag } })
  }
  if (draft.trackStock && (draft.stockQuantity ?? 0) < 0) issues.push({ code: 'negativeNumber', params: { field: 'stock quantity' } })

  const category = categories.find((candidate) => candidate.id === draft.category)
  for (const [fieldId, value] of Object.entries(draft.customFieldValues ?? {})) {
    const field = category?.customFields?.find((candidate) => candidate.id === fieldId)
    if (!field) continue // Stale value for a field the category no longer defines — harmless, not this draft's own mistake to flag.
    const valueType = typeof value
    const expectedType = field.type === 'select' ? 'string' : field.type
    if (valueType !== expectedType) {
      issues.push({ code: 'customFieldTypeMismatch', params: { field: field.label.no || field.label.en } })
    } else if (field.type === 'select' && !field.options?.some((option) => option.id === value)) {
      issues.push({ code: 'customFieldUnknownOption', params: { field: field.label.no || field.label.en } })
    }
  }

  return issues
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const ISO_TIME = /^\d{2}:\d{2}$/

/** Checks a proposed EventRecord draft — non-negative numbers, date/time sanity, and the `status: 'postponed'` + missing `postponedDetails` foot-gun that silently drops an event from every screen once its original date passes. */
export function validateEventDraft(draft: EventRecord): AssistantValidationIssue[] {
  const issues: AssistantValidationIssue[] = []

  if (draft.price < 0) issues.push({ code: 'negativeNumber', params: { field: 'price' } })
  if (draft.capacity < 0) issues.push({ code: 'negativeNumber', params: { field: 'capacity' } })
  if (draft.date && !ISO_DATE.test(draft.date)) issues.push({ code: 'invalidDate', params: { field: 'date' } })
  if (draft.time && !ISO_TIME.test(draft.time)) issues.push({ code: 'invalidTime', params: { field: 'time' } })
  if (draft.endTime && !ISO_TIME.test(draft.endTime)) issues.push({ code: 'invalidTime', params: { field: 'end time' } })
  if (draft.time && draft.endTime && ISO_TIME.test(draft.time) && ISO_TIME.test(draft.endTime) && draft.endTime <= draft.time) {
    issues.push({ code: 'endBeforeStart' })
  }
  if (draft.recurring && draft.recurrence && (draft.recurrence.dayOfWeek < 0 || draft.recurrence.dayOfWeek > 6)) {
    issues.push({ code: 'invalidDayOfWeek' })
  }
  if (draft.status === 'postponed' && !draft.postponedDetails?.newDate) {
    issues.push({ code: 'postponedMissingNewDate' })
  }

  return issues
}

/** Checks a proposed new-user draft — this app has no password-strength/length rule today, so this only mirrors the manual `UserForm`'s own single real check (non-empty). Username uniqueness is authoritative server-side (`store.createUser`); this is a fast client-visible check, not the real gate. */
export function validateUserDraft(input: { username: string; password: string }, existingUsernames: string[]): AssistantValidationIssue[] {
  const issues: AssistantValidationIssue[] = []
  if (!input.username.trim()) issues.push({ code: 'usernameRequired' })
  if (!input.password) issues.push({ code: 'passwordRequired' })
  if (existingUsernames.includes(input.username.trim())) issues.push({ code: 'usernameTaken', params: { username: input.username.trim() } })
  return issues
}

/** Checks a proposed Catalogue draft — non-negative fallback price, and (delete only) a soft warning naming how many products would be orphaned, since the manual UI's own delete flow claims a full cascade it doesn't actually perform (see `server/assistant/entities/catalogue.ts`). */
export function validateCatalogueDraft(draft: Catalogue, dependentProductCount: number): AssistantValidationIssue[] {
  const issues: AssistantValidationIssue[] = [...priceIssues(draft.price, 'price')]
  if (dependentProductCount > 0) {
    issues.push({ code: 'catalogueDeleteOrphansProducts', params: { count: String(dependentProductCount) } })
  }
  return issues
}

/** Checks a category's own custom-field schema (see `CustomFieldDefinition`) — every field needs a non-empty label (either language), and a `'select'`-type field needs at least one choice, or there's nothing for a product to actually pick. */
export function validateCustomFieldDefinitions(fields: CustomFieldDefinition[]): AssistantValidationIssue[] {
  const issues: AssistantValidationIssue[] = []
  for (const field of fields) {
    if (!field.label.no.trim() && !field.label.en.trim()) issues.push({ code: 'customFieldLabelRequired' })
    if (field.type === 'select' && (!field.options || field.options.length === 0)) issues.push({ code: 'customFieldNeedsOptions', params: { field: field.label.no || field.label.en } })
  }
  return issues
}

/** Checks a proposed Category draft — non-empty default-language name, non-negative default price, and its own custom-field schema (if any). */
export function validateCategoryDraft(draft: Category, defaultPrice: Product['price']): AssistantValidationIssue[] {
  const issues: AssistantValidationIssue[] = [...priceIssues(defaultPrice, 'default price'), ...validateCustomFieldDefinitions(draft.customFields ?? [])]
  if (!draft.name.no.trim() && !draft.name.en.trim()) issues.push({ code: 'nameRequired' })
  return issues
}

/** Checks a proposed Message Board draft — just a non-empty name (rename/create share this). */
export function validateMessageBoardDraft(draft: MessageBoard): AssistantValidationIssue[] {
  return draft.name.trim() ? [] : [{ code: 'nameRequired' }]
}

/** Checks a proposed Message Board post draft — length limits (matching `MessageBoardPostForm`'s own `maxLength`s), a real target board, and (if set) a parseable expiry date. */
export function validateMessageBoardPostDraft(draft: MessageBoardPost, boards: MessageBoard[]): AssistantValidationIssue[] {
  const issues: AssistantValidationIssue[] = []
  if (!draft.title.trim()) issues.push({ code: 'titleRequired' })
  if (draft.title.length > MESSAGE_BOARD_TITLE_MAX_LENGTH) issues.push({ code: 'titleTooLong', params: { max: String(MESSAGE_BOARD_TITLE_MAX_LENGTH) } })
  if (draft.body.length > MESSAGE_BOARD_BODY_MAX_LENGTH) issues.push({ code: 'bodyTooLong', params: { max: String(MESSAGE_BOARD_BODY_MAX_LENGTH) } })
  if (!boards.some((board) => board.id === draft.boardId)) issues.push({ code: 'unknownBoard' })
  if (draft.expiresAt && Number.isNaN(Date.parse(draft.expiresAt))) issues.push({ code: 'invalidDate', params: { field: 'expiry date' } })
  return issues
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/

/** Checks a proposed new theme color — must be a real `#rrggbb` hex value (the manual UI gets this for free from `<input type="color">`; the model needs an explicit check). */
export function validateThemeColorDraft(hex: string): AssistantValidationIssue[] {
  return HEX_COLOR.test(hex) ? [] : [{ code: 'invalidHexColor', params: { value: hex } }]
}

/** Checks a proposed Theme draft — non-empty name/fonts (all three are `required` in the manual `ThemeEditorForm`), plus (delete/setActive only) the same guards `AppearanceSettingsView.tsx` enforces in its own UI: can't delete the active theme, can't delete the last remaining theme. */
export function validateThemeDraft(draft: AppearanceTheme, action: 'create' | 'update' | 'delete' | 'trigger', isActive: boolean, themeCount: number): AssistantValidationIssue[] {
  const issues: AssistantValidationIssue[] = []
  if (action !== 'delete') {
    if (!draft.name.trim()) issues.push({ code: 'nameRequired' })
    if (!draft.fonts.body.trim() || !draft.fonts.heading.trim() || !draft.fonts.subheading.trim()) issues.push({ code: 'fontsRequired' })
  }
  if (action === 'delete') {
    if (isActive) issues.push({ code: 'themeDeleteActive' })
    if (themeCount <= 1) issues.push({ code: 'themeDeleteLast' })
  }
  return issues
}

/** Checks a proposed Store branding draft — just a non-empty name (the manual form's only `required` field). */
export function validateStoreSettingsDraft(name: string): AssistantValidationIssue[] {
  return name.trim() ? [] : [{ code: 'nameRequired' }]
}

/** Checks a proposed Contact info draft — an open day needs both an open and a close time (the manual form always shows/expects both once "closed" is unchecked). */
export function validateContactInfoDraft(draft: ContactInfo): AssistantValidationIssue[] {
  const issues: AssistantValidationIssue[] = []
  for (const [day, hours] of Object.entries(draft.hours)) {
    if (!hours.closed && (!hours.open || !hours.close)) issues.push({ code: 'dayMissingHours', params: { day } })
  }
  return issues
}

/** Checks a proposed integration enable/disable — replicates the real preconditions the manual UI's own disabled-checkbox states enforce (`IntegrationsView.tsx`), so the assistant can't silently turn on an integration with nothing to show. */
export function validateIntegrationToggleDraft(
  integration: 'weather' | 'transit' | 'entur' | 'news',
  enabled: boolean,
  newsSourceIds: string[] | undefined,
  config: IntegrationsConfig,
): AssistantValidationIssue[] {
  if (!enabled) return []
  if (integration === 'weather') {
    const hasCoordinates = Boolean(config.addressLookup?.coordinates) || config.weather.locations.some((location) => location.coordinates)
    return hasCoordinates ? [] : [{ code: 'weatherNeedsAddress' }]
  }
  if (integration === 'transit' || integration === 'entur') {
    return (config.addressLookup?.nearbyStops.length ?? 0) > 0 ? [] : [{ code: 'transitNeedsAddress' }]
  }
  // news
  return (newsSourceIds?.length ?? 0) > 0 ? [] : [{ code: 'newsNeedsSource' }]
}
