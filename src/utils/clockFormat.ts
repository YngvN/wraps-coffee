import type { ClockFormat } from '../hooks/useClockFormatPreference'
import type { DateFormat } from '../hooks/useDateFormatPreference'
import type { LanguageCode } from '../i18n'
import { formatDate } from './dateFormat'

/** Formats `date`'s time-of-day (hour:minute) honoring the cafe's own clock-format preference (see `useClockFormatPreference`) instead of leaving it to the browser/OS locale's own default. */
export function formatClockTime(date: Date, language: LanguageCode, clockFormat: ClockFormat): string {
  return date.toLocaleTimeString(language, { hour: '2-digit', minute: '2-digit', hour12: clockFormat === '12h' })
}

/** Formats `date`'s full date and time-of-day, honoring both the date-format and clock-format preferences — used for "received"/"placed"/"posted" timestamps across the admin dashboard. The time portion keeps its seconds (unlike `formatClockTime`), and is left to `Intl` since AM/PM/locale digit conventions aren't ambiguous the way numeric date order is — only the date portion goes through `formatDate`. */
export function formatDateTime(date: Date, language: LanguageCode, clockFormat: ClockFormat, dateFormat: DateFormat): string {
  const time = date.toLocaleTimeString(language, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: clockFormat === '12h' })
  return `${formatDate(date, dateFormat)}, ${time}`
}
