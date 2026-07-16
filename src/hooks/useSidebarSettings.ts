import { DEFAULT_SIDEBAR_SETTINGS, type SidebarSettings, type ToggleableSidebarItem } from '../types/sidebarSettings'
import { useLocalStorage } from './useLocalStorage'

const STORAGE_KEY = 'admin.sidebarSettings'

const TOGGLEABLE_SIDEBAR_ITEMS: readonly string[] = ['messages', 'products', 'events', 'orders', 'screens', 'extensions', 'images', 'messageboard'] satisfies ToggleableSidebarItem[]

/** Drops any persisted entry that isn't a current `ToggleableSidebarItem` — covers legacy values from before Store settings and Display Manager became submenus (first Store's `'contact'`, briefly remapped to `'store'`; then `'displaymanager'` itself once it moved under Screens), none of which are real sidebar items anymore. A pure read-time filter, never persisted back, so it's cheap to just re-apply on every read. */
function migrateHiddenItems(hiddenItems: ToggleableSidebarItem[]): ToggleableSidebarItem[] {
  return hiddenItems.filter((item) => TOGGLEABLE_SIDEBAR_ITEMS.includes(item))
}

/** Returns the store's live sidebar customization (which items are hidden, edited from the admin's Settings tab) and a setter that persists edits, synced across devices like every other admin setting. */
export function useSidebarSettings() {
  const [settings, setSettings] = useLocalStorage<SidebarSettings>(STORAGE_KEY, DEFAULT_SIDEBAR_SETTINGS)
  return [{ ...settings, hiddenItems: migrateHiddenItems(settings.hiddenItems) }, setSettings] as const
}
