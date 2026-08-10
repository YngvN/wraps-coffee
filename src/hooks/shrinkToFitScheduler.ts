/**
 * Shared rAF/settle-timer scheduling primitives for `useShrinkToFitScale` and
 * `useShrinkToFitFontScale` — both hooks install a `ResizeObserver`, a
 * `MutationObserver`, and a periodic poll that all ultimately need to trigger
 * the same `measureAndScale`, coalesced through a single pending
 * `requestAnimationFrame` at a time. Factored out because the resize-debounce
 * fix (see `useShrinkToFitScale.ts`'s own doc comment on `RESIZE_SETTLE_MS`)
 * added a second, nontrivial timer alongside the existing mutation-settle one,
 * and duplicating that across both hook files risked the two copies drifting.
 *
 * Deliberately a plain factory, not a hook (no `use` prefix, no internal
 * `useRef`/`useState`): each call site creates one instance per
 * `useLayoutEffect` run and relies on that effect's own cleanup (`cancel()`)
 * to tear down all pending work on every re-run or unmount, so a plain
 * closure over local variables is enough — no need to persist an instance
 * across renders the way a ref would.
 */
/**
 * How long a pane's `ResizeObserver` must go quiet before a resize-triggered
 * remeasure actually runs — see `useShrinkToFitScale.ts`'s own doc comment
 * (under "Re-measures on every resize") for the full rationale. In short: an
 * automated stage transition animates pane geometry over ~30 resize ticks in
 * ~0.5s, and remeasuring on every one of those forces a synchronous layout
 * each time; collapsing the whole burst into one remeasure after it settles
 * removes ~29 of those 30 forced layouts per transition. Chosen well above
 * one animation-frame interval (~16ms at 60fps) so a smooth burst reliably
 * collapses to a single trailing call, while staying under the ~100-150ms
 * "feels instant" perceptual threshold so a manual divider-drag pause still
 * reads as responsive (there's no CSS transition running during a drag —
 * `SplitLayout.tsx`'s `gridTransition` is `false` while `isDragging` — so a
 * drag's own resize ticks come straight from mouse movement, not an
 * animation, and settle on release/pause rather than looping for 0.5s).
 */
export const RESIZE_SETTLE_MS = 50

export interface ShrinkToFitScheduler {
  /** Coalesces to at most one `measureAndScale` per animation frame — cancels any already-pending call and reschedules. */
  scheduleMeasure: () => void
  /** Debounces: (re)arms a timer that calls `scheduleMeasure` once `settleMs` has passed with no further calls. */
  scheduleMeasureAfterSettle: (settleMs: number) => void
  /** Clears any pending frame and settle timer. Call from the owning effect's cleanup. */
  cancel: () => void
}

export function createShrinkToFitScheduler(measureAndScale: () => void): ShrinkToFitScheduler {
  let frame: number | undefined
  let settleTimer: ReturnType<typeof setTimeout> | undefined

  const scheduleMeasure = () => {
    if (frame !== undefined) cancelAnimationFrame(frame)
    frame = requestAnimationFrame(measureAndScale)
  }

  const scheduleMeasureAfterSettle = (settleMs: number) => {
    if (settleTimer !== undefined) clearTimeout(settleTimer)
    settleTimer = setTimeout(scheduleMeasure, settleMs)
  }

  const cancel = () => {
    if (frame !== undefined) cancelAnimationFrame(frame)
    if (settleTimer !== undefined) clearTimeout(settleTimer)
  }

  return { scheduleMeasure, scheduleMeasureAfterSettle, cancel }
}
