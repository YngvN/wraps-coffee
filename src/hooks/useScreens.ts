import screensSeed from '../data/screens.json'
import type { ScreenConfig, ScreenSlot, ScreenSlotContent, TextSizes } from '../types/screen'
import { normalizeTextSizes } from '../utils/textSizeVars'
import { useLocalStorage } from './useLocalStorage'

const STORAGE_KEY = 'admin.screens'

/**
 * Normalizes one persisted slot value into the current `ScreenSlot` shape.
 * Slots used to be a bare `ScreenSlotContent` before a slot could hold
 * multiple rotating slides — this tolerates that older shape (and anything
 * else malformed) already sitting in a browser's localStorage, so it can't
 * crash the display or the admin form.
 */
function normalizeSlot(value: unknown): ScreenSlot {
  if (value && typeof value === 'object' && Array.isArray((value as ScreenSlot).contents)) {
    const slot = value as ScreenSlot
    return { isSlideshow: Boolean(slot.isSlideshow), contents: slot.contents.length > 0 ? slot.contents : [{ kind: 'none' }] }
  }
  if (value && typeof value === 'object' && 'kind' in value) {
    return { isSlideshow: false, contents: [value as ScreenSlotContent] }
  }
  return { isSlideshow: false, contents: [{ kind: 'none' }] }
}

/**
 * Normalizes a screen's `slots` tuple (padding with empty slots if it's
 * missing or short) and fills in any missing `itemPrice` on its text sizes —
 * older persisted screens predate that field, so this keeps them from ever
 * handing out a `TextSizes` with an `undefined` `itemPrice`.
 */
function normalizeScreen(screen: ScreenConfig): ScreenConfig {
  const rawSlots = Array.isArray(screen.slots) ? screen.slots : []
  const slots = [0, 1, 2, 3].map((index) => normalizeSlot(rawSlots[index])) as ScreenConfig['slots']
  const textSizes = screen.textSizes ? normalizeTextSizes(screen.textSizes) : screen.textSizes
  const slotTextSizes = screen.slotTextSizes
    ? (Object.fromEntries(Object.entries(screen.slotTextSizes).map(([key, value]) => [key, normalizeTextSizes(value)])) as Record<number, TextSizes>)
    : screen.slotTextSizes
  return { ...screen, slots, textSizes, slotTextSizes }
}

/** Returns the live list of configured screens and a setter that persists edits to localStorage, overlaying `screens.json` until a real backend exists. */
export function useScreens() {
  const [screens, setScreens] = useLocalStorage<ScreenConfig[]>(STORAGE_KEY, screensSeed as ScreenConfig[])
  return [screens.map(normalizeScreen), setScreens] as const
}
