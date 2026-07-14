import { useLocalStorage } from './useLocalStorage'

const STORAGE_KEY = 'admin.dateFormat'

/**
 * How a plain numeric calendar date (no weekday or month name spelled out)
 * is ordered and separated, everywhere one is shown: admin timestamps,
 * uploaded-image dates, message board post dates, and a "time" pane's own
 * shorthand date display. `'dmy'` is day-month-year with dots (`31.12.2026`,
 * Norwegian/European convention); `'mdy'` is month-day-year with slashes
 * (`12/31/2026`, US convention).
 */
export type DateFormat = 'dmy' | 'mdy'

/** Persists the store's own choice of date format — a single, shared (synced) preference used everywhere a plain calendar date is shown, edited from Settings, independent of the interface language (same posture as `useClockFormatPreference`). Defaults to day-month-year. */
export function useDateFormatPreference() {
  return useLocalStorage<DateFormat>(STORAGE_KEY, 'dmy')
}
