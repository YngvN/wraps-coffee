import type { ScreenSlot, ScreenSlotContent } from '../types/screen'

/** Whether a slot has any content to show at all. */
export function isSlotActive(slot: ScreenSlot): boolean {
  return slot.contents.some((content) => content.kind !== 'none')
}

/** Which of a slot's active entries is currently showing for a given tick: always 0 for a non-rotating (or single-slide) slot, so only a genuinely rotating slot produces a changing value. Useful as an animation key — a stable value means no transition plays. */
export function currentSlotSubIndex(slot: ScreenSlot, tick: number): number {
  const activeCount = slot.contents.filter((content) => content.kind !== 'none').length
  if (!slot.isSlideshow || activeCount <= 1) return 0
  return tick % activeCount
}

/** The slide a slot is currently showing: its only content in single mode, or (in slideshow mode) whichever of its non-"none" entries `tick` currently points to. */
export function currentSlotContent(slot: ScreenSlot, tick: number): ScreenSlotContent {
  const active = slot.contents.filter((content) => content.kind !== 'none')
  if (active.length === 0) return { kind: 'none' }
  return active[currentSlotSubIndex(slot, tick)]
}

/** One entry in a flattened, screen-wide rotation: a slide's content, tagged with the original slot index it came from and its own original index within that slot's `contents` (both needed for per-slot/per-slide text-size resolution/editing). */
export interface FlattenedSlide {
  content: ScreenSlotContent
  slotIndex: number
  contentIndex: number
}

/**
 * Flattens every slot's slide(s) into one ordered, screen-wide list — each
 * slideshow-enabled slot contributes all of its non-"none" entries in order,
 * each single-mode slot contributes its one entry (if any). Used by the
 * screen-level 'slideshow' layout, which shows one slide at a time
 * regardless of which slot it came from.
 */
export function flattenScreenSlots(slots: ScreenSlot[]): FlattenedSlide[] {
  const result: FlattenedSlide[] = []
  slots.forEach((slot, slotIndex) => {
    const active = slot.contents.map((content, contentIndex) => ({ content, contentIndex })).filter((entry) => entry.content.kind !== 'none')
    const entries = slot.isSlideshow ? active : active.slice(0, 1)
    entries.forEach(({ content, contentIndex }) => result.push({ content, slotIndex, contentIndex }))
  })
  return result
}

/** The original `contents` index (not its position among only the active entries) of whichever slide a slot is currently showing for a given tick — needed to address that exact slide when reading/writing its own text-size override. */
export function currentSlotContentIndex(slot: ScreenSlot, tick: number): number {
  const activeWithIndex = slot.contents.map((content, index) => ({ content, index })).filter((entry) => entry.content.kind !== 'none')
  if (activeWithIndex.length === 0) return 0
  return activeWithIndex[currentSlotSubIndex(slot, tick)].index
}
