import { DEFAULT_INTEGRATIONS_CONFIG, type IntegrationsConfig } from '../types/integrations'
import { useLocalStorage } from './useLocalStorage'

const STORAGE_KEY = 'admin.integrations'

/** `useLocalStorage` returns stored JSON as-is, with no merging — a config saved before a `transit`/`weather`/`entur`/`news` setting was added is missing that key outright. Fills any such gaps with `DEFAULT_INTEGRATIONS_CONFIG` so every consumer can read every field without an `undefined` check, regardless of how old the stored config is. */
function withDefaults(config: IntegrationsConfig): IntegrationsConfig {
  return {
    ...config,
    entur: { ...DEFAULT_INTEGRATIONS_CONFIG.entur, ...config.entur },
    transit: { ...DEFAULT_INTEGRATIONS_CONFIG.transit, ...config.transit },
    weather: { ...DEFAULT_INTEGRATIONS_CONFIG.weather, ...config.weather },
    news: { ...DEFAULT_INTEGRATIONS_CONFIG.news, ...config.news },
  }
}

/** Returns the cafe's live Integrations config (Ruter transit + Yr weather setup, edited from the admin's Integrations tab) and a setter that persists edits, synced across devices like every other admin setting. */
export function useIntegrationsConfig() {
  const [config, setConfig] = useLocalStorage<IntegrationsConfig>(STORAGE_KEY, DEFAULT_INTEGRATIONS_CONFIG)
  return [withDefaults(config), setConfig] as const
}
