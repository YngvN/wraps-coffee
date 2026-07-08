import { useLocalStorage } from './useLocalStorage'

const STORAGE_KEY = 'admin.screensaverClockFormat'

/** Whether the screensaver schedule's own start/end time pickers show a 24-hour clock or a 12-hour one with AM/PM. */
export type ClockFormat = '24h' | '12h'

/** Persists the admin's own choice of clock format for the screensaver schedule's time pickers — defaults to 24-hour. */
export function useClockFormatPreference() {
  return useLocalStorage<ClockFormat>(STORAGE_KEY, '24h')
}
