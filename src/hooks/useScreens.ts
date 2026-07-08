import screensSeed from '../data/screens.json'
import type { BackgroundImage, RatioField, ScreenConfig, ScreenSlot, ScreenSlotContent, TextSizes } from '../types/screen'
import { isSlotActive } from '../utils/screenStages'
import { normalizeTextSizes } from '../utils/textSizeVars'
import { useLocalStorage } from './useLocalStorage'

const STORAGE_KEY = 'admin.screens'

const RATIO_FIELDS: RatioField[] = ['splitRatio', 'tripleBigRatio', 'tripleSmallRatio', 'quadColumnRatio', 'quadRowRatio']

/**
 * Migrates a screen's pre-stages flat ratio fields (`splitRatio`,
 * `tripleBigRatio`, `tripleSmallRatio`, `quadColumnRatio`, `quadRowRatio` —
 * each a single screen-wide number, since removed) into the current
 * per-field, per-stage `ratios` shape, each becoming a lone stage-1
 * checkpoint. Already-current screens (which have `ratios` set, however
 * sparsely) are returned untouched.
 */
function migrateRatios(screen: ScreenConfig): ScreenConfig['ratios'] {
  if (screen.ratios) return screen.ratios
  const legacy = screen as ScreenConfig & Partial<Record<RatioField, number>>
  const ratios: NonNullable<ScreenConfig['ratios']> = {}
  RATIO_FIELDS.forEach((field) => {
    const value = legacy[field]
    if (typeof value === 'number') ratios[field] = { 1: value }
  })
  return Object.keys(ratios).length > 0 ? ratios : undefined
}

/** The shape a persisted slot took before shared stages existed: one shared `isSlideshow` flag plus a flat, always-fully-populated list of rotating slides. */
interface LegacySlot {
  isSlideshow?: boolean
  contents: ScreenSlotContent[]
  backgroundColor?: string
  backgroundImage?: BackgroundImage
}

function isLegacySlot(value: unknown): value is LegacySlot {
  return value !== null && typeof value === 'object' && Array.isArray((value as LegacySlot).contents)
}

function isCurrentShapeSlot(value: unknown): value is ScreenSlot {
  return value !== null && typeof value === 'object' && 'content' in value && typeof value.content === 'object' && !Array.isArray(value.content)
}

/**
 * Normalizes one persisted slot value into the current stage-timeline
 * `ScreenSlot` shape, tolerating whatever older shape (or anything else
 * malformed) might already be sitting in a browser's localStorage, so it
 * can't crash the display or the admin form.
 *
 * - Current shape: normalizes each existing `textSizes` checkpoint, and
 *   re-seeds an empty `content` timeline with a bare stage-1 "none" entry
 *   (shouldn't normally happen, but keeps every resolver's "there's always
 *   at least one checkpoint" assumption true).
 * - Pre-stages shape (one shared `isSlideshow` flag plus a flat `contents`
 *   list): keeps only the first *configured* (non-"none") slide as a single
 *   stage-1 checkpoint — there's no faithful way to map several
 *   independently-rotating slides onto one shared stage sequence, so the
 *   rest are dropped. `legacyTextSizes` is the screen's own pre-stages
 *   `slotTextSizes[index]` (a screen-level field back then, folded into the
 *   slot itself now), threaded in by `normalizeScreen`.
 * - Even older bare-`ScreenSlotContent` shape, or anything unrecognized:
 *   treated as a single "none" slot.
 */
function normalizeSlot(value: unknown, legacyTextSizes: TextSizes | undefined): ScreenSlot {
  if (isCurrentShapeSlot(value)) {
    const content = Object.keys(value.content ?? {}).length > 0 ? value.content : { 1: { kind: 'none' as const } }
    const textSizes = value.textSizes
      ? (Object.fromEntries(Object.entries(value.textSizes).map(([key, size]) => [key, size ? normalizeTextSizes(size) : size])) as ScreenSlot['textSizes'])
      : {}
    return { content, backgroundColor: value.backgroundColor ?? {}, backgroundImage: value.backgroundImage ?? {}, textSizes }
  }
  if (isLegacySlot(value)) {
    const contents = value.contents.length > 0 ? value.contents : [{ kind: 'none' as const }]
    const firstConfiguredIndex = contents.findIndex((content) => content.kind !== 'none')
    const chosen = contents[firstConfiguredIndex === -1 ? 0 : firstConfiguredIndex]
    return {
      content: { 1: chosen },
      backgroundColor: { 1: value.backgroundColor },
      backgroundImage: { 1: value.backgroundImage },
      textSizes: { 1: legacyTextSizes ? normalizeTextSizes(legacyTextSizes) : legacyTextSizes },
    }
  }
  if (value && typeof value === 'object' && 'kind' in value) {
    return { content: { 1: value as ScreenSlotContent }, backgroundColor: { 1: undefined }, backgroundImage: { 1: undefined }, textSizes: { 1: legacyTextSizes } }
  }
  return { content: { 1: { kind: 'none' } }, backgroundColor: { 1: undefined }, backgroundImage: { 1: undefined }, textSizes: { 1: legacyTextSizes } }
}

/**
 * Normalizes a screen's `slots` tuple (padding with empty slots if it's
 * missing or short), migrates any pre-stages `slotTextSizes` (a screen-level
 * field keyed by slot index, since removed) into each slot's own `textSizes`
 * timeline, migrates any pre-stages flat ratio fields into the current
 * per-stage `ratios` shape (see `migrateRatios`), and fills in
 * `slotCount`/`useStages`/`stageCount` for screens saved before they
 * existed.
 */
function normalizeScreen(screen: ScreenConfig): ScreenConfig {
  const rawSlots = Array.isArray(screen.slots) ? screen.slots : []
  const legacySlotTextSizes = (screen as ScreenConfig & { slotTextSizes?: Record<number, TextSizes> }).slotTextSizes
  const slots = [0, 1, 2, 3].map((index) => normalizeSlot(rawSlots[index], legacySlotTextSizes?.[index])) as ScreenConfig['slots']
  const textSizes = screen.textSizes ? normalizeTextSizes(screen.textSizes) : screen.textSizes
  const slotCount =
    typeof screen.slotCount === 'number' && screen.slotCount >= 1 && screen.slotCount <= 4
      ? screen.slotCount
      : Math.min(4, Math.max(1, slots.filter(isSlotActive).length || 1))
  const useStages = typeof screen.useStages === 'boolean' ? screen.useStages : false
  const stageCount = typeof screen.stageCount === 'number' && screen.stageCount >= 1 ? screen.stageCount : 1
  const ratios = migrateRatios(screen)
  const normalized: ScreenConfig & { slotTextSizes?: unknown } & Partial<Record<RatioField, unknown>> = {
    ...screen,
    slots,
    textSizes,
    slotCount,
    useStages,
    stageCount,
    ratios,
  }
  delete normalized.slotTextSizes
  RATIO_FIELDS.forEach((field) => delete normalized[field])
  return normalized
}

/** Returns the live list of configured screens and a setter that persists edits to localStorage, overlaying `screens.json` until a real backend exists. */
export function useScreens() {
  const [screens, setScreens] = useLocalStorage<ScreenConfig[]>(STORAGE_KEY, screensSeed as ScreenConfig[])
  return [screens.map(normalizeScreen), setScreens] as const
}
