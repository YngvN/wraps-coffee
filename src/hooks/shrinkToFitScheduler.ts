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
