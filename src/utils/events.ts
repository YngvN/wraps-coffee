import type { LanguageCode } from '../i18n'
import type { EventRecord, UpcomingEvent } from '../types/event'

/** Locale used to format event dates for each supported language. */
const LOCALE_BY_LANGUAGE: Record<LanguageCode, string> = {
  en: 'en-GB',
  no: 'nb-NO',
}

/** Formats `date` for display using the locale for `language`. */
export function formatEventDate(date: Date, language: LanguageCode, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(LOCALE_BY_LANGUAGE[language], options).format(date)
}

/** Returns the number of whole days between two dates, ignoring time of day. */
function daysBetween(from: Date, to: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000
  const fromMidnight = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  const toMidnight = new Date(to.getFullYear(), to.getMonth(), to.getDate())
  return Math.round((toMidnight.getTime() - fromMidnight.getTime()) / msPerDay)
}

/** Combines a `YYYY-MM-DD` date string and `HH:MM` time string into a `Date`. */
function toDateTime(date: string, time: string): Date {
  return new Date(`${date}T${time}:00`)
}

/**
 * Returns the date/time of the next upcoming occurrence of `event` on or
 * after `from`, or `null` if the event has no future occurrence (e.g. it's
 * cancelled, postponed to a date that's already passed, or a one-off event
 * that's already happened).
 *
 * - For postponed events, the `postponedDetails` date/time is used instead
 *   of the original `date`/`time`.
 * - For weekly recurring events, the next matching weekday is used, skipping
 *   any date listed in `exceptions` with a `cancelled` status.
 */
export function getNextOccurrence(event: EventRecord, from: Date = new Date()): Date | null {
  if (event.status === 'cancelled') return null

  if (event.status === 'postponed' && event.postponedDetails.newDate && event.postponedDetails.newTime) {
    const occursAt = toDateTime(event.postponedDetails.newDate, event.postponedDetails.newTime)
    return occursAt >= from ? occursAt : null
  }

  if (event.recurring && event.recurrence?.frequency === 'weekly') {
    const cancelledDates = new Set(event.exceptions?.filter((exception) => exception.status === 'cancelled').map((exception) => exception.date))

    // Look ahead up to 8 weeks for the next non-cancelled occurrence.
    for (let week = 0; week < 8; week++) {
      const candidate = new Date(from)
      candidate.setDate(candidate.getDate() + ((event.recurrence.dayOfWeek - candidate.getDay() + 7) % 7) + week * 7)
      candidate.setHours(0, 0, 0, 0)
      const dateStr = candidate.toISOString().slice(0, 10)
      if (!cancelledDates.has(dateStr)) {
        return toDateTime(dateStr, event.time)
      }
    }
    return null
  }

  const occursAt = toDateTime(event.date, event.time)
  return daysBetween(from, occursAt) >= 0 ? occursAt : null
}

/**
 * Returns the `count` events with the soonest upcoming occurrence on or
 * after `from`, sorted soonest-first. Cancelled events and events with no
 * future occurrence are excluded.
 */
export function getUpcomingEvents(events: EventRecord[], count: number, from: Date = new Date()): UpcomingEvent[] {
  return events
    .map((event) => ({ event, occursAt: getNextOccurrence(event, from) }))
    .filter((entry): entry is UpcomingEvent => entry.occursAt !== null)
    .sort((a, b) => a.occursAt.getTime() - b.occursAt.getTime())
    .slice(0, count)
}

/**
 * Returns every occurrence of `events` that falls within `[rangeStart,
 * rangeEnd)`, sorted soonest-first. Unlike `getUpcomingEvents`, this expands
 * recurring events into all of their matching occurrences in the range
 * rather than just the next one, which is what a calendar grid needs.
 * Cancelled events (and cancelled exceptions of recurring events) are
 * excluded; postponed events appear only at their postponed date/time.
 */
export function getOccurrencesInRange(events: EventRecord[], rangeStart: Date, rangeEnd: Date): UpcomingEvent[] {
  const occurrences: UpcomingEvent[] = []

  for (const event of events) {
    if (event.status === 'cancelled') continue

    if (event.status === 'postponed' && event.postponedDetails.newDate && event.postponedDetails.newTime) {
      const occursAt = toDateTime(event.postponedDetails.newDate, event.postponedDetails.newTime)
      if (occursAt >= rangeStart && occursAt < rangeEnd) occurrences.push({ event, occursAt })
      continue
    }

    if (event.recurring && event.recurrence?.frequency === 'weekly') {
      const cancelledDates = new Set(event.exceptions?.filter((exception) => exception.status === 'cancelled').map((exception) => exception.date))
      const candidate = new Date(rangeStart)
      candidate.setDate(candidate.getDate() + ((event.recurrence.dayOfWeek - candidate.getDay() + 7) % 7))
      candidate.setHours(0, 0, 0, 0)

      while (candidate < rangeEnd) {
        const dateStr = candidate.toISOString().slice(0, 10)
        if (!cancelledDates.has(dateStr)) {
          occurrences.push({ event, occursAt: toDateTime(dateStr, event.time) })
        }
        candidate.setDate(candidate.getDate() + 7)
      }
      continue
    }

    const occursAt = toDateTime(event.date, event.time)
    if (occursAt >= rangeStart && occursAt < rangeEnd) occurrences.push({ event, occursAt })
  }

  return occurrences.sort((a, b) => a.occursAt.getTime() - b.occursAt.getTime())
}
