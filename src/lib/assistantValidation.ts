import type { Category } from '../types/category'
import type { EventRecord } from '../types/event'
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

/** Checks a proposed Product draft — non-negative numbers, discount bounds, category/allergen/dietary-tag values within the real, live enums. */
export function validateProductDraft(draft: Product, categories: Category[]): AssistantValidationIssue[] {
  const issues: AssistantValidationIssue[] = [...priceIssues(draft.price, 'price')]

  if (draft.discount?.type === 'percentage' && (draft.discount.percentage < 0 || draft.discount.percentage > 100)) {
    issues.push({ code: 'percentageOutOfRange', params: { field: 'discount percentage' } })
  }
  if (draft.discount?.type === 'amount' && draft.discount.amount < 0) {
    issues.push({ code: 'negativeNumber', params: { field: 'discount amount' } })
  }
  if (!categories.some((category) => category.id === draft.category)) {
    issues.push({ code: 'unknownCategory', params: { category: draft.category } })
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
