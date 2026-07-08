import { useLocalStorage } from './useLocalStorage'

const STORAGE_KEY = 'admin.screensaverSchedule'

/** The shared daily window (each a `"HH:MM"` 24-hour time) any screen with its own `useScreensaver` on goes black during — set (or cleared) once from the admin Screens dashboard's "Screen saver" button, `null` until then. */
export interface ScreensaverSchedule {
  start: string
  end: string
}

/** Returns the live screensaver schedule and a setter that persists edits to localStorage — the same plain browser storage as everything else here. */
export function useScreensaverSchedule() {
  return useLocalStorage<ScreensaverSchedule | null>(STORAGE_KEY, null)
}
