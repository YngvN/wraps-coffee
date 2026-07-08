import { useLocalStorage } from './useLocalStorage'

const STORAGE_KEY = 'admin.screenLockPin'

/**
 * The shared 4-digit PIN used to unlock any locked screen display — set (or
 * changed) once from the admin Screens dashboard's "Create pin" button,
 * `null` until then. Plain browser storage, like every other dataset in
 * this app: a deterrent against casual tampering at the physical display,
 * not real security.
 */
export function useScreenLockPin() {
  return useLocalStorage<string | null>(STORAGE_KEY, null)
}
