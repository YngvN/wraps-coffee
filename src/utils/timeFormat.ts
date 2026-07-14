import type { ClockFormat } from '../hooks/useClockFormatPreference'
import type { LanguageCode } from '../i18n'
import type { TimeDateStyle, TimeUnit } from '../types/screen'

/** One shown unit per digit group, plus the locale's own AM/PM marker if relevant — see `getTimeSegments`. */
export interface TimeSegments {
  /** One formatted value per shown unit, always in canonical hour/minute/second order regardless of the requested `units` array's own order, so a pane configured with e.g. `['seconds', 'hours']` still reads left-to-right. Rendered by `TimeSlide` with a (blinking) colon between each pair, so this is kept as separate segments rather than a single joined string. */
  segments: string[]
  /** The locale's own AM/PM marker, present only when hours are shown and `clockFormat` is `'12h'`; empty string otherwise. */
  dayPeriod: string
}

/** Formats `date`'s clock digits, showing only `units`. Honors `clockFormat` for 12h/24h. */
export function getTimeSegments(date: Date, language: LanguageCode, clockFormat: ClockFormat, units: TimeUnit[]): TimeSegments {
  const parts = new Intl.DateTimeFormat(language, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: clockFormat === '12h' }).formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? ''

  const segments: string[] = []
  if (units.includes('hours')) segments.push(get('hour'))
  if (units.includes('minutes')) segments.push(get('minute'))
  if (units.includes('seconds')) segments.push(get('second'))

  const dayPeriod = units.includes('hours') && clockFormat === '12h' ? get('dayPeriod') : ''
  return { segments, dayPeriod }
}

/**
 * Maps a `'date'`-mode `TimeDateStyle` (plus its independent `showYear`
 * toggle) to the granular `Intl.DateTimeFormatOptions` it's actually built
 * from — `Intl`'s own `dateStyle` shorthand always includes the year with
 * no way to suppress it, so each style's weekday/month granularity is
 * reproduced by hand here instead, with `year` merged in only when asked
 * for. Deliberately excludes `'short'` — spelling the month out by name
 * (`'full'`/`'long'`/`'medium'`) has no day/month ordering to get wrong, but
 * `'short'`'s all-numeric day/month has no such anchor, so `TimeSlide`
 * formats that one itself via `formatDate` and the store's own
 * `DateFormat` preference instead of an ambiguous locale-driven guess.
 */
export function getDateFormatOptions(dateStyle: Exclude<TimeDateStyle, 'short'>, showYear: boolean): Intl.DateTimeFormatOptions {
  const base: Intl.DateTimeFormatOptions =
    dateStyle === 'full' ? { weekday: 'long', month: 'long', day: 'numeric' } : dateStyle === 'long' ? { month: 'long', day: 'numeric' } : { month: 'short', day: 'numeric' }
  return showYear ? { ...base, year: 'numeric' } : base
}

/** `date`'s ISO 8601 week number (1-53, Monday-start weeks, the first week of a year being the one containing that year's first Thursday). */
export function getIsoWeekNumber(date: Date): number {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNumber = target.getUTCDay() || 7
  target.setUTCDate(target.getUTCDate() + 4 - dayNumber)
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1))
  return Math.ceil(((target.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)
}
