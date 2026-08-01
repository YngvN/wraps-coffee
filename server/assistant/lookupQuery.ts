import { nullable, type AssistantJsonSchema } from './types'

/**
 * The generalized form of the `product.ts` `effectivePrice`/`hasDiscount` fix
 * — instead of asking a model to read raw JSON and judge whether a record
 * matches a filter (the `lookup_batch` classifier's job, which real testing
 * showed even a 7B model gets systematically wrong), an entity declares which
 * of its fields can be filtered/reported on, the model's only job is picking
 * a small structured query against that fixed set of fields (an enum choice,
 * not a judgment call), and `executeLookupQuery` runs it in plain code. See
 * `steps.ts`'s `buildEntityQueryDataBlock`, which wires this into `answerLookup`.
 */
export type LookupQueryFieldType = 'boolean' | 'string' | 'number' | 'enum'

/** One filterable/reportable fact about an entity's records — analogous to a single column the model is allowed to query, never the raw record shape itself. */
export interface LookupQueryField {
  key: string
  label: string
  type: LookupQueryFieldType
  /** Only meaningful for `type: 'enum'`. */
  enumValues?: string[]
  description?: string
}

/** A flattened row an entity exposes for querying — independent of whatever shape its own `listAll()` returns (e.g. `theme`/`integrationToggle`, whose `listAll()` returns a settings object, not a flat array). */
export interface LookupQueryRecord {
  id: string
  label: string
  fields: Record<string, string | number | boolean | string[] | null>
}

interface LookupQueryFilterInput {
  field: string
  op: string
  value: string
}

/** The model's only real decision: which fields to filter on (an enum pick, not a judgment call) and — separately — which field's actual value the question wants reported back, never computed. */
export interface LookupQuerySpec {
  filters: LookupQueryFilterInput[]
  reportField: string | null
}

/** Every op offered across every field type — kept as one flat enum (this app's `AssistantJsonSchema` has no conditional/`if-then` support, only plain `enum`/`anyOf`) with the per-field-type applicability spelled out in each field's own schema description instead. `executeLookupQuery` interprets a mismatched op (e.g. `lessThan` on a boolean field) leniently rather than throwing — the description steers the model toward sensible combinations, but a schema-valid-yet-odd one should still degrade gracefully. */
const ALL_OPS = ['is', 'isNot', 'equals', 'notEquals', 'contains', 'lessThan', 'greaterThan'] as const

function opsHintFor(type: LookupQueryFieldType): string {
  if (type === 'boolean') return '"is"/"isNot"'
  if (type === 'number') return '"equals"/"lessThan"/"greaterThan"'
  return '"equals"/"notEquals"/"contains"'
}

/** Builds the small, enum-heavy schema for one entity's query call — see `LookupQuerySpec`. */
export function buildLookupQuerySchema(fields: LookupQueryField[]): AssistantJsonSchema {
  const fieldKeys = fields.map((field) => field.key)
  const fieldDescriptions = fields
    .map((field) => `"${field.key}" (${field.type}${field.enumValues ? `, one of: ${field.enumValues.join('/')}` : ''}, use ${opsHintFor(field.type)}) — ${field.description ?? field.label}`)
    .join('; ')

  return {
    type: 'object',
    properties: {
      filters: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            field: { type: 'string', enum: fieldKeys },
            op: { type: 'string', enum: [...ALL_OPS] },
            value: { type: 'string', description: 'The value to compare against, as plain text (e.g. "true", "42", "Wraps") — coerced to the right type for the field automatically.' },
          },
          required: ['field', 'op', 'value'],
          additionalProperties: false,
        },
        description: `Zero or more conditions every matching record must satisfy (an empty array matches every record) — never a field outside this list, and never guess at a condition the admin's question doesn't actually ask for. Available fields: ${fieldDescriptions}`,
      },
      reportField: nullable({
        type: 'string',
        enum: fieldKeys,
        description:
          'Set this when the question asks for a specific field\'s real value (e.g. "how much does it cost", "when is it") — never null in that case. Its actual value is looked up and reported for you; you never compute or guess it. Leave null for a plain "which"/"how many" question with nothing further to report.',
      }),
    },
    required: ['filters', 'reportField'],
    additionalProperties: false,
  }
}

function coerceValue(raw: string, type: LookupQueryFieldType): string | number | boolean {
  if (type === 'boolean') return raw.trim().toLowerCase() === 'true'
  if (type === 'number') return Number(raw)
  return raw
}

function matchesFilter(fieldValue: unknown, filter: LookupQueryFilterInput, type: LookupQueryFieldType): boolean {
  const target = coerceValue(filter.value, type)

  if (type === 'boolean') {
    const actual = Boolean(fieldValue)
    return filter.op === 'isNot' || filter.op === 'notEquals' ? actual !== target : actual === target
  }

  if (type === 'number') {
    const actual = typeof fieldValue === 'number' ? fieldValue : Number(fieldValue)
    const targetNumber = target as number
    if (filter.op === 'lessThan') return actual < targetNumber
    if (filter.op === 'greaterThan') return actual > targetNumber
    if (filter.op === 'notEquals') return actual !== targetNumber
    return actual === targetNumber
  }

  // string / enum
  const actual = String(fieldValue ?? '').toLowerCase()
  const targetString = String(target).toLowerCase()
  if (filter.op === 'contains') return actual.includes(targetString)
  if (filter.op === 'notEquals' || filter.op === 'isNot') return actual !== targetString
  return actual === targetString
}

/** Applies `spec.filters` against `records` in plain code — no model call, nothing to hallucinate. A filter naming a field outside `fields` (shouldn't happen given the schema's own enum, but never trusted blindly) is skipped rather than excluding every record. */
export function executeLookupQuery(records: LookupQueryRecord[], spec: LookupQuerySpec, fields: LookupQueryField[]): LookupQueryRecord[] {
  const typeByKey = new Map(fields.map((field) => [field.key, field.type]))
  return records.filter((record) =>
    spec.filters.every((filter) => {
      const type = typeByKey.get(filter.field)
      if (!type) return true
      return matchesFilter(record.fields[filter.field], filter, type)
    }),
  )
}
