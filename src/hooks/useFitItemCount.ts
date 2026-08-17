import { useEffect, useRef, useState, type RefObject } from 'react'

/**
 * How long content must be *continuously* overflowing before an item is dropped.
 *
 * Not politeness — it is what stops this from reacting to a transient. `useShrinkToFitFontScale`'s
 * search is frame-sliced (one probe per frame, see `ARM_A_DEFERRED_SEARCH`) and the intermediate
 * scales it paints along the way genuinely overflow. Dropping an item on the first overflowing frame
 * would react to the search's own working state rather than to its answer, and would keep dropping
 * items while the search converged. Comfortably longer than a search takes to settle.
 */
const OVERFLOW_SETTLE_MS = 900

/**
 * How long *slack* must persist before an item is added back.
 *
 * Deliberately far longer than `OVERFLOW_SETTLE_MS`, and paired with the slack threshold below. The
 * failure mode here is a loop — drop an item, discover it now fits, add it back, discover it now
 * overflows — which would show up as a pane flickering an item in and out forever. Asymmetric timing
 * plus a slack margin makes shrinking eager and growing reluctant, so the steady state is "one item
 * fewer than the boundary" rather than an oscillation across it.
 */
const SLACK_SETTLE_MS = 5000

/**
 * How much room must be free before another item is added back, as a fraction of the average item's
 * own height.
 *
 * Growing back needs room for the item *plus* margin, otherwise the item that gets added is exactly
 * the one that overflows. 1.35 is that margin — an item's own height is only an average (rows differ,
 * a wrapped destination is taller than a plain one), so the next item added may be larger than the
 * one this was measured from.
 */
const GROW_SLACK_FACTOR = 1.35

/** Pixels of overflow to tolerate before treating content as genuinely not fitting — absorbs sub-pixel layout rounding, which is routine on a fractional-width pane and would otherwise read as a permanent overflow. */
const OVERFLOW_TOLERANCE_PX = 2

/** How often to sample. Matches `useShrinkToFitFontScale`'s own safety poll — this reads layout the same way and there is no reason for it to be busier. */
const SAMPLE_INTERVAL_MS = 2000

/**
 * Resolves how many of a list's items actually fit their pane, dropping items when even the smallest
 * legible type cannot make them fit and adding them back when the room returns.
 *
 * **Why this exists.** `useShrinkToFitFontScale` used to shrink text without limit to make content
 * fit, which on a dense pane produced type unreadable at kiosk distance. That hook now stops at
 * `MIN_LEGIBLE_SCALE`, which leaves a gap: content that does not fit *even at the floor*. This is what
 * fills it — below the floor the answer stops being "smaller text" and becomes "fewer items", which is
 * the one trade a viewer can actually still read. Truncation is deliberately not an option anywhere in
 * this chain: a departure or a forecast hour that is half-visible is worse than one that is absent,
 * because a viewer cannot tell it is incomplete.
 *
 * Reads `scrollHeight`/`clientHeight` off `containerRef` on a slow timer rather than observing, and
 * only while the screen is `idle` — the same posture, and the same reasoning, as the shrink hook's own
 * safety poll: a forced layout read is cheap in isolation but must never land inside a stage
 * transition, where it would join the busiest commit in the sequence (consolidated report fact 16).
 *
 * @param containerRef The element whose overflow decides the count — normally the slide's own root,
 *   which already clips (`overflow-y: hidden`), so `scrollHeight > clientHeight` is exactly "does not
 *   fit". Its content must be the list being counted; a container holding unrelated taller content
 *   would drop items forever without ever fitting.
 * @param totalCount How many items are available. The result never exceeds this, and a change to it
 *   re-opens the count (a shorter feed should not stay capped by a limit derived from a longer one).
 * @param minCount Never drop below this many, however little room there is — a pane showing zero
 *   departures is not a graceful degradation, it looks broken. Defaults to 1.
 * @returns How many items to render, between `minCount` and `totalCount`.
 */
export function useFitItemCount(containerRef: RefObject<HTMLElement | null>, totalCount: number, minCount = 1): number {
  const [count, setCount] = useState(totalCount)
  /** When the current overflowing/slack condition was first observed, so a *continuous* stretch can be required rather than a single sample. `null` whenever the condition is not currently holding. */
  const overflowingSinceRef = useRef<number | null>(null)
  const slackSinceRef = useRef<number | null>(null)

  // More items became available (or fewer) — re-open the count rather than leaving it pinned to a
  // limit derived from a different list. Applied during render, React's documented "adjusting state
  // when a prop changes" pattern, which this codebase uses in `useCrossfadeSlot` for the same reason:
  // an effect would commit one frame rendering the stale count first. Held as state rather than a ref
  // because this codebase's lint config forbids touching a ref during render (`react-hooks/refs`) —
  // the two settle timers below are reset from inside the effect instead, which re-runs on the same
  // `totalCount` change.
  const [lastTotal, setLastTotal] = useState(totalCount)
  if (lastTotal !== totalCount) {
    setLastTotal(totalCount)
    setCount(totalCount)
  }

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    // A different list is being counted, so neither settle timer's accumulated stretch describes it.
    overflowingSinceRef.current = null
    slackSinceRef.current = null

    const sample = () => {
      // Never measure mid-transition. `data-content-phase` is published on the screen's own
      // `.split-layout` root (see `SplitLayout.tsx`), the same signal the QA harnesses key off.
      const phase = container.closest('.split-layout')?.getAttribute('data-content-phase')
      if (phase && phase !== 'idle') {
        overflowingSinceRef.current = null
        slackSinceRef.current = null
        return
      }

      const overflowBy = container.scrollHeight - container.clientHeight
      const now = Date.now()

      if (overflowBy > OVERFLOW_TOLERANCE_PX) {
        slackSinceRef.current = null
        overflowingSinceRef.current ??= now
        if (now - overflowingSinceRef.current < OVERFLOW_SETTLE_MS) return
        overflowingSinceRef.current = null
        setCount((current) => Math.max(minCount, current - 1))
        return
      }

      overflowingSinceRef.current = null
      if (count >= totalCount) {
        slackSinceRef.current = null
        return
      }
      // Average item height, derived from what is actually rendered rather than assumed — rows differ
      // in height (a wrapped destination, a two-line headline), so a fixed guess would be wrong in
      // whichever direction matters.
      const averageItemHeight = count > 0 ? container.scrollHeight / count : container.scrollHeight
      const slack = container.clientHeight - container.scrollHeight
      if (slack < averageItemHeight * GROW_SLACK_FACTOR) {
        slackSinceRef.current = null
        return
      }
      slackSinceRef.current ??= now
      if (now - slackSinceRef.current < SLACK_SETTLE_MS) return
      slackSinceRef.current = null
      setCount((current) => Math.min(totalCount, current + 1))
    }

    const interval = setInterval(sample, SAMPLE_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [containerRef, count, totalCount, minCount])

  return Math.min(count, totalCount)
}
