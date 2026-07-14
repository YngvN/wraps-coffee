import storeSettingsSeed from '../data/storeSettings.json'
import type { StoreSettings } from '../types/storeSettings'
import { useLocalStorage } from './useLocalStorage'

const STORAGE_KEY = 'admin.storeSettings'

/** Returns the live store/company branding (name, slogan, logos, favicon) and a setter that persists edits, synced across devices like every other admin setting. */
export function useStoreSettings() {
  return useLocalStorage<StoreSettings>(STORAGE_KEY, storeSettingsSeed as StoreSettings)
}
