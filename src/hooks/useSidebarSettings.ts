import { DEFAULT_SIDEBAR_SETTINGS, type SidebarSettings } from '../types/sidebarSettings'
import { useLocalStorage } from './useLocalStorage'

const STORAGE_KEY = 'admin.sidebarSettings'

/** Returns the cafe's live sidebar customization (which items are hidden, edited from the admin's Settings tab) and a setter that persists edits, synced across devices like every other admin setting. */
export function useSidebarSettings() {
  return useLocalStorage<SidebarSettings>(STORAGE_KEY, DEFAULT_SIDEBAR_SETTINGS)
}
