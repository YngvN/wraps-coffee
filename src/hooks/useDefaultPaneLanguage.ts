import type { LanguageCode } from '../i18n'
import { useLocalStorage } from './useLocalStorage'

const STORAGE_KEY = 'admin.paneLanguage'

/**
 * Persists the cafe's own default language for kiosk pane content (menu
 * items, event descriptions, weather labels, etc.) — a single, shared
 * (synced) preference, edited from Settings, independent of whichever
 * language the browser viewing the admin dashboard or a kiosk display
 * itself happens to have selected (see `useLanguage`). Each pane can still
 * override it individually (see `ScreenSlot.language`/`resolveSlotLanguage`)
 * — this is only what a pane falls back to when it hasn't. Defaults to
 * Norwegian.
 */
export function useDefaultPaneLanguage() {
  return useLocalStorage<LanguageCode>(STORAGE_KEY, 'no')
}
