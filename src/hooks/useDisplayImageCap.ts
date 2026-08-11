import { useMemo } from 'react'
import { DISPLAY_MAX_IMAGE_PX_OPTIONS, type DisplayMaxImagePx } from '../types/displayMachine'

/** The query param the ADHDisplay Companion appends to the kiosk URL to pass this unit's own cap down. */
export const MAX_IMAGE_PX_PARAM = 'maxImagePx'

/**
 * This display unit's own admin-set image-resolution ceiling (`DisplayMachine.maxImagePx`), read from
 * the kiosk URL.
 *
 * **Why a URL param and not a synced-key lookup.** The kiosk page is fully unauthenticated (the
 * read-only `/screens/:screenId` route is public by design), while `admin.displayMachines` is gated to
 * the `displaymanager` section server-side (`server/index.ts`). The page therefore cannot read the
 * machine list to find its own entry — and it has no idea which machine it is anyway. The companion
 * does know both, so it resolves the cap from its own heartbeat response and passes it in
 * (`adhdisplay-companion/src/screens/DisplayScreen.tsx`).
 *
 * Anything else — a browser tab opened by hand, an Electron display, the admin Screens grid, either
 * editor's preview — has no companion and no param, and so gets `'auto'`: variant choice falls back
 * entirely to how large the image actually renders, which is the right answer for a preview anyway.
 *
 * Deliberately reads `window.location` directly instead of `useSearchParams()`: this is consumed deep
 * inside the render tree (`ImageSlide`), including from `ScreenCard`'s grid thumbnail, and requiring a
 * router context there would couple every render path to the router for a value that never changes
 * without a full navigation.
 */
export function useDisplayImageCap(): DisplayMaxImagePx {
  return useMemo(() => {
    if (typeof window === 'undefined') return 'auto'
    const raw = new URLSearchParams(window.location.search).get(MAX_IMAGE_PX_PARAM)
    if (!raw || raw === 'auto') return 'auto'
    const parsed = Number(raw)
    // Validated against the real option list rather than merely "is a number", so a stale or
    // hand-edited URL can't pin a display to some width that has no derivative behind it.
    return (DISPLAY_MAX_IMAGE_PX_OPTIONS as readonly unknown[]).includes(parsed) ? (parsed as DisplayMaxImagePx) : 'auto'
  }, [])
}
