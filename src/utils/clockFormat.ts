import type { ClockFormat } from '../hooks/useClockFormatPreference'
import type { LanguageCode } from '../i18n'

/** Formats `date`'s time-of-day (hour:minute) honoring the cafe's own clock-format preference (see `useClockFormatPreference`) instead of leaving it to the browser/OS locale's own default. */
export function formatClockTime(date: Date, language: LanguageCode, clockFormat: ClockFormat): string {
  return date.toLocaleTimeString(language, { hour: '2-digit', minute: '2-digit', hour12: clockFormat === '12h' })
}

/** Formats `date`'s full date and time-of-day, honoring the clock-format preference for the time portion — used for "received"/"placed"/"posted" timestamps across the admin dashboard. */
export function formatDateTime(date: Date, language: LanguageCode, clockFormat: ClockFormat): string {
  return date.toLocaleString(language, { hour12: clockFormat === '12h' })
}
