/**
 * Recurrence pattern for a recurring cafe event:
 * - `weekly`: occurs every week on `dayOfWeek` at `hour:minute`.
 * - `biweekly`: occurs every other week on `dayOfWeek` at `hour:minute`,
 *   relative to a known `anchor` occurrence (an ISO date string).
 * - `monthly`: occurs on the `first` or `last` `dayOfWeek` of each month at `hour:minute`.
 *
 * `dayOfWeek` follows `Date.getDay()` (0 = Sunday … 6 = Saturday).
 */
export type EventRecurrence =
  | { type: 'weekly'; dayOfWeek: number; hour: number; minute: number }
  | { type: 'biweekly'; dayOfWeek: number; hour: number; minute: number; anchor: string }
  | { type: 'monthly'; week: 'first' | 'last'; dayOfWeek: number; hour: number; minute: number }

/**
 * Recurrence schedules for the events shown on the Events page, keyed by the
 * same translation key used under `events.items` in `languages.json`.
 */
export const EVENT_RECURRENCES: Record<string, EventRecurrence> = {
  poetryNight: { type: 'weekly', dayOfWeek: 2, hour: 19, minute: 0 },
  movieNight: { type: 'monthly', week: 'last', dayOfWeek: 5, hour: 20, minute: 0 },
  liveMusic: { type: 'biweekly', dayOfWeek: 6, hour: 18, minute: 0, anchor: '2026-01-03' },
  coffeeTasting: { type: 'monthly', week: 'first', dayOfWeek: 0, hour: 11, minute: 0 },
}

/** Returns the next date/time on or after `from` that falls on `dayOfWeek` at `hour:minute`. */
function nextWeekday(from: Date, dayOfWeek: number, hour: number, minute: number): Date {
  const result = new Date(from)
  result.setHours(hour, minute, 0, 0)
  result.setDate(result.getDate() + ((dayOfWeek - result.getDay() + 7) % 7))
  if (result < from) result.setDate(result.getDate() + 7)
  return result
}

/** Returns the first or last occurrence of `dayOfWeek` at `hour:minute` within the given month. */
function monthlyWeekday(year: number, month: number, dayOfWeek: number, week: 'first' | 'last', hour: number, minute: number): Date {
  if (week === 'first') {
    const result = new Date(year, month, 1, hour, minute, 0, 0)
    result.setDate(result.getDate() + ((dayOfWeek - result.getDay() + 7) % 7))
    return result
  }
  const result = new Date(year, month + 1, 0, hour, minute, 0, 0)
  result.setDate(result.getDate() - ((result.getDay() - dayOfWeek + 7) % 7))
  return result
}

/** Returns the number of whole weeks between two dates that share the same time of day. */
function weeksBetween(from: Date, to: Date): number {
  const msPerWeek = 7 * 24 * 60 * 60 * 1000
  return Math.round((to.getTime() - from.getTime()) / msPerWeek)
}

/**
 * Computes the next date/time at which an event with the given recurrence
 * occurs, on or after `from` (defaults to now).
 */
export function getNextEventDate(recurrence: EventRecurrence, from: Date = new Date()): Date {
  switch (recurrence.type) {
    case 'weekly':
      return nextWeekday(from, recurrence.dayOfWeek, recurrence.hour, recurrence.minute)

    case 'biweekly': {
      const candidate = nextWeekday(from, recurrence.dayOfWeek, recurrence.hour, recurrence.minute)
      const anchor = new Date(recurrence.anchor)
      anchor.setHours(recurrence.hour, recurrence.minute, 0, 0)
      if (weeksBetween(anchor, candidate) % 2 !== 0) {
        candidate.setDate(candidate.getDate() + 7)
      }
      return candidate
    }

    case 'monthly': {
      const thisMonth = monthlyWeekday(from.getFullYear(), from.getMonth(), recurrence.dayOfWeek, recurrence.week, recurrence.hour, recurrence.minute)
      if (thisMonth >= from) return thisMonth
      return monthlyWeekday(from.getFullYear(), from.getMonth() + 1, recurrence.dayOfWeek, recurrence.week, recurrence.hour, recurrence.minute)
    }
  }
}
