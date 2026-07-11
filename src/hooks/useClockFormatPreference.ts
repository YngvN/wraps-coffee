import { useLocalStorage } from './useLocalStorage'

const STORAGE_KEY = 'admin.clockFormat'

/** Whether a clock-time display (the screensaver schedule's own time pickers, the weather forecast, admin timestamps, etc.) shows a 24-hour clock or a 12-hour one with AM/PM. */
export type ClockFormat = '24h' | '12h'

/** Persists the cafe's own choice of clock format — a single, shared (synced) preference used everywhere a wall-clock time is shown, edited from Settings. Defaults to 24-hour. */
export function useClockFormatPreference() {
  return useLocalStorage<ClockFormat>(STORAGE_KEY, '24h')
}
