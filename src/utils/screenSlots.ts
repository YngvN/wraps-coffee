import type { BackgroundImage, ScreenSlotContent } from '../types/screen'

/** A content kind that has text of its own, and so can carry its own `textSizes` — unlike `'none'` (nothing to show) or `'image'` (no text at all). An `'event'` slide only qualifies outside its own `'image'` display mode, which (like the `'image'` kind) has no text of its own either. */
export function hasOwnTextSizeFields(
  content: ScreenSlotContent,
): content is Extract<ScreenSlotContent, { kind: 'catalogue' } | { kind: 'event' } | { kind: 'transit' } | { kind: 'weather' } | { kind: 'messageboard' } | { kind: 'announcement' }> {
  if (content.kind === 'event') return content.displayMode !== 'image'
  return content.kind === 'catalogue' || content.kind === 'transit' || content.kind === 'weather' || content.kind === 'messageboard' || content.kind === 'announcement'
}

/** A content kind that's an image with `resizeToFit` on and an actual URL set — one of the two kinds whose pane temporarily overrides its own ratio fields to fit the media (see `mediaResizeRatioPatch`) and is subject to the "one at a time per stage" conflict check (see `isResizeToFitConflict`). */
export function isResizeToFitImage(content: ScreenSlotContent): content is Extract<ScreenSlotContent, { kind: 'image' }> {
  return content.kind === 'image' && Boolean(content.resizeToFit) && Boolean(content.imageUrl)
}

/** Same idea as `isResizeToFitImage`, for a video checkpoint instead. */
export function isResizeToFitVideo(content: ScreenSlotContent): content is Extract<ScreenSlotContent, { kind: 'video' }> {
  return content.kind === 'video' && Boolean(content.resizeToFit) && Boolean(content.videoUrl)
}

/** Either resize-to-fit kind at once — the only two kinds whose pane temporarily overrides its own ratio fields to fit the media, and the only two subject to the "one at a time per stage" conflict check (see `isResizeToFitConflict`). */
export function isResizeToFitContent(content: ScreenSlotContent): content is Extract<ScreenSlotContent, { kind: 'image' | 'video' }> {
  return isResizeToFitImage(content) || isResizeToFitVideo(content)
}

/** The bare URL a resize-to-fit image/video checkpoint's own natural dimensions should be measured from (and the cache key `SplitLayout`'s own natural-size lookup uses) — `undefined` for anything else. Image and video content each carry their URL under a differently-named field (`imageUrl`/`videoUrl`), so this is the one place that difference needs handling at all; everywhere else just deals in a plain URL string. */
export function resizeToFitMediaUrl(content: ScreenSlotContent): string | undefined {
  if (isResizeToFitImage(content)) return content.imageUrl
  if (isResizeToFitVideo(content)) return content.videoUrl
  return undefined
}

/** Effective background image for a specific piece of content: its own when set (setting one is itself the opt-in, no separate flag needed), else `fallback` — typically the content's slot's own image. */
export function resolveContentBackgroundImage(content: ScreenSlotContent, fallback: BackgroundImage | undefined): BackgroundImage | undefined {
  return content.backgroundImage ?? fallback
}

/** A `'news'`-kind content — what a `'qrcode'` slide's own "automatic" mode (`newsSourceMode: 'automatic'`) looks for among a screen's other panes, to follow whichever headline that pane is currently showing (see `useCurrentNewsHeadline`). */
export function isNewsSlotContent(content: ScreenSlotContent): content is Extract<ScreenSlotContent, { kind: 'news' }> {
  return content.kind === 'news'
}
