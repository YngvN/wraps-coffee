import { isOwnUploadUrl } from '../lib/localServer'

/** Minimal shape of the Network Information API, where supported (not in every browser). */
interface NetworkInformationLike {
  effectiveType?: '2g' | '3g' | '4g' | 'slow-2g'
}

function hasSlowConnection(): boolean {
  const connection = (navigator as Navigator & { connection?: NetworkInformationLike }).connection
  return connection?.effectiveType === '2g' || connection?.effectiveType === 'slow-2g' || connection?.effectiveType === '3g'
}

/**
 * Picks the "small" compressed variant instead of the full-size original
 * when the viewport is narrow and/or the connection looks slow — only for
 * URLs this same local server actually served (and therefore has a
 * compressed companion for); an external URL is returned unchanged.
 */
export function pickImageVariant(url: string): string {
  if (!url || !isOwnUploadUrl(url)) return url
  const isNarrow = window.innerWidth < 768
  if (isNarrow || hasSlowConnection()) return `${url}?size=small`
  return url
}

/** Always the most compressed variant — for thumbnail-grid contexts (the Image Library) where many images render at once, regardless of the viewing device's own network/viewport. External URLs are returned unchanged. */
export function getThumbnailUrl(url: string): string {
  if (!url || !isOwnUploadUrl(url)) return url
  return `${url}?size=thumb`
}

/** Always the "small" variant, regardless of viewport/network — for a small live preview (e.g. the image-slide editor's own size/fit preview), where the full-size original would be wasted bandwidth for how small it's actually shown. External URLs are returned unchanged. */
export function getSmallUrl(url: string): string {
  if (!url || !isOwnUploadUrl(url)) return url
  return `${url}?size=small`
}

/** The pre-blurred, downsized variant — for a pane's own blurred background layer (see `LayoutPane.tsx`), so the browser blurs a small already-soft image live (a cheap "polish" pass) instead of a full-resolution one every frame. Falls back to the original (still softened by that residual live blur) for an upload saved before this variant existed, or an external URL. */
export function getBlurredBackgroundUrl(url: string): string {
  if (!url || !isOwnUploadUrl(url)) return url
  return `${url}?size=blur`
}
