import type { BackgroundImage, ScreenSlotContent } from '../types/screen'

/** A content kind that has text of its own, and so can carry a `useOwnTextSizes`/`textSizes` override — unlike `'none'` (nothing to show) or `'image'` (no text at all). */
export function hasOwnTextSizeFields(
  content: ScreenSlotContent,
): content is Extract<ScreenSlotContent, { kind: 'category' } | { kind: 'menu' } | { kind: 'events' } | { kind: 'transit' } | { kind: 'weather' } | { kind: 'messageboard' }> {
  return (
    content.kind === 'category' ||
    content.kind === 'menu' ||
    content.kind === 'events' ||
    content.kind === 'transit' ||
    content.kind === 'weather' ||
    content.kind === 'messageboard'
  )
}

/** A content kind that's an image with `resizeToFit` on and an actual URL set — the only kind whose pane temporarily overrides its own ratio fields to fit the image (see `imageResizeRatioPatch`) and the only kind subject to the "one at a time per stage" conflict check (see `isResizeToFitConflict`). */
export function isResizeToFitImage(content: ScreenSlotContent): content is Extract<ScreenSlotContent, { kind: 'image' }> {
  return content.kind === 'image' && Boolean(content.resizeToFit) && Boolean(content.imageUrl)
}

/** Effective background image for a specific piece of content: its own when set (setting one is itself the opt-in, no separate flag needed), else `fallback` — typically the content's slot's own image. */
export function resolveContentBackgroundImage(content: ScreenSlotContent, fallback: BackgroundImage | undefined): BackgroundImage | undefined {
  return content.backgroundImage ?? fallback
}
