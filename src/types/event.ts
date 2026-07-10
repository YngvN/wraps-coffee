import type { BilingualText } from './bilingual'

/** A weekly recurrence rule for an event. */
export interface EventRecurrence {
  frequency: 'weekly'
  dayOfWeek: number
  interval?: number
}

/** A single date on which a recurring event's normal schedule doesn't apply. */
export interface EventException {
  date: string
  reason?: string
  status: 'cancelled'
}

/** A person attending or involved in an event. */
export interface EventParticipant {
  name: string
  email: string
  roleAtEvent: string
}

/** The person to contact regarding an event. */
export interface EventContactPerson {
  name: string
  phone: string
  email: string
}

/** A menu item highlighted for an event. */
export interface EventMenuItemRef {
  itemID: string
  name: string
  price: number
}

/** New date/time for a postponed event. */
export interface PostponedDetails {
  newDate: string | null
  newTime: string | null
  newEndTime: string | null
}

/** A scheduled event, as stored in `src/data/events.json` and edited via the admin Events view. */
export interface EventRecord {
  eventID: string
  title: BilingualText
  category: string
  date: string
  time: string
  endTime: string
  recurring: boolean
  recurrence: EventRecurrence | null
  exceptions?: EventException[]
  location: { name: BilingualText; address: string }
  description: BilingualText
  capacity: number
  attendeesCount: number
  price: number
  currency: string
  tags: string[]
  participants?: EventParticipant[]
  contactPerson?: EventContactPerson
  menuItems: EventMenuItemRef[]
  status: 'scheduled' | 'postponed' | 'cancelled'
  postponedDetails: PostponedDetails
  imageUrl: string
  registrationRequired: boolean
}

/** An event paired with the date/time of its next upcoming occurrence. */
export interface UpcomingEvent {
  event: EventRecord
  occursAt: Date
}
