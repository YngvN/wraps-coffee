import { validateContactInfoDraft } from '../../../src/lib/assistantValidation'
import type { ContactInfo, DayHours } from '../../../src/types/contactInfo'
import * as store from '../../store'
import { nullable, type AssistantEntity, type AssistantJsonSchema, type AssistantValidationIssue } from '../types'

const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const
type Weekday = (typeof WEEKDAYS)[number]

function liveContactInfo(): ContactInfo {
  return (
    (store.get('admin.contactInfo')?.value as ContactInfo | undefined) ?? {
      phone: '',
      email: '',
      address: '',
      hours: Object.fromEntries(WEEKDAYS.map((day) => [day, { closed: true }])) as ContactInfo['hours'],
      temporarilyClosed: false,
    }
  )
}

/**
 * `closed`/`open`/`close` are required (not individually nullable) once a day's own wrapper object
 * is present at all — only the wrapper itself (below) is nullable, to skip a day the message doesn't
 * address. See `fillFieldsSchema`'s own comment for why this specific field needed flattening: with
 * every field nullable, this entity's schema had 33 nullable/`anyOf`-typed properties, well past
 * Claude's own 16-union-parameter schema limit. `open`/`close` use `""` (not `null`) for "not
 * applicable" — a plain required string still counts as one, not-union, field toward that limit.
 */
interface DayFields {
  closed: boolean
  open: string
  close: string
}

type ContactInfoFields = {
  phone: string | null
  email: string | null
  address: string | null
  temporarilyClosed: boolean | null
  temporarilyClosedReason: string | null
} & Record<Weekday, DayFields | null>

/**
 * A singleton — same "fixed `itemID: 'singleton'`" pattern as `storeSettings`
 * (see that file's own doc comment). `hours` is a small fixed 7-key object
 * (not a variable-length list), so a single-shot fill is safe — each weekday
 * is its own optional nested field the model only fills when the message
 * actually addresses that day.
 */
export const contactInfoEntity: AssistantEntity<ContactInfo> = {
  key: 'contactInfo',
  supportedActions: ['update'],
  section: 'store',

  /**
   * Only the per-day wrapper object below is `nullable(...)` (skip a day the message doesn't
   * address) — `closed`/`open`/`close` inside it are plain required fields, not each individually
   * nullable, specifically to keep this schema's total union-typed-property count low: Claude's API
   * rejects any single tool schema with more than 16 `anyOf`/type-array properties, and the previous
   * fully-nullable-nested-fields shape hit 33 (confirmed via a real `400` at runtime, not a guess).
   * `open`/`close` use `""` for "not applicable" instead of `null` — see `DayFields`'s own doc comment.
   */
  fillFieldsSchema(): AssistantJsonSchema {
    const dayProperties = Object.fromEntries(
      WEEKDAYS.map((day) => [
        day,
        nullable({
          type: 'object',
          properties: {
            closed: { type: 'boolean' },
            open: { type: 'string', description: 'Opening time, "HH:MM" 24-hour, or "" if closed/not applicable.' },
            close: { type: 'string', description: 'Closing time, "HH:MM" 24-hour, or "" if closed/not applicable.' },
          },
          required: ['closed', 'open', 'close'],
          additionalProperties: false,
        }),
      ]),
    )
    return {
      type: 'object',
      properties: {
        phone: nullable({ type: 'string' }),
        email: nullable({ type: 'string' }),
        address: nullable({ type: 'string' }),
        temporarilyClosed: nullable({ type: 'boolean', description: 'A one-off closure overriding the regular weekly hours below (e.g. closed today for a private event) — not the same as a weekday\'s own recurring closed day.' }),
        temporarilyClosedReason: nullable({ type: 'string', description: 'Optional public-facing reason for the temporary closure, e.g. "Closed for a private event". Only meaningful when temporarilyClosed is true.' }),
        ...dayProperties,
      },
      required: ['phone', 'email', 'address', 'temporarilyClosed', 'temporarilyClosedReason', ...WEEKDAYS],
      additionalProperties: false,
    }
  },

  async getCurrent(): Promise<ContactInfo | null> {
    return liveContactInfo()
  },

  mergeDraft(_action, current, rawFields): ContactInfo {
    const fields = rawFields as ContactInfoFields
    const base = current ?? liveContactInfo()
    const hours = { ...base.hours }
    for (const day of WEEKDAYS) {
      const dayFields = fields[day]
      if (!dayFields) continue
      const existing: DayHours = hours[day]
      hours[day] = {
        closed: dayFields.closed,
        open: dayFields.open || existing.open,
        close: dayFields.close || existing.close,
      }
    }
    return {
      ...base,
      phone: fields.phone ?? base.phone,
      email: fields.email ?? base.email,
      address: fields.address ?? base.address,
      temporarilyClosed: fields.temporarilyClosed ?? base.temporarilyClosed ?? false,
      temporarilyClosedReason: fields.temporarilyClosedReason ?? base.temporarilyClosedReason,
      hours,
    }
  },

  validate(_action, draft: ContactInfo): AssistantValidationIssue[] {
    return validateContactInfoDraft(draft)
  },

  reviewComponent() {
    return 'existingForm'
  },

  async listAll(): Promise<ContactInfo> {
    return liveContactInfo()
  },

  lookupGuidance:
    'Check `temporarilyClosed` first, before reciting the regular weekly `hours` below. When it is true, the cafe is closed right now regardless of what today\'s normal weekday hours say — lead the answer with that fact (and `temporarilyClosedReason` if given) rather than reciting Monday-Friday hours as if nothing had changed. Only fall back to the regular weekly `hours` for an "when are you open" style question once `temporarilyClosed` is confirmed false, or when the question is specifically about the regular/normal schedule rather than right now.',
}
