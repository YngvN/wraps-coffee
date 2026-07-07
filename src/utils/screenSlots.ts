import type { BackgroundImage, ScreenSlot, ScreenSlotContent } from '../types/screen'

/** Identifies one specific slide: which slot it's in, and its own index within that slot's `contents`. Shared by the display's own per-slot editor and the admin form's per-slide text-size editor. */
export interface SlideTarget {
  slotIndex: number
  contentIndex: number
}

/** Whether a slot has any content to show at all. */
export function isSlotActive(slot: ScreenSlot): boolean {
  return slot.contents.some((content) => content.kind !== 'none')
}

/** A slide's content kind that has text of its own, and so can carry a per-slide `useOwnTextSizes`/`textSizes` override — unlike `'none'` (nothing to show) or `'image'` (no text at all). */
export function hasOwnTextSizeFields(content: ScreenSlotContent): content is Extract<ScreenSlotContent, { kind: 'category' } | { kind: 'events' }> {
  return content.kind === 'category' || content.kind === 'events'
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

/** The original `contents` index (not its position among only the active entries) of whichever slide a slot is currently showing for a given tick — needed to address that exact slide when reading/writing its own text-size override. */
export function currentSlotContentIndex(slot: ScreenSlot, tick: number): number {
  const activeWithIndex = slot.contents.map((content, index) => ({ content, index })).filter((entry) => entry.content.kind !== 'none')
  if (activeWithIndex.length === 0) return 0
  return activeWithIndex[currentSlotSubIndex(slot, tick)].index
}

/** Effective background image for a specific slide: its own (`useOwnBackgroundImage`) when set, else `fallback` — typically the slide's slot's own image. */
export function resolveContentBackgroundImage(content: ScreenSlotContent, fallback: BackgroundImage | undefined): BackgroundImage | undefined {
  if (content.useOwnBackgroundImage && content.backgroundImage) return content.backgroundImage
  return fallback
}
