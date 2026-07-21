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

/** Whether `occursAt`'s own calendar day has already fully passed as of `from` (defaulting to today) — ignores time of day, so an event later today isn't "past" the moment its own start time slips by, only once its whole day has elapsed. Used by `EventMonthSlide` to grey out/strike through past entries in an otherwise-unfiltered month list (see `getEventsInMonth`, which unlike `getUpcomingEvents` deliberately keeps past occurrences in range). */
export function isEventPast(occursAt: Date, from: Date = new Date()): boolean {
  return daysBetween(from, occursAt) < 0
}

/** Combines a `YYYY-MM-DD` date string and `HH:MM` time string into a `Date`. */
export function toDateTime(date: string, time: string): Date {
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
 * Returns the `count` events soonest in the upcoming timeline, sorted
 * soonest-first. A cancelled event is never excluded by date — it keeps
 * occupying its own timeline position (sorted by its original `date`/`time`,
 * same slot it held before being cancelled) indefinitely, marked
 * `status: 'cancelled'`, until the admin deletes the event record outright;
 * the caller is expected to show that state rather than treat `occursAt` as
 * a real future date. A postponed event is included at its own rescheduled
 * date/time, marked `status: 'postponed'` — the caller should still
 * indicate that, since `occursAt` alone doesn't say the date changed. A
 * non-cancelled event with no future occurrence (it already happened, or a
 * postponed/recurring event has genuinely run out) is excluded, which is
 * what naturally promotes "2nd" to "1st" once "1st" has passed.
 */
export function getUpcomingEvents(events: EventRecord[], count: number, from: Date = new Date()): UpcomingEvent[] {
  return events
    .map((event): UpcomingEvent | null => {
      if (event.status === 'cancelled') return { event, occursAt: toDateTime(event.date, event.time), status: 'cancelled' }
      const occursAt = getNextOccurrence(event, from)
      if (!occursAt) return null
      return { event, occursAt, status: event.status === 'postponed' ? 'postponed' : 'scheduled' }
    })
    .filter((entry): entry is UpcomingEvent => entry !== null)
    .sort((a, b) => a.occursAt.getTime() - b.occursAt.getTime())
    .slice(0, count)
}

/**
 * Returns the event at the given 1-based `ordinal` position in the upcoming
 * timeline (see `getUpcomingEvents`), or `null` if fewer than `ordinal`
 * events exist there.
 */
export function getNthUpcomingEvent(events: EventRecord[], ordinal: number, from: Date = new Date()): UpcomingEvent | null {
  return getUpcomingEvents(events, ordinal, from)[ordinal - 1] ?? null
}

/**
 * Returns every event occurring anywhere in the same calendar month as
 * `from` (defaulting to today), sorted soonest-first — see
 * `getOccurrencesInRange` for how cancelled/postponed/recurring events are
 * each represented.
 */
export function getEventsInMonth(events: EventRecord[], from: Date = new Date()): UpcomingEvent[] {
  const rangeStart = new Date(from.getFullYear(), from.getMonth(), 1)
  const rangeEnd = new Date(from.getFullYear(), from.getMonth() + 1, 1)
  return getOccurrencesInRange(events, rangeStart, rangeEnd)
}

/** Formats `price` as a localized currency string (e.g. "kr 150,00" for `no`), using the same per-language locale as `formatEventDate`. Callers should check `isEventFree` first and show a "Free" label instead — a `0`/`NaN` price is by definition free, not "0,00 kr". */
export function formatEventPrice(price: number, currency: string, language: LanguageCode): string {
  return new Intl.NumberFormat(LOCALE_BY_LANGUAGE[language], { style: 'currency', currency }).format(price)
}

/** Whether an event's own `price` should be shown as "Free" rather than a formatted currency amount — `0`, or `NaN` from unset/invalid admin input. */
export function isEventFree(price: number): boolean {
  return price === 0 || Number.isNaN(price)
}

/**
 * Returns every occurrence of `events` that falls within `[rangeStart,
 * rangeEnd)`, sorted soonest-first. Unlike `getUpcomingEvents`, this expands
 * recurring events into all of their matching occurrences in the range
 * rather than just the next one, which is what a calendar grid needs. A
 * whole-event `status === 'cancelled'` appears once, at its original
 * `date`/`time` (marked `status: 'cancelled'`) if that falls in range —
 * same "stays visible until deleted" posture as `getUpcomingEvents` —
 * rather than being excluded; a postponed event appears once, at its own
 * rescheduled date/time (marked `status: 'postponed'`); a cancelled
 * *exception* of an otherwise-active recurring series (one cancelled date
 * within it, not the whole series) is still skipped, a separate concept
 * from a whole-event cancellation.
 */
export function getOccurrencesInRange(events: EventRecord[], rangeStart: Date, rangeEnd: Date): UpcomingEvent[] {
  const occurrences: UpcomingEvent[] = []

  for (const event of events) {
    if (event.status === 'cancelled') {
      const occursAt = toDateTime(event.date, event.time)
      if (occursAt >= rangeStart && occursAt < rangeEnd) occurrences.push({ event, occursAt, status: 'cancelled' })
      continue
    }

    if (event.status === 'postponed' && event.postponedDetails.newDate && event.postponedDetails.newTime) {
      const occursAt = toDateTime(event.postponedDetails.newDate, event.postponedDetails.newTime)
      if (occursAt >= rangeStart && occursAt < rangeEnd) occurrences.push({ event, occursAt, status: 'postponed' })
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
          occurrences.push({ event, occursAt: toDateTime(dateStr, event.time), status: 'scheduled' })
        }
        candidate.setDate(candidate.getDate() + 7)
      }
      continue
    }

    const occursAt = toDateTime(event.date, event.time)
    if (occursAt >= rangeStart && occursAt < rangeEnd) occurrences.push({ event, occursAt, status: 'scheduled' })
  }

  return occurrences.sort((a, b) => a.occursAt.getTime() - b.occursAt.getTime())
}
