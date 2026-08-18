import { useMemo } from 'react'
import { DISPLAY_RENDER_WIDTH_OPTIONS, type DisplayRenderWidth } from '../types/displayMachine'

/** The query param the ADHDisplay Companion appends to the kiosk URL to pass this unit's own layout width down. */
export const RENDER_WIDTH_PX_PARAM = 'renderWidthPx'

/**
 * This display unit's own admin-set CSS layout width (`DisplayMachine.renderWidthPx`), read from the
 * kiosk URL.
 *
 * **Why a URL param and not a synced-key lookup** — identical reasoning to `useDisplayImageCap`: the
 * kiosk page is fully unauthenticated (the read-only `/screens/:screenId` route is public by design),
 * while `admin.displayMachines` is gated to the `displaymanager` section server-side. The page can
 * neither read the machine list nor know which machine it is; the companion knows both and passes it
 * in (`adhdisplay-companion/src/screens/DisplayScreen.tsx`).
 *
 * **This hook does not apply the viewport** — that has to happen before the first layout, so it is
 * done by an inline script in `index.html` reading the same param. This exists for code that needs to
 * *know* the configured width (e.g. deriving an effective device pixel ratio, see
 * `effectiveDevicePixelRatio`), not to set it.
 *
 * Anything else — a browser tab opened by hand, an Electron display, the admin Screens grid, either
 * editor's preview — has no companion and no param, and so gets `'auto'`: the page keeps
 * `index.html`'s own `width=device-width`, which is the right answer for a preview anyway.
 *
 * Deliberately reads `window.location` directly instead of `useSearchParams()`, same as
 * `useDisplayImageCap`: it is consumed deep inside the render tree, and requiring a router context
 * there would couple every render path to the router for a value that never changes without a full
 * navigation.
 */
export function useDisplayRenderWidth(): DisplayRenderWidth {
  return useMemo(() => readDisplayRenderWidth(), [])
}

/** The non-hook form, for module-level/imperative callers (`warmSlideBitmaps` captures outside React's own render). */
export function readDisplayRenderWidth(): DisplayRenderWidth {
  if (typeof window === 'undefined') return 'auto'
  const raw = new URLSearchParams(window.location.search).get(RENDER_WIDTH_PX_PARAM)
  if (!raw || raw === 'auto') return 'auto'
  const parsed = Number(raw)
  // Validated against the real option list rather than merely "is a number", for the same reason
  // `useDisplayImageCap` does it — and the inline script in `index.html` applies the identical guard,
  // so the two can never disagree about whether a given URL is honored.
  return (DISPLAY_RENDER_WIDTH_OPTIONS as readonly unknown[]).includes(parsed) ? (parsed as DisplayRenderWidth) : 'auto'
}
