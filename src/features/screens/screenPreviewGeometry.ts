import type { PreviewAspectRatio } from '../../types/screen'

/** The longer of the two reference dimensions, in px — the exact number doesn't matter, only that it stays fixed across every ratio choice, so switching ratios doesn't itself change how large text/panes look in absolute terms (matching how a real 1920x1080 landscape screen and a real 1080x1920 portrait screen both read at a similar physical text size, just in a different overall shape). */
const REFERENCE_LONG_SIDE = 1920

/** The "real" pixel size `aspectRatio` is rendered at internally before being scaled down to fit (see `ScaledScreenPreview.tsx`) — also used by `screenPreviewCapture.ts` to size its own off-screen container to exactly this, making the `fit="contain"` scale factor come out to 1 (a full-resolution capture) rather than whatever an arbitrary off-screen box size would produce. Kept in its own module (rather than exported from `ScaledScreenPreview.tsx` itself) since that file only ever exports the one component — this codebase's fast-refresh lint rule forbids mixing a plain function export into a component file. */
export function referenceCanvasSize(aspectRatio: PreviewAspectRatio): { width: number; height: number } {
  const longSideUnits = Math.max(aspectRatio.width, aspectRatio.height)
  const unitToPx = REFERENCE_LONG_SIDE / longSideUnits
  return { width: aspectRatio.width * unitToPx, height: aspectRatio.height * unitToPx }
}
