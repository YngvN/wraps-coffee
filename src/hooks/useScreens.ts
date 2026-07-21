import { useMemo } from 'react'
import screensSeed from '../data/screens.json'
import type { BackgroundImage, LayoutNode, PaneId, ScreenConfig, ScreenSlot, ScreenSlotContent, SplitDirection, StageTimeline, TextSizes } from '../types/screen'
import { clampRatio } from '../utils/screenLayout'
import { hasOwnTextSizeFields } from '../utils/screenSlots'
import { isSlotActive, resolveStageValue } from '../utils/screenStages'
import { normalizeTextSizes, remToPercent, textSizesRemToPercent } from '../utils/textSizeVars'
import { useLocalStorage } from './useLocalStorage'

const STORAGE_KEY = 'admin.screens'

/** The 5 named divider fields the pre-tree arrangement model used — kept as a local type (not exported from `types/screen.ts` anymore) purely so this file's own migration can still read old persisted data shaped like it. */
type LegacyRatioField = 'splitRatio' | 'tripleBigRatio' | 'tripleSmallRatio' | 'quadColumnRatio' | 'quadRowRatio'

/** The pre-tree-rework shape of a screen's arrangement fields, as they might still be sitting in a browser's storage or the local server's own data file. */
interface LegacyArrangement {
  slotCount: number
  slots: unknown[]
  splitDirection?: SplitDirection
  splitBigPosition?: 'first' | 'second'
  ratios?: Partial<Record<LegacyRatioField, StageTimeline<number>>>
}

/** The shape a content checkpoint took under the removed `'category'` kind — kept as its own local type (rather than `Extract<ScreenSlotContent, ...>`) so `migrateCategoryContent` keeps working once `'category'` is gone from `ScreenSlotContent` itself, since old persisted data can still literally contain one of these regardless of what the current type allows. */
interface LegacyCategoryContent {
  kind: 'category'
  category: string
  textSizes?: TextSizes
  backgroundImage?: BackgroundImage
}

/**
 * Rewrites a `'category'` content checkpoint (kind removed — `'catalogue'`
 * narrowed to one category via `categories: [category]` does everything it
 * did, and more, so there's nothing behaviorally lost) into its `'catalogue'`
 * equivalent. Every other content checkpoint passes through unchanged.
 * Read-time only, like every other migration in this file — never writes
 * back to storage.
 */
function migrateCategoryContent(content: ScreenSlotContent): ScreenSlotContent {
  if (!content || (content as { kind?: string }).kind !== 'category') return content
  const legacy = content as unknown as LegacyCategoryContent
  return { kind: 'catalogue', categories: [legacy.category], textSizes: legacy.textSizes, backgroundImage: legacy.backgroundImage }
}

/**
 * Rewrites the renamed `'menu'` kind (the products rework's catalogue/
 * category model replaced the old fixed 7-category union — see
 * `src/types/category.ts` — so the slide kind itself was renamed to
 * `'catalogue'` to match) into its `'catalogue'` equivalent. `categories`
 * (already just id strings, unaffected by the rename — see the products
 * rework's migration note in `src/data/catalogues.json`) and `catalogueId`
 * (left unset, falling back to the first/seeded catalogue) pass through
 * unchanged. Every other content checkpoint passes through unchanged too.
 */
function migrateMenuKindRename(content: ScreenSlotContent): ScreenSlotContent {
  if (!content || (content as { kind?: string }).kind !== 'menu') return content
  const legacy = content as unknown as { categories?: string[]; textSizes?: TextSizes; backgroundImage?: BackgroundImage }
  return { kind: 'catalogue', categories: legacy.categories, textSizes: legacy.textSizes, backgroundImage: legacy.backgroundImage }
}

/** The shape an `'announcement'` content checkpoint's `title`/`description` took before "Custom message" was simplified from a bilingual `{en, no}` pair to a single plain-text field. */
interface LegacyBilingualText {
  en?: string
  no?: string
}

/**
 * Rewrites an `'announcement'` content checkpoint whose `title`/`description`
 * are still the old bilingual `{en, no}` shape into a plain string —
 * prefers Norwegian (matching `useDefaultPaneLanguage`'s own default),
 * falling back to English, then to an empty string. A checkpoint already in
 * the current (plain-string) shape passes through unchanged, as does every
 * other content kind. Read-time only, like every other migration in this
 * file — never writes back to storage.
 */
function migrateAnnouncementContent(content: ScreenSlotContent): ScreenSlotContent {
  if (!content || (content as { kind?: string }).kind !== 'announcement') return content
  const raw = content as unknown as { title: unknown; description: unknown }
  if (typeof raw.title === 'string' && typeof raw.description === 'string') return content
  const asPlainText = (value: unknown): string => {
    if (typeof value === 'string') return value
    const legacy = value as LegacyBilingualText | undefined
    return legacy?.no || legacy?.en || ''
  }
  return { ...content, title: asPlainText(raw.title), description: asPlainText(raw.description) } as ScreenSlotContent
}

/**
 * Rewrites the removed `'events'` kind (a single upcoming-events calendar
 * list, no further configuration) into its `'event'`/`displayMode: 'calendar'`
 * equivalent — same rendered behavior, just consolidated under the newer
 * `'event'` kind's own `displayMode` field alongside `'image'`/`'details'`/
 * `'month'`. Every other content checkpoint passes through unchanged.
 */
function migrateEventsContent(content: ScreenSlotContent): ScreenSlotContent {
  if (!content || (content as { kind?: string }).kind !== 'events') return content
  const legacy = content as unknown as { textSizes?: TextSizes; backgroundImage?: BackgroundImage }
  return { kind: 'event', displayMode: 'calendar', textSizes: legacy.textSizes, backgroundImage: legacy.backgroundImage }
}

/** Runs every content-checkpoint migration in this file, in sequence — the single place `normalizeSlot` threads a raw checkpoint through all of them. */
function migrateContent(content: ScreenSlotContent): ScreenSlotContent {
  return migrateEventsContent(migrateAnnouncementContent(migrateMenuKindRename(migrateCategoryContent(content))))
}

/** Converts a content checkpoint's own `textSizes` (or, for `'time'`, its `fontSize`) from the old fixed-`rem` unit to the current `cqmin` percentage one — a no-op unless `convertToPercent` (see `normalizeScreen`'s own `usesPercentTextSizes` gate). */
function migrateContentSizeUnit(content: ScreenSlotContent, convertToPercent: boolean): ScreenSlotContent {
  if (!convertToPercent) return content
  if (hasOwnTextSizeFields(content) && content.textSizes) return { ...content, textSizes: textSizesRemToPercent(content.textSizes) } as ScreenSlotContent
  if (content.kind === 'time' && typeof content.fontSize === 'number') return { ...content, fontSize: remToPercent(content.fontSize) }
  return content
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
function normalizeSlot(value: unknown, legacyTextSizes: TextSizes | undefined, convertToPercent: boolean): ScreenSlot {
  const migrateAndConvert = (checkpoint: ScreenSlotContent) => migrateContentSizeUnit(migrateContent(checkpoint), convertToPercent)
  const convertedLegacyTextSizes = legacyTextSizes && convertToPercent ? textSizesRemToPercent(legacyTextSizes) : legacyTextSizes

  if (isCurrentShapeSlot(value)) {
    const rawContent = Object.keys(value.content ?? {}).length > 0 ? value.content : { 1: { kind: 'none' as const } }
    const content = Object.fromEntries(Object.entries(rawContent).map(([stageKey, checkpoint]) => [stageKey, migrateAndConvert(checkpoint)])) as ScreenSlot['content']
    const textSizes = value.textSizes
      ? (Object.fromEntries(
          Object.entries(value.textSizes).map(([key, size]) => [key, size ? normalizeTextSizes(convertToPercent ? textSizesRemToPercent(size) : size) : size]),
        ) as ScreenSlot['textSizes'])
      : {}
    return {
      content,
      backgroundColor: value.backgroundColor ?? {},
      backgroundImage: value.backgroundImage ?? {},
      textSizes,
      language: value.language ?? {},
      locked: value.locked ?? {},
      overflowMode: value.overflowMode ?? {},
    }
  }
  if (isLegacySlot(value)) {
    const contents = value.contents.length > 0 ? value.contents : [{ kind: 'none' as const }]
    const firstConfiguredIndex = contents.findIndex((content) => content.kind !== 'none')
    const chosen = contents[firstConfiguredIndex === -1 ? 0 : firstConfiguredIndex]
    return {
      content: { 1: migrateAndConvert(chosen) },
      backgroundColor: { 1: value.backgroundColor },
      backgroundImage: { 1: value.backgroundImage },
      textSizes: { 1: convertedLegacyTextSizes ? normalizeTextSizes(convertedLegacyTextSizes) : convertedLegacyTextSizes },
      language: {},
      locked: {},
    }
  }
  if (value && typeof value === 'object' && 'kind' in value) {
    return {
      content: { 1: migrateAndConvert(value as ScreenSlotContent) },
      backgroundColor: { 1: undefined },
      backgroundImage: { 1: undefined },
      textSizes: { 1: convertedLegacyTextSizes },
      language: {},
      locked: {},
    }
  }
  return { content: { 1: { kind: 'none' } }, backgroundColor: { 1: undefined }, backgroundImage: { 1: undefined }, textSizes: { 1: convertedLegacyTextSizes }, language: {}, locked: {} }
}

/** A migrated legacy pane's own deterministic, position-derived id — stable across repeated migrations of the same underlying legacy data (unlike a fresh random id), so a previously-migrated `editingFocus.tab` keeps matching on every re-read, and so this doesn't cause needless remounts. Once a screen is ever saved back with a real `layout`/`paneSlots`, this id scheme is never exercised again for it. */
function legacyPaneId(index: number): PaneId {
  return `legacy-${index}`
}

/** Which of the 5 legacy ratio fields are actually relevant to a given legacy `slotCount` — mirrors exactly which fields `screenDividers`/`splitGridTemplate` used to read for that count. */
function legacyRatioFieldsForSlotCount(slotCount: number): LegacyRatioField[] {
  if (slotCount === 2) return ['splitRatio']
  if (slotCount === 3) return ['tripleBigRatio', 'tripleSmallRatio']
  if (slotCount === 4) return ['quadColumnRatio', 'quadRowRatio']
  return []
}

/**
 * Builds the tree shape a legacy `slotCount`/`splitDirection`/
 * `splitBigPosition` arrangement is equivalent to, with every ratio
 * resolved at one specific `stage` — see `migrateLayout` for how this is
 * called once per stage that had its own distinct ratio checkpoint, so a
 * legacy screen's own per-stage divider positions (ratios were already
 * per-stage before this rework, even though `slotCount` itself never was)
 * carry over faithfully. Note the legacy "row"/"column" `splitDirection`
 * naming, for the 3-slot case specifically, describes the *grid's* row/column
 * count (2 grid rows for `'row'`, big on top) rather than literally "the
 * outer big/small split's own direction" — `'row'` means the outer
 * big/small split is stacked (this file's `'column'`) with the small pair
 * splitting side by side (this file's `'row'`), and vice versa for
 * `'column'` — a quirk of the pre-rework naming, reproduced exactly here so
 * the migrated tree renders identically to how it looked before.
 */
function buildLegacyTreeForStage(slotCount: number, splitDirection: SplitDirection | undefined, splitBigPosition: 'first' | 'second' | undefined, ratios: LegacyArrangement['ratios'], stage: number): LayoutNode {
  const direction = splitDirection ?? 'row'
  const bigPosition = splitBigPosition ?? 'first'
  const at = (field: LegacyRatioField): number => clampRatio(resolveStageValue(ratios?.[field], stage) ?? 50)
  const leaf = (index: number): LayoutNode => ({ type: 'leaf', id: legacyPaneId(index) })

  if (slotCount === 2) return { type: 'split', direction, ratio: at('splitRatio'), first: leaf(0), second: leaf(1) }

  if (slotCount === 3) {
    const outerDirection: SplitDirection = direction === 'row' ? 'column' : 'row'
    const smallPairDirection: SplitDirection = direction === 'row' ? 'row' : 'column'
    const smallPair: LayoutNode = { type: 'split', direction: smallPairDirection, ratio: at('tripleSmallRatio'), first: leaf(1), second: leaf(2) }
    const big = leaf(0)
    return bigPosition === 'first'
      ? { type: 'split', direction: outerDirection, ratio: at('tripleBigRatio'), first: big, second: smallPair }
      : { type: 'split', direction: outerDirection, ratio: 100 - at('tripleBigRatio'), first: smallPair, second: big }
  }

  if (slotCount === 4) {
    const column = at('quadColumnRatio')
    const topRow: LayoutNode = { type: 'split', direction: 'row', ratio: column, first: leaf(0), second: leaf(1) }
    const bottomRow: LayoutNode = { type: 'split', direction: 'row', ratio: column, first: leaf(2), second: leaf(3) }
    return { type: 'split', direction: 'column', ratio: at('quadRowRatio'), first: topRow, second: bottomRow }
  }

  return leaf(0)
}

/**
 * Converts a screen's pre-tree-rework arrangement (`slotCount`,
 * `slots`, `splitDirection`, `splitBigPosition`, `ratios`) into the
 * equivalent `layout`/`paneSlots`. The legacy arrangement's own *shape*
 * (`slotCount`/`splitDirection`/`splitBigPosition`) was never per-stage —
 * only its `ratios` were — so this produces one tree checkpoint per stage
 * that actually had its own distinct ratio value (falling back to a single
 * stage-1 checkpoint when the arrangement had no adjustable dividers at
 * all, or none were ever moved off their 50/50 default), each checkpoint
 * the same shape with that stage's own resolved divider positions baked in
 * — a faithful reproduction of "this screen always had the same shape, but
 * its dividers could already vary by stage."
 */
function migrateLegacyArrangement(legacy: LegacyArrangement, normalizedSlots: ScreenSlot[]): { layout: StageTimeline<LayoutNode>; paneSlots: Record<PaneId, ScreenSlot> } {
  const slotCount = Math.min(4, Math.max(1, legacy.slotCount || 1))

  const paneSlots: Record<PaneId, ScreenSlot> = {}
  for (let index = 0; index < slotCount; index++) paneSlots[legacyPaneId(index)] = normalizedSlots[index]

  const relevantFields = legacyRatioFieldsForSlotCount(slotCount)
  const stageKeys = new Set<number>([1])
  relevantFields.forEach((field) => Object.keys(legacy.ratios?.[field] ?? {}).forEach((key) => stageKeys.add(Number(key))))

  const layout: StageTimeline<LayoutNode> = {}
  for (const stage of stageKeys) layout[stage] = buildLegacyTreeForStage(slotCount, legacy.splitDirection, legacy.splitBigPosition, legacy.ratios, stage)

  return { layout, paneSlots }
}

/** A legacy `editingFocus.tab` (a plain positional index) mapped to the corresponding migrated pane's own deterministic id — `'global'` or an already-string id (from a screen already saved in the current format) passes through unchanged. */
function migrateEditingFocusTab(tab: 'global' | number | PaneId): 'global' | PaneId {
  return typeof tab === 'number' ? legacyPaneId(tab) : tab
}

/**
 * Normalizes a screen into the current `layout`/`paneSlots` shape,
 * tolerating whatever older arrangement fields (or anything else
 * malformed) might already be sitting in storage. A screen that already
 * has its own `layout` is left as-is structurally — only its `paneSlots`
 * entries are still run through the per-slot content/text-size migrations
 * above, same as every other slot everywhere else, since those can still
 * lag behind a `ScreenSlotContent` shape change regardless of whether the
 * *arrangement* itself is old or new. A screen with neither `layout` nor
 * any legacy arrangement fields at all (shouldn't normally happen, but
 * keeps this defensive) falls back to a single empty pane.
 */
function normalizeScreen(screen: ScreenConfig & Partial<LegacyArrangement> & { slotTextSizes?: Record<number, TextSizes> }): ScreenConfig {
  // Whether this screen's own `textSizes`/`fontSize` values still need
  // converting from the old fixed-`rem` unit to the current `cqmin`
  // percentage one — see `ScreenConfig.usesPercentTextSizes`'s own doc
  // comment for why this can't be detected structurally (the value shape is
  // identical either way, just a plain number) and needs this explicit flag.
  const convertToPercent = !screen.usesPercentTextSizes
  const textSizes = screen.textSizes ? normalizeTextSizes(convertToPercent ? textSizesRemToPercent(screen.textSizes) : screen.textSizes) : screen.textSizes
  const useStages = typeof screen.useStages === 'boolean' ? screen.useStages : false
  const stageCount = typeof screen.stageCount === 'number' && screen.stageCount >= 1 ? screen.stageCount : 1

  let layout: StageTimeline<LayoutNode>
  let paneSlots: Record<PaneId, ScreenSlot>

  if (screen.layout && screen.paneSlots) {
    layout = screen.layout
    paneSlots = Object.fromEntries(Object.entries(screen.paneSlots).map(([id, slot]) => [id, normalizeSlot(slot, undefined, convertToPercent)]))
  } else if (Array.isArray(screen.slots)) {
    const normalizedSlots = [0, 1, 2, 3].map((index) => normalizeSlot(screen.slots![index], screen.slotTextSizes?.[index], convertToPercent))
    const fallbackSlotCount = normalizedSlots.filter(isSlotActive).length || 1
    const migrated = migrateLegacyArrangement(
      { slotCount: screen.slotCount ?? fallbackSlotCount, slots: screen.slots, splitDirection: screen.splitDirection, splitBigPosition: screen.splitBigPosition, ratios: screen.ratios },
      normalizedSlots,
    )
    layout = migrated.layout
    paneSlots = migrated.paneSlots
  } else {
    const id = legacyPaneId(0)
    layout = { 1: { type: 'leaf', id } }
    paneSlots = { [id]: normalizeSlot(undefined, undefined, convertToPercent) }
  }

  const editingFocus = screen.editingFocus ? { ...screen.editingFocus, tab: migrateEditingFocusTab(screen.editingFocus.tab) } : screen.editingFocus

  const normalized: ScreenConfig & Partial<LegacyArrangement> & { slotTextSizes?: unknown } = {
    ...screen,
    layout,
    paneSlots,
    textSizes,
    useStages,
    stageCount,
    editingFocus,
    usesPercentTextSizes: true,
  }
  delete normalized.slots
  delete normalized.slotCount
  delete normalized.splitDirection
  delete normalized.splitBigPosition
  delete normalized.ratios
  delete normalized.slotTextSizes
  return normalized
}

/**
 * Returns the live list of configured screens and a setter that persists
 * edits to localStorage, overlaying `screens.json` until a real backend
 * exists. The setter also accepts an updater function (`(current) => next`,
 * matching React's own `setState`) — `current` is normalized the same way
 * the returned list is, since `useLocalStorage`'s own functional-update
 * support reads a fresh but *raw* value straight from storage, which
 * callers here (e.g. `ScreenForm`'s unmount cleanup) shouldn't have to
 * re-normalize themselves.
 *
 * The normalize pass itself is memoized on `screens`' own reference —
 * `useLocalStorage` only produces a new one when something *actually*
 * changed (a real write, a cross-tab `storage` event, or a server-pushed
 * sync update), never just because this hook's own caller re-rendered for
 * an unrelated reason — so this avoids re-running the full migration/
 * normalization walk (over every screen, every stage, every pane) on every
 * render of every one of this hook's several callers (`ScreensView`,
 * `ScreenForm`, `ScreenDisplay`, `SlideFields`).
 */
export function useScreens() {
  const [screens, setScreens] = useLocalStorage<ScreenConfig[]>(STORAGE_KEY, screensSeed as ScreenConfig[])
  const normalizedScreens = useMemo(() => screens.map(normalizeScreen), [screens])

  const setNormalizedScreens = (update: ScreenConfig[] | ((current: ScreenConfig[]) => ScreenConfig[])) => {
    if (typeof update === 'function') setScreens((current) => update(current.map(normalizeScreen)))
    else setScreens(update)
  }

  return [normalizedScreens, setNormalizedScreens] as const
}
