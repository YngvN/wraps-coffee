import textSizePresetsSeed from '../data/textSizePresets.json'
import type { TextSizePreset } from '../types/screen'
import { useLocalStorage } from './useLocalStorage'

const STORAGE_KEY = 'admin.textSizePresets'

/** Returns the live list of saved text-size presets and a setter that persists edits to localStorage. */
export function useTextSizePresets() {
  return useLocalStorage<TextSizePreset[]>(STORAGE_KEY, textSizePresetsSeed as TextSizePreset[])
}
