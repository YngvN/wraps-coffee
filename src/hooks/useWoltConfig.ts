import { DEFAULT_WOLT_CONFIG, type WoltConfig } from '../types/delivery'
import { useLocalStorage } from './useLocalStorage'

const STORAGE_KEY = 'admin.woltConfig'

/** Returns the cafe's live Wolt integration config (enabled flag + poll-health, written by the local server's own `woltPoller.ts`) and a setter that persists edits, synced across devices like every other admin setting. Credentials themselves aren't here — see `getWoltCredentials`/`setWoltCredentials` in `src/lib/localServer.ts`. */
export function useWoltConfig() {
  return useLocalStorage<WoltConfig>(STORAGE_KEY, DEFAULT_WOLT_CONFIG)
}
