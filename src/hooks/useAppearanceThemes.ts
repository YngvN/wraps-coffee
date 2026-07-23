import appearanceThemesSeed from '../data/appearanceThemes.json'
import type { AppearanceSettings, AppearanceTheme } from '../types/appearanceTheme'
import { useLocalStorage } from './useLocalStorage'

const STORAGE_KEY = 'admin.appearanceThemes'

/** Reads/writes every screen-display appearance theme, plus which one is active. See `useActiveAppearanceTheme` for just the active one. */
export function useAppearanceThemes() {
  return useLocalStorage<AppearanceSettings>(STORAGE_KEY, appearanceThemesSeed as AppearanceSettings)
}

/** The single theme currently applied to screen displays — falls back to the first theme if `activeThemeId` doesn't match any (e.g. it was just deleted elsewhere). */
export function useActiveAppearanceTheme(): AppearanceTheme {
  const [{ themes, activeThemeId }] = useAppearanceThemes()
  return themes.find((theme) => theme.id === activeThemeId) ?? themes[0]
}
