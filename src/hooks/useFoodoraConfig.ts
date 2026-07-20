import { DEFAULT_FOODORA_CONFIG, type FoodoraConfig } from '../types/delivery'
import { useLocalStorage } from './useLocalStorage'

const STORAGE_KEY = 'admin.foodoraConfig'

/** Returns the cafe's live Foodora integration config (enabled flag + poll-health, written by the local server's own `foodoraPoller.ts`) and a setter that persists edits, synced across devices like every other admin setting. Credentials themselves aren't here — see `getFoodoraCredentials`/`setFoodoraCredentials` in `src/lib/localServer.ts`. */
export function useFoodoraConfig() {
  return useLocalStorage<FoodoraConfig>(STORAGE_KEY, DEFAULT_FOODORA_CONFIG)
}
