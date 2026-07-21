import textSizePresetsSeed from '../data/textSizePresets.json'
import type { TextSizePreset } from '../types/screen'
import { normalizeTextSizes, textSizesRemToPercent } from '../utils/textSizeVars'
import { useLocalStorage } from './useLocalStorage'

const STORAGE_KEY = 'admin.textSizePresets'

/** Returns the live list of saved text-size presets and a setter that persists edits to localStorage, filling in any missing `itemPrice` on presets saved before that field existed, and converting a preset's own `textSizes` from the old fixed-`rem` unit to the current `cqmin` percentage one (see `TextSizePreset.unit`) — read-time only, until the array is next actually saved (e.g. `TextSizeEditor`'s own "Save as preset" persists the whole array, tag included). */
export function useTextSizePresets() {
  const [presets, setPresets] = useLocalStorage<TextSizePreset[]>(STORAGE_KEY, textSizePresetsSeed as TextSizePreset[])
  const normalized = presets.map((preset) => ({
    ...preset,
    textSizes: normalizeTextSizes(preset.unit === 'percent' ? preset.textSizes : textSizesRemToPercent(preset.textSizes)),
    unit: 'percent' as const,
  }))
  return [normalized, setPresets] as const
}
