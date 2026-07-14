import { DEFAULT_SIDEBAR_SETTINGS, type SidebarSettings, type ToggleableSidebarItem } from '../types/sidebarSettings'
import { useLocalStorage } from './useLocalStorage'

const STORAGE_KEY = 'admin.sidebarSettings'

/** Contact info moved from its own top-level item to nest under the new `store` one (see `ToggleableSidebarItem`) — remaps any already-persisted `'contact'` entry on read, so a store that had it hidden before this change doesn't silently un-hide it. A pure read-time transform, not a rewrite — never persisted back, so it's cheap to just re-apply on every read. */
function migrateHiddenItems(hiddenItems: ToggleableSidebarItem[]): ToggleableSidebarItem[] {
  return hiddenItems.map((item) => ((item as string) === 'contact' ? 'store' : item))
}

/** Returns the store's live sidebar customization (which items are hidden, edited from the admin's Settings tab) and a setter that persists edits, synced across devices like every other admin setting. */
export function useSidebarSettings() {
  const [settings, setSettings] = useLocalStorage<SidebarSettings>(STORAGE_KEY, DEFAULT_SIDEBAR_SETTINGS)
  return [{ ...settings, hiddenItems: migrateHiddenItems(settings.hiddenItems) }, setSettings] as const
}
