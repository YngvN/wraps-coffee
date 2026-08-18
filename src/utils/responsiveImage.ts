import { isOwnUploadUrl, normalizeUploadUrl } from '../lib/localServer'
import type { DisplayMaxImagePx } from '../types/displayMachine'

/** Minimal shape of the Network Information API, where supported (not in every browser). */
interface NetworkInformationLike {
  effectiveType?: '2g' | '3g' | '4g' | 'slow-2g'
}

/**
 * The pre-generated `?size=` variants and the pixel width of each, smallest first — the client-side
 * mirror of what `server/uploads.ts` writes (`UPLOAD_VARIANT_SUFFIXES`). `-blur` is absent on purpose:
 * it is pre-blurred, so it is a backdrop, never a candidate for showing an image sharply.
 *
 * The original is deliberately not a member. It has no knowable width (an upload is stored at whatever
 * resolution it arrived at — there is no dimension cap on ingest, only `MAX_UPLOAD_BYTES`) and is only
 * ever chosen as the explicit fallback for "needs more than the largest derivative".
 */
const UPLOAD_VARIANT_LADDER = [
  { size: 'thumb', width: 240 },
  { size: 'tiny', width: 480 },
  { size: 'small', width: 800 },
  { size: 'medium', width: 1600 },
] as const

/** The widest derivative that exists — a target above this falls back to the original. */
const LARGEST_VARIANT_WIDTH = UPLOAD_VARIANT_LADDER[UPLOAD_VARIANT_LADDER.length - 1].width

function hasSlowConnection(): boolean {
  const connection = (navigator as Navigator & { connection?: NetworkInformationLike }).connection
  return connection?.effectiveType === '2g' || connection?.effectiveType === 'slow-2g' || connection?.effectiveType === '3g'
}

/**
 * Picks the smallest pre-generated variant that still covers how large the image is *actually being
 * rendered*, rather than guessing from the viewport — only for URLs this same local server served (and
 * therefore has companions for); an external URL is returned unchanged.
 *
 * Every helper in this file normalizes an own-upload URL's origin to this client's own first (see
 * `normalizeUploadUrl`) — a stored URL carries whichever host the *uploading admin* happened to use,
 * which is not necessarily one the device rendering it can reach at all.
 *
 * **Why rendered size and not viewport.** This previously returned the full-size original unless
 * `window.innerWidth < 768` or the connection reported 2g/3g. Both are structurally false on a
 * LAN-connected TV (1920 wide, `effectiveType: '4g'`), so every TV downloaded and decoded the
 * untouched original — measured at 4032x2268 for the one image in this store's own test screen, next
 * to an unused 800x450 derivative. It also meant the admin Screens grid decoded a full-resolution
 * original per card, for thumbnails a couple of hundred pixels wide.
 *
 * @param renderedWidth How wide the image renders, in device pixels (CSS px x DPR). Callers should
 *   measure with `getBoundingClientRect()`, not `clientWidth` — `ScaledScreenPreview` lays its canvas
 *   out full-size and shrinks it with `transform: scale()`, which layout-only reads do not see.
 *   Omitted (or non-finite) keeps the historic behaviour of serving the original.
 * @param cap This display unit's own admin-set ceiling (`DisplayMachine.maxImagePx`). `'auto'`/absent
 *   defers entirely to `renderedWidth`. A numeric cap below the largest derivative also *forbids* the
 *   original, so a unit pinned to 480 never decodes a 4032px file no matter how large the pane is.
 */
export function pickImageVariant(url: string, renderedWidth?: number, cap?: DisplayMaxImagePx): string {
  if (!url || !isOwnUploadUrl(url)) return url
  const normalized = normalizeUploadUrl(url)

  const hasCap = typeof cap === 'number'
  const hasMeasurement = typeof renderedWidth === 'number' && Number.isFinite(renderedWidth) && renderedWidth > 0
  // Unmeasured and uncapped is the one case with nothing to go on — keep the original rather than
  // guessing a size and risking a visibly soft image.
  if (!hasMeasurement && !hasCap) return hasSlowConnection() ? `${normalized}?size=small` : normalized

  // A cap is a ceiling, not a target: it only ever narrows what the measurement asked for.
  const target = Math.min(hasMeasurement ? renderedWidth : Number.POSITIVE_INFINITY, hasCap ? cap : Number.POSITIVE_INFINITY)
  const variant = UPLOAD_VARIANT_LADDER.find((candidate) => candidate.width >= target)
  if (variant) return `${normalized}?size=${variant.size}`

  // Past the top of the ladder. An explicit cap that still exceeds every derivative (e.g. 3840) is an
  // allowance to use the original; a cap at or below the largest derivative must never fall through
  // to it, so it clamps to the widest variant instead.
  if (hasCap && cap <= LARGEST_VARIANT_WIDTH) return `${normalized}?size=${UPLOAD_VARIANT_LADDER[UPLOAD_VARIANT_LADDER.length - 1].size}`
  return normalized
}

/** Always the most compressed variant — for thumbnail-grid contexts (the Image Library) where many images render at once, regardless of the viewing device's own network/viewport. External URLs are returned unchanged. */
export function getThumbnailUrl(url: string): string {
  if (!url || !isOwnUploadUrl(url)) return url
  return `${normalizeUploadUrl(url)}?size=thumb`
}

/** Always the "small" variant, regardless of viewport/network — for a small live preview (e.g. the image-slide editor's own size/fit preview), where the full-size original would be wasted bandwidth for how small it's actually shown. External URLs are returned unchanged. */
export function getSmallUrl(url: string): string {
  if (!url || !isOwnUploadUrl(url)) return url
  return `${normalizeUploadUrl(url)}?size=small`
}

/**
 * A pane's own whole-image background layer (see `LayoutPane.tsx`'s
 * `effectiveBackgroundImage`/`BackgroundImage.blur`): with `blur` on, the
 * pre-blurred, downsized `?size=blur` variant (server-side `sharp(...).blur(20)`,
 * see `server/uploads.ts`) — small and already-soft, so the browser's own
 * residual live `filter: blur` is a cheap "polish" pass on top of it rather
 * than blurring a full-resolution image every frame. With `blur` off, the
 * plain sharp `?size=small` variant instead (same one `getSmallUrl` returns)
 * — using the blurred variant here regardless of the toggle would leave the
 * image looking blurred no matter what the CSS-side `filter` is set to,
 * since most of the softening is actually pre-baked into that file itself,
 * not applied live. Falls back to the original for an upload saved before
 * these variants existed, or an external URL, either way.
 */
export function getBackgroundImageUrl(url: string, blur: boolean): string {
  if (!url || !isOwnUploadUrl(url)) return url
  const normalized = normalizeUploadUrl(url)
  return blur ? `${normalized}?size=blur` : `${normalized}?size=small`
}
