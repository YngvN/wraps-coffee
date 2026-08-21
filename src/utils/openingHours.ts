import type { ContactInfo, DayHours } from '../types/contactInfo'

/**
 * Whether the cafe is open at a given moment, from its own `ContactInfo`
 * opening hours.
 *
 * Environment-neutral on purpose: this is imported by the browser (nothing
 * yet) and by the local server's Neon bridge, which uses it to skip polling
 * while the cafe is shut. No DOM and no `node:` imports.
 *
 * Everything is evaluated in **Europe/Oslo**, never the host's local time.
 * The local server usually runs in the cafe, but a display, a developer
 * machine, or a process launched with a different `TZ` must not disagree with
 * it about which day it is.
 */

/** Weekday keys of `ContactInfo.hours`, indexed to match `Date`'s own `0 = Sunday`. */
const WEEKDAYS: (keyof ContactInfo['hours'])[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

const OSLO_TIME_ZONE = 'Europe/Oslo'

/** Reused across calls — constructing an `Intl.DateTimeFormat` is comparatively expensive, and a poll tick runs this on a timer. */
const osloParts = new Intl.DateTimeFormat('en-US', {
  timeZone: OSLO_TIME_ZONE,
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

const SHORT_WEEKDAY_TO_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

/** A moment expressed in Oslo terms: which weekday it is there, and how far into that day. */
interface OsloMoment {
  /** `0 = Sunday`, matching `Date.prototype.getDay`. */
  dayIndex: number
  /** Minutes since midnight. */
  minutes: number
}

/**
 * Projects an instant onto Oslo's own calendar.
 *
 * @param date The instant to convert.
 * @returns The Oslo weekday and minutes-since-midnight at that instant.
 */
function toOsloMoment(date: Date): OsloMoment {
  const parts = osloParts.formatToParts(date)
  const lookup = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? ''

  // `hour12: false` still renders midnight as "24" in some ICU versions, so it
  // is normalised rather than trusted to be 0-23.
  const hour = Number(lookup('hour')) % 24
  const minute = Number(lookup('minute'))

  return {
    dayIndex: SHORT_WEEKDAY_TO_INDEX[lookup('weekday')] ?? 0,
    minutes: hour * 60 + minute,
  }
}

/**
 * Parses an `"HH:MM"` opening-hours value.
 *
 * @param value The stored time, or undefined when the day is marked closed.
 * @returns Minutes since midnight, or `null` when the value is missing or unparseable.
 */
function toMinutes(value: string | undefined): number | null {
  if (!value) return null
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (!match) return null

  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return null

  return hours * 60 + minutes
}

/**
 * Resolves one day's hours into a usable open/close pair.
 *
 * @param day The stored hours for that weekday, if any.
 * @returns The pair in minutes, or `null` when the day is closed or unusable.
 */
function openWindow(day: DayHours | undefined): { open: number; close: number } | null {
  if (!day || day.closed) return null

  const open = toMinutes(day.open)
  const close = toMinutes(day.close)
  if (open === null || close === null) return null

  return { open, close }
}

/**
 * Whether the cafe is open at `date`.
 *
 * A closing time at or before the opening time is read as running past
 * midnight (e.g. `20:00`–`02:00`), so the small hours are correctly credited
 * to the *previous* day's window rather than treated as closed.
 *
 * @param info The cafe's contact info — its weekly `hours` plus the one-off
 *   `temporarilyClosed` override, which wins over everything when set.
 * @param date The instant to test. Defaults to now.
 * @returns True when the cafe is open at that instant.
 */
export function isCafeOpenAt(info: Pick<ContactInfo, 'hours' | 'temporarilyClosed'>, date: Date = new Date()): boolean {
  if (info.temporarilyClosed) return false
  if (!info.hours) return false

  const { dayIndex, minutes } = toOsloMoment(date)

  const today = openWindow(info.hours[WEEKDAYS[dayIndex]])
  if (today) {
    // A normal same-day window, or the pre-midnight half of one that spans.
    if (today.close > today.open ? minutes >= today.open && minutes < today.close : minutes >= today.open) return true
  }

  // The post-midnight tail of yesterday's window, if it had one.
  const yesterday = openWindow(info.hours[WEEKDAYS[(dayIndex + 6) % 7]])
  if (yesterday && yesterday.close <= yesterday.open && minutes < yesterday.close) return true

  return false
}
