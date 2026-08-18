import { readDisplayRenderWidth } from '../hooks/useDisplayRenderWidth'

/**
 * How many *device* pixels one CSS pixel actually covers, accounting for a forced layout viewport.
 *
 * **Why `window.devicePixelRatio` alone is wrong once `DisplayRenderWidth` is in play.** On this
 * fleet's Android TV, `devicePixelRatio` reports `2` because Android's *density* is 320 (320/160) —
 * not because the drawing surface has twice the pixels. With the default `width=device-width` that
 * happens to be right: a 960 CSS px viewport on a 1920px surface really is 2 device px per CSS px.
 * But when `index.html`'s own inline script forces the viewport to 1920, the same surface is now
 * 1 device px per CSS px while `devicePixelRatio` *still says 2* — so anything multiplying a measured
 * CSS size by it requests an image at twice the resolution actually displayable, on the weakest
 * hardware in the fleet.
 *
 * Derived rather than assumed: `screen.width` stays in the device's own default CSS px (it describes
 * the screen, not the current viewport), so `screen.width * devicePixelRatio` is the surface width in
 * device px, and dividing by the *current* `innerWidth` gives the real ratio. Unforced that is
 * 960·2/960 = 2; forced to 1920 it is 960·2/1920 = 1.
 *
 * Deliberately defensive, because that `screen.width` behavior is the one assumption here and a wrong
 * answer silently degrades every image on the display:
 *   - falls back to `devicePixelRatio` whenever the param is absent (`'auto'`), which is every
 *     non-companion surface — a browser tab, an Electron display, either editor, the admin grid — so
 *     nothing outside a configured kiosk changes behavior at all;
 *   - falls back on any non-finite/absurd result;
 *   - clamps to `[1, devicePixelRatio]`, since widening the viewport can only ever *lower* the
 *     effective ratio, never raise it above what the device reports.
 */
export function effectiveDevicePixelRatio(): number {
  if (typeof window === 'undefined') return 1
  const raw = window.devicePixelRatio || 1
  // No forced viewport ⇒ `devicePixelRatio` is already correct, and this must stay a pure no-op there.
  if (readDisplayRenderWidth() === 'auto') return raw

  const surfaceWidthDevicePx = (window.screen?.width ?? 0) * raw
  const cssWidth = window.innerWidth
  if (!surfaceWidthDevicePx || !cssWidth) return raw

  const derived = surfaceWidthDevicePx / cssWidth
  if (!Number.isFinite(derived) || derived <= 0) return raw
  return Math.min(Math.max(derived, 1), raw)
}
