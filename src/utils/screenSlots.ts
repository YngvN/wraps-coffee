import type { BackgroundImage, ScreenSlotContent } from '../types/screen'

/** A content kind that has text of its own, and so can carry its own `textSizes` — unlike `'none'` (nothing to show) or `'image'` (no text at all). An `'event'` slide only qualifies outside its own `'image'` display mode, which (like the `'image'` kind) has no text of its own either. */
export function hasOwnTextSizeFields(
  content: ScreenSlotContent,
): content is Extract<ScreenSlotContent, { kind: 'catalogue' } | { kind: 'event' } | { kind: 'transit' } | { kind: 'weather' } | { kind: 'messageboard' } | { kind: 'announcement' }> {
  if (content.kind === 'event') return content.displayMode !== 'image'
  return content.kind === 'catalogue' || content.kind === 'transit' || content.kind === 'weather' || content.kind === 'messageboard' || content.kind === 'announcement'
}

/** A content kind that's an image with `resizeToFit` on and an actual URL set — the only kind whose pane temporarily overrides its own ratio fields to fit the image (see `imageResizeRatioPatch`) and the only kind subject to the "one at a time per stage" conflict check (see `isResizeToFitConflict`). */
export function isResizeToFitImage(content: ScreenSlotContent): content is Extract<ScreenSlotContent, { kind: 'image' }> {
  return content.kind === 'image' && Boolean(content.resizeToFit) && Boolean(content.imageUrl)
}

/** Effective background image for a specific piece of content: its own when set (setting one is itself the opt-in, no separate flag needed), else `fallback` — typically the content's slot's own image. */
export function resolveContentBackgroundImage(content: ScreenSlotContent, fallback: BackgroundImage | undefined): BackgroundImage | undefined {
  return content.backgroundImage ?? fallback
}

/** A `'news'`-kind content — what a `'qrcode'` slide's own "automatic" mode (`newsSourceMode: 'automatic'`) looks for among a screen's other panes, to follow whichever headline that pane is currently showing (see `useCurrentNewsHeadline`). */
export function isNewsSlotContent(content: ScreenSlotContent): content is Extract<ScreenSlotContent, { kind: 'news' }> {
  return content.kind === 'news'
}
