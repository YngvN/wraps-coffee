import textSizePresetsSeed from '../data/textSizePresets.json'
import type { TextSizePreset } from '../types/screen'
import { normalizeTextSizes } from '../utils/textSizeVars'
import { useLocalStorage } from './useLocalStorage'

const STORAGE_KEY = 'admin.textSizePresets'

/** Returns the live list of saved text-size presets and a setter that persists edits to localStorage, filling in any missing `itemPrice` on presets saved before that field existed. */
export function useTextSizePresets() {
  const [presets, setPresets] = useLocalStorage<TextSizePreset[]>(STORAGE_KEY, textSizePresetsSeed as TextSizePreset[])
  const normalized = presets.map((preset) => ({ ...preset, textSizes: normalizeTextSizes(preset.textSizes) }))
  return [normalized, setPresets] as const
}
