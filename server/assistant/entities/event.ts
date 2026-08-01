import { validateEventDraft } from '../../../src/lib/assistantValidation'
import type { EventRecord } from '../../../src/types/event'
import { isEventPast, toDateTime } from '../../../src/utils/events'
import * as store from '../../store'
import type { LookupQueryField, LookupQueryRecord } from '../lookupQuery'
import { nullable, type AssistantCandidate, type AssistantEntity, type AssistantFillContext, type AssistantJsonSchema, type AssistantValidationIssue } from '../types'

function liveEvents(): EventRecord[] {
  return (store.get('admin.events')?.value as EventRecord[] | undefined) ?? []
}

/**
 * Whether an event has already taken place, as of right now — computed here
 * in real code (reusing the same `isEventPast`/`toDateTime` the kiosk
 * calendar display already relies on) rather than left for the model to work
 * out from `date` plus `status`/`postponedDetails` itself: real testing
 * showed even a plain date comparison isn't reliably consistent when a
 * weaker model has to redo it per batch (the same clearly-past, plainly-
 * `scheduled` event was correctly counted in one run and silently missed in
 * the next). A `'cancelled'` event never occurred, regardless of `date`. A
 * `'postponed'` event did not occur on its own `date` — occurred only if its
 * `postponedDetails.newDate` has since passed, otherwise treated as not yet
 * occurred (still pending a real date) — deliberately *not* the same
 * question `getNextOccurrence` answers, which would (incidentally, for a
 * different purpose) fall back to the original `date` here. Only a
 * `'scheduled'` event's own `date` directly decides it.
 */
function hasOccurred(event: EventRecord): boolean {
  if (event.status === 'cancelled') return false
  if (event.status === 'postponed') {
    return event.postponedDetails.newDate !== null && isEventPast(toDateTime(event.postponedDetails.newDate, event.postponedDetails.newTime ?? event.time))
  }
  return isEventPast(toDateTime(event.date, event.time))
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

  async listAll(): Promise<(EventRecord & { hasOccurred: boolean })[]> {
    return liveEvents().map((event) => ({ ...event, hasOccurred: hasOccurred(event) }))
  },

  lookupGuidance:
    'Each event record already includes a computed `hasOccurred` boolean (true if it has already taken place as of right now, correctly accounting for `status`/`postponedDetails` — a cancelled event is never "occurred", a postponed one only once its own rescheduled date has passed). Use this field directly for any "has this already happened"/"upcoming"/"before today" question — never try to work it out yourself from `date`/`status`/`postponedDetails`, since that computation is already done correctly for you. Separately, an event\'s own `recurring` field (true = repeats weekly, see `recurrence.dayOfWeek`) is a different, independent "kind" of event — not related to whether it has occurred or is on sale. There\'s also a whole-dataset fact given elsewhere in this data about how many events repeat weekly — when giving a general count or overview of events (not narrowly filtered to something else), it\'s good practice to mention that breakdown too if it\'s relevant (e.g. "there are 17 events, and 3 of them repeat weekly").',

  async datasetSummary(): Promise<string> {
    const events = liveEvents()
    const recurringCount = events.filter((event) => event.recurring).length
    return `Of the ${events.length} events in total, ${recurringCount} repeat on a weekly schedule (\`recurring: true\`) and ${events.length - recurringCount} are one-off.`
  },

  /** See `lookupQuery.ts`'s own module doc comment — `hasOccurred`/`recurring` are already computed above; exposing them here lets `answerLookup` skip the `lookup_batch` classifier (which real testing showed can't reliably re-derive a plain date comparison across batches) for `event` questions entirely. */
  async lookupQueryFields(): Promise<LookupQueryField[]> {
    return [
      { key: 'hasOccurred', label: 'Already happened', type: 'boolean', description: 'Whether the event has already taken place as of right now — correctly accounts for cancelled/postponed status, never derive this yourself from the raw date.' },
      { key: 'recurring', label: 'Repeats weekly', type: 'boolean' },
      { key: 'status', label: 'Status', type: 'enum', enumValues: ['scheduled', 'postponed', 'cancelled'] },
      { key: 'capacity', label: 'Capacity', type: 'number' },
      { key: 'price', label: 'Price', type: 'number' },
      { key: 'date', label: 'Date', type: 'string', description: 'ISO date, yyyy-mm-dd — the event\'s own original date, not accounting for a postponement.' },
      { key: 'time', label: 'Start time', type: 'string' },
      { key: 'locationAddress', label: 'Address', type: 'string' },
    ]
  },

  async listQueryableRecords(context: AssistantFillContext): Promise<LookupQueryRecord[]> {
    return liveEvents().map((event) => ({
      id: event.eventID,
      label: `${event.title[context.uiLanguage]} (${event.date})`,
      fields: {
        hasOccurred: hasOccurred(event),
        recurring: event.recurring,
        status: event.status,
        capacity: event.capacity,
        price: event.price,
        date: event.date,
        time: event.time,
        locationAddress: event.location.address,
      },
    }))
  },
}
