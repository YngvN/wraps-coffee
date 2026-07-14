import type { DateFormat } from '../hooks/useDateFormatPreference'

/**
 * Formats `date` as plain digits, honoring the store's own `DateFormat`
 * preference — day-month-year with dots (`31.12.2026`) or month-day-year
 * with slashes (`12/31/2026`) — built by hand rather than via
 * `Intl.DateTimeFormat`'s own locale-driven numeric date formatting, which
 * is ambiguous about which order day/month come in (and doesn't expose a
 * "day-month-year regardless of locale" option). `showYear` omits the year
 * entirely rather than showing it in some third position.
 */
export function formatDate(date: Date, dateFormat: DateFormat, showYear = true): string {
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = date.getFullYear()

  if (dateFormat === 'mdy') return showYear ? `${month}/${day}/${year}` : `${month}/${day}`
  return showYear ? `${day}.${month}.${year}` : `${day}.${month}`
}
