import type { LanguageCode } from '../i18n'
import { DEFAULT_TEXT_SIZES, type BackgroundImage, type LayoutNode, type PaneId, type ScreenConfig, type ScreenSlot, type ScreenSlotContent, type StageTimeline, type TextSizes } from '../types/screen'
import { listLeaves } from './layoutTree'
import { isResizeToFitContent } from './screenSlots'

/**
 * Which stage number actually supplies a timeline's effective value at
 * `stage` — the closest one at or below it, or (wrapping around, since the
 * whole sequence loops back to stage 1 after the last one) the highest
 * stage number with an entry at all. `undefined` only for a genuinely empty
 * timeline, which shouldn't normally occur (every slot is seeded with a
 * stage-1 entry per field on creation/migration). Works off `Object.keys`
 * (presence) rather than value truthiness, so a present-but-`undefined`
 * entry (an explicit "nothing at this stage") still counts as a checkpoint.
 */
export function resolvedCheckpointStage<T>(timeline: StageTimeline<T> | undefined, stage: number): number | undefined {
  if (!timeline) return undefined
  const keys = Object.keys(timeline).map(Number)
  if (keys.length === 0) return undefined
  const atOrBefore = keys.filter((key) => key <= stage)
  return atOrBefore.length > 0 ? Math.max(...atOrBefore) : Math.max(...keys)
}

/** A timeline's effective value at `stage` — see `resolvedCheckpointStage` for exactly which checkpoint supplies it. */
export function resolveStageValue<T>(timeline: StageTimeline<T> | undefined, stage: number): T | undefined {
  const stageKey = resolvedCheckpointStage(timeline, stage)
  return stageKey === undefined ? undefined : timeline![stageKey]
}

export function resolveSlotContent(slot: ScreenSlot, stage: number): ScreenSlotContent {
  return resolveStageValue(slot.content, stage) ?? { kind: 'none' }
}

export function resolveSlotBackgroundColor(slot: ScreenSlot, stage: number): string | undefined {
  return resolveStageValue(slot.backgroundColor, stage)
}

export function resolveSlotBackgroundImage(slot: ScreenSlot, stage: number): BackgroundImage | undefined {
  return resolveStageValue(slot.backgroundImage, stage)
}

export function resolveSlotTextSizes(slot: ScreenSlot, stage: number): TextSizes | undefined {
  return resolveStageValue(slot.textSizes, stage)
}

/** The persisted (non-live-draft) effective text sizes for a pane at a given stage: its own resolved override, else the screen's own, else the global default. Used both as the shared fallback for that stage's content and as what editing "the pane" (rather than one specific stage) reads/writes in `ScreenDisplay`, and by `ScreenCard`'s own read-only list preview. */
export function getPersistedSlotTextSizes(screen: ScreenConfig, leafId: PaneId, stage: number): TextSizes {
  const slot = screen.paneSlots[leafId]
  return (slot && resolveSlotTextSizes(slot, stage)) ?? screen.textSizes ?? DEFAULT_TEXT_SIZES
}

/** This slot's own language override at `stage` — `undefined` means "use the cafe's own Standard pane language" (see `useDefaultPaneLanguage`), whether because nothing was ever set or because it was explicitly reset back to it. */
export function resolveSlotLanguage(slot: ScreenSlot, stage: number): LanguageCode | undefined {
  return resolveStageValue(slot.language, stage)
}

/** Whether this pane is locked at `stage` — `false` (unlocked) whenever nothing was ever set, exactly like every other stage-checkpointed field's own carry-forward behavior (see `resolveStageValue`). */
export function resolveSlotLocked(slot: ScreenSlot, stage: number): boolean {
  return resolveStageValue(slot.locked, stage) ?? false
}

/** Which "Group" this pane belongs to at `stage`, if any — see `ScreenSlot.groupId`'s own doc comment for why this is checkpointed per-stage rather than a single screen-wide relationship. */
export function resolveSlotGroupId(slot: ScreenSlot, stage: number): string | undefined {
  return resolveStageValue(slot.groupId, stage)
}

/** Whether any leaf inside `node`'s own subtree is locked at `stage` — used to decide whether a `split` node's own divider (and any `PaneCornerHandle` sharing its path, see `LayoutTree.tsx`) should be draggable at all: if either side would resize a locked pane, neither should be. */
export function subtreeHasLockedLeaf(node: LayoutNode, paneSlots: Record<PaneId, ScreenSlot>, stage: number): boolean {
  return listLeaves(node).some((leaf) => {
    const slot = paneSlots[leaf.id]
    return slot ? resolveSlotLocked(slot, stage) : false
  })
}

/**
 * The single `groupId` shared by *every* leaf inside `node`'s own subtree at
 * `stage`, or `undefined` if they don't all agree — including any leaf with
 * no group at all, or one leaf's own group not matching another's. Used by
 * `LayoutTree.tsx` to decide whether a `split` node's own divider should
 * render as part of that shared group's own matching background instead of
 * the screen's ordinary border color: only when *both* of a split's own
 * sides resolve to the same defined group here does that specific divider
 * qualify — a divider where only one side is fully in-group still renders
 * normally, which is what keeps a group's own *outer* edge (against a
 * non-grouped pane, or the screen edge) visible.
 */
export function subtreeGroupId(node: LayoutNode, paneSlots: Record<PaneId, ScreenSlot>, stage: number): string | undefined {
  const leaves = listLeaves(node)
  const firstSlot = paneSlots[leaves[0].id]
  const firstGroupId = firstSlot ? resolveSlotGroupId(firstSlot, stage) : undefined
  if (!firstGroupId) return undefined
  const allMatch = leaves.every((leaf) => {
    const slot = paneSlots[leaf.id]
    return slot ? resolveSlotGroupId(slot, stage) === firstGroupId : false
  })
  return allMatch ? firstGroupId : undefined
}

/** Returns a copy of `timeline` with `value` checkpointed at `stage`, overwriting any existing entry there. */
export function writeStageCheckpoint<T>(timeline: StageTimeline<T> | undefined, stage: number, value: T): StageTimeline<T> {
  return { ...(timeline ?? {}), [stage]: value }
}

/** Maps every existing checkpoint's value through `fn` (receiving its own stage number), leaving the timeline's sparse key-set untouched — used by `GlobalTextSizeScaler` so a scale/reset action reaches every stage a slot actually has data at, not just the ones currently reachable via `stageCount`. */
export function mapTimelineValues<T>(timeline: StageTimeline<T> | undefined, fn: (value: T, stageKey: number) => T): StageTimeline<T> | undefined {
  if (!timeline) return timeline
  return Object.fromEntries(Object.entries(timeline).map(([key, value]) => [key, fn(value, Number(key))]))
}

/** The number of stages a screen actually resolves against right now — always 1 while `useStages` is off, regardless of any stored `stageCount`. */
export function effectiveStageCount(screen: Pick<ScreenConfig, 'useStages' | 'stageCount'>): number {
  return screen.useStages ? Math.max(1, screen.stageCount ?? 1) : 1
}

/** The current stage number (1-indexed) for a shared rotation `tick`, wrapping through `effectiveStageCount`. */
export function currentStage(tick: number, screen: Pick<ScreenConfig, 'useStages' | 'stageCount'>): number {
  return (tick % effectiveStageCount(screen)) + 1
}

/** True if some pane *other* than `excludeLeafId`, resolved at this exact `stage`, is already showing a resize-to-fit image or video — used to block a second one (of either kind) from being turned on at the same stage. Point-in-time only: doesn't check every stage a checkpoint might carry forward into. */
export function isResizeToFitConflict(leaves: { id: PaneId; slot: ScreenSlot }[], excludeLeafId: PaneId, stage: number): boolean {
  return leaves.some(({ id, slot }) => id !== excludeLeafId && isResizeToFitContent(resolveSlotContent(slot, stage)))
}

/** Whether a slot has any content to show at all, at any stage. */
export function isSlotActive(slot: ScreenSlot): boolean {
  return Object.values(slot.content).some((content) => content.kind !== 'none')
}
