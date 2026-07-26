import { validateEventDraft } from '../../../src/lib/assistantValidation'
import type { EventRecord } from '../../../src/types/event'
import * as store from '../../store'
import { nullable, type AssistantCandidate, type AssistantEntity, type AssistantFillContext, type AssistantJsonSchema, type AssistantValidationIssue } from '../types'

function liveEvents(): EventRecord[] {
  return (store.get('admin.events')?.value as EventRecord[] | undefined) ?? []
}

/** Raw shape Claude proposes — same single-language `title`/`description` pattern as `ProductFields`. Excludes every field `EventForm.tsx` itself doesn't expose (`participants`, `contactPerson`, `menuItems`, `exceptions`, `tags`, `attendeesCount`, `currency`, `registrationRequired`) — those are preserved unchanged/defaulted, matching the manual form's own current behavior exactly. */
interface EventFields {
  title: string | null
  description: string | null
  category: string | null
  date: string | null
  time: string | null
  endTime: string | null
  locationAddress: string | null
  capacity: number | null
  price: number | null
  repeatsWeekly: boolean | null
  dayOfWeek: number | null
  status: 'scheduled' | 'postponed' | 'cancelled' | null
  postponedNewDate: string | null
  postponedNewTime: string | null
  postponedNewEndTime: string | null
}

export const eventEntity: AssistantEntity<EventRecord> = {
  key: 'event',
  supportedActions: ['create', 'update', 'delete'],
  section: 'events',
  imageField: 'imageUrl',
  destructive: (action) => action === 'delete',

  fillFieldsSchema(_action, context: AssistantFillContext): AssistantJsonSchema {
    const languageName = context.uiLanguage === 'no' ? 'Norwegian' : 'English'
    return {
      type: 'object',
      properties: {
        title: nullable({ type: 'string', description: `The event's title, in ${languageName}.` }),
        description: nullable({ type: 'string', description: `The event's description, in ${languageName}.` }),
        category: nullable({ type: 'string', description: 'A free-text label for this event, e.g. "Live music" or "Workshop" — not tied to the Products catalogue.' }),
        date: nullable({ type: 'string', description: 'ISO date, yyyy-mm-dd.' }),
        time: nullable({ type: 'string', description: 'Start time, 24h HH:mm.' }),
        endTime: nullable({ type: 'string', description: 'End time, 24h HH:mm.' }),
        locationAddress: nullable({ type: 'string' }),
        capacity: nullable({ type: 'number' }),
        price: nullable({ type: 'number' }),
        repeatsWeekly: nullable({ type: 'boolean' }),
        dayOfWeek: nullable({ type: 'number', enum: [0, 1, 2, 3, 4, 5, 6], description: 'Only meaningful when repeatsWeekly is true. 0 = Sunday.' }),
        status: nullable({ type: 'string', enum: ['scheduled', 'postponed', 'cancelled'] }),
        postponedNewDate: nullable({ type: 'string', description: 'Only set when status is "postponed" — the event\'s new date, ISO yyyy-mm-dd.' }),
        postponedNewTime: nullable({ type: 'string' }),
        postponedNewEndTime: nullable({ type: 'string' }),
      },
      required: [
        'title',
        'description',
        'category',
        'date',
        'time',
        'endTime',
        'locationAddress',
        'capacity',
        'price',
        'repeatsWeekly',
        'dayOfWeek',
        'status',
        'postponedNewDate',
        'postponedNewTime',
        'postponedNewEndTime',
      ],
      additionalProperties: false,
    }
  },

  async listCandidates(_action, context: AssistantFillContext, searchText: string): Promise<AssistantCandidate[]> {
    const needle = searchText.trim().toLowerCase()
    const matches = liveEvents().filter((event) => !needle || event.title.no.toLowerCase().includes(needle) || event.title.en.toLowerCase().includes(needle))
    return matches.slice(0, 30).map((event) => ({ id: event.eventID, label: `${event.title[context.uiLanguage]} (${event.date})` }))
  },

  async getCurrent(id: string): Promise<EventRecord | null> {
    return liveEvents().find((event) => event.eventID === id) ?? null
  },

  mergeDraft(_action, current, rawFields, context: AssistantFillContext): EventRecord {
    const fields = rawFields as EventFields
    const base: EventRecord =
      current ?? {
        eventID: `${Date.now()}`,
        title: { no: '', en: '' },
        category: '',
        date: '',
        time: '',
        endTime: '',
        recurring: false,
        recurrence: null,
        location: { name: { no: 'Wraps & Coffee', en: 'Wraps & Coffee' }, address: '' },
        description: { no: '', en: '' },
        capacity: 0,
        attendeesCount: 0,
        price: 0,
        currency: 'NOK',
        tags: [],
        menuItems: [],
        status: 'scheduled',
        postponedDetails: { newDate: null, newTime: null, newEndTime: null },
        imageUrl: '',
        registrationRequired: false,
      }

    const repeatsWeekly = fields.repeatsWeekly ?? base.recurring
    const dayOfWeek = fields.dayOfWeek ?? base.recurrence?.dayOfWeek ?? 0

    return {
      ...base,
      title: { ...base.title, [context.uiLanguage]: fields.title ?? base.title[context.uiLanguage] },
      description: { ...base.description, [context.uiLanguage]: fields.description ?? base.description[context.uiLanguage] },
      category: fields.category ?? base.category,
      date: fields.date ?? base.date,
      time: fields.time ?? base.time,
      endTime: fields.endTime ?? base.endTime,
      location: { ...base.location, address: fields.locationAddress ?? base.location.address },
      capacity: fields.capacity ?? base.capacity,
      price: fields.price ?? base.price,
      recurring: repeatsWeekly,
      recurrence: repeatsWeekly ? { frequency: 'weekly', dayOfWeek } : null,
      status: fields.status ?? base.status,
      postponedDetails: {
        newDate: fields.postponedNewDate ?? base.postponedDetails.newDate,
        newTime: fields.postponedNewTime ?? base.postponedDetails.newTime,
        newEndTime: fields.postponedNewEndTime ?? base.postponedDetails.newEndTime,
      },
    }
  },

  validate(_action, draft: EventRecord): AssistantValidationIssue[] {
    return validateEventDraft(draft)
  },

  reviewComponent(action) {
    return action === 'delete' ? 'destructiveSummary' : 'existingForm'
  },
}
