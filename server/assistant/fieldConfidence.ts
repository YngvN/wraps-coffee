/**
 * How sure a `fillFields` draft's own field value is, for the review UI's own confidence
 * markers (see `AssistantReviewSummary.tsx`) — `'verbatim'` means the value appears literally in
 * the admin's message, `'inferred'` means the model derived it without it being literally present,
 * `'unknown'` means the field was left unset entirely.
 */
export type FieldConfidence = 'verbatim' | 'inferred' | 'unknown'

/**
 * Derives a field's own confidence deterministically from the draft value and the admin's raw
 * message — never asked of the model itself. A model grading its own confidence is exactly the
 * kind of self-report this codebase's other deterministic prefilters exist to avoid (real testing
 * elsewhere showed models unreliable at self-assessment); checking whether the value is literally
 * present in the source text is a plain, checkable fact instead.
 *
 * A synthetic/id-shaped value (e.g. a merged `"category:<id>"` field) will always read
 * `'inferred'` here even when the admin named the category by its real label — the *value* itself
 * genuinely isn't literal text in the message, only its human label is, and mapping that back
 * generically isn't attempted here. Documented limitation, not a bug.
 */
export function inferFieldConfidence(value: unknown, rawMessage: string): FieldConfidence {
  if (value === null || value === undefined || value === '') return 'unknown'
  const lower = rawMessage.toLowerCase()
  if (typeof value === 'string') return lower.includes(value.toLowerCase()) ? 'verbatim' : 'inferred'
  if (typeof value === 'number') return lower.includes(String(value)) ? 'verbatim' : 'inferred'
  if (Array.isArray(value)) return value.every((item) => typeof item === 'string' && lower.includes(item.toLowerCase())) ? 'verbatim' : 'inferred'
  // Booleans and anything else are never literally typed out by the admin — always a judgment call.
  return 'inferred'
}
