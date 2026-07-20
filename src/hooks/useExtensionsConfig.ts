import { DEFAULT_EXTENSIONS_CONFIG, type ExtensionsConfig } from '../types/extensions'
import { useLocalStorage } from './useLocalStorage'

const STORAGE_KEY = 'admin.extensions'

/** `useLocalStorage` returns stored JSON as-is, with no merging — a config saved before a `transit`/`weather`/`entur`/`news` setting was added is missing that key outright. Fills any such gaps with `DEFAULT_EXTENSIONS_CONFIG` so every consumer can read every field without an `undefined` check, regardless of how old the stored config is. */
function withDefaults(config: ExtensionsConfig): ExtensionsConfig {
  return {
    ...config,
    entur: { ...DEFAULT_EXTENSIONS_CONFIG.entur, ...config.entur },
    transit: { ...DEFAULT_EXTENSIONS_CONFIG.transit, ...config.transit },
    weather: { ...DEFAULT_EXTENSIONS_CONFIG.weather, ...config.weather },
    news: { ...DEFAULT_EXTENSIONS_CONFIG.news, ...config.news },
  }
}

/** Returns the cafe's live Extensions config (Ruter transit + Yr weather setup, edited from the admin's Extensions tab) and a setter that persists edits, synced across devices like every other admin setting. */
export function useExtensionsConfig() {
  const [config, setConfig] = useLocalStorage<ExtensionsConfig>(STORAGE_KEY, DEFAULT_EXTENSIONS_CONFIG)
  return [withDefaults(config), setConfig] as const
}
