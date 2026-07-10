import { DEFAULT_EXTENSIONS_CONFIG, type ExtensionsConfig } from '../types/extensions'
import { useLocalStorage } from './useLocalStorage'

const STORAGE_KEY = 'admin.extensions'

/** Returns the cafe's live Extensions config (Ruter transit + Yr weather setup, edited from the admin's Extensions tab) and a setter that persists edits, synced across devices like every other admin setting. */
export function useExtensionsConfig() {
  return useLocalStorage<ExtensionsConfig>(STORAGE_KEY, DEFAULT_EXTENSIONS_CONFIG)
}
