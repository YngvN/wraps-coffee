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
    }
  )
}

interface DayFields {
  closed: boolean | null
  open: string | null
  close: string | null
}

type ContactInfoFields = {
  phone: string | null
  email: string | null
  address: string | null
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

  fillFieldsSchema(): AssistantJsonSchema {
    const dayProperties = Object.fromEntries(
      WEEKDAYS.map((day) => [
        day,
        nullable({
          type: 'object',
          properties: {
            closed: nullable({ type: 'boolean' }),
            open: nullable({ type: 'string', description: 'Opening time, "HH:MM" 24-hour.' }),
            close: nullable({ type: 'string', description: 'Closing time, "HH:MM" 24-hour.' }),
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
        ...dayProperties,
      },
      required: ['phone', 'email', 'address', ...WEEKDAYS],
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
        closed: dayFields.closed ?? existing.closed,
        open: dayFields.open ?? existing.open,
        close: dayFields.close ?? existing.close,
      }
    }
    return {
      ...base,
      phone: fields.phone ?? base.phone,
      email: fields.email ?? base.email,
      address: fields.address ?? base.address,
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
}
