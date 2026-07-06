import screensSeed from '../data/screens.json'
import type { ScreenConfig } from '../types/screen'
import { useLocalStorage } from './useLocalStorage'

const STORAGE_KEY = 'admin.screens'

/** Returns the live list of configured screens and a setter that persists edits to localStorage, overlaying `screens.json` until a real backend exists. */
export function useScreens() {
  return useLocalStorage<ScreenConfig[]>(STORAGE_KEY, screensSeed as ScreenConfig[])
}
