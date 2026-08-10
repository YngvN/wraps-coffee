import type { LayoutWindowSummary, TransitionWindow } from '../types'
import type { CapturedTrace, TraceEvent } from './cdpTrace'

/**
 * Empirically verified against a real captured trace (Chrome 141, `vite dev` build) — see this
 * session's own findings: `TimeStamp` events (React's own Scheduler track markers included) carry
 * their label at `args.data.message`; `Layout` and `UpdateLayoutTree` are DISTINCT event names, not
 * aliases of each other — `UpdateLayoutTree` is Chrome's current internal name for the style-recalc
 * step (DevTools used to label this "Recalculate Style"), while `Layout` is the actual geometry pass.
 * An earlier version of this file conflated the two (both appeared in `LAYOUT_EVENT_NAMES`), which
 * silently doubled every layout-count/duration number reported here — verify this distinction again
 * if a future Chrome version renames either event.
 */

function timeStampLabel(event: TraceEvent): string | undefined {
  if (event.name !== 'TimeStamp') return undefined
  return (event.args?.data as { message?: string } | undefined)?.message
}

/** Pairs up `console.timeStamp('transition-start')`/`'transition-end'` markers (`transitionMarkers.ts`) into windows, in trace order. A stray unmatched start (capture ended mid-transition) is dropped rather than guessed at. */
export function findTransitionWindows(trace: CapturedTrace): TransitionWindow[] {
  const starts: number[] = []
  const ends: number[] = []
  for (const event of trace.traceEvents) {
    const label = timeStampLabel(event)
    if (label === 'transition-start') starts.push(event.ts)
    else if (label === 'transition-end') ends.push(event.ts)
  }
  starts.sort((a, b) => a - b)
  ends.sort((a, b) => a - b)

  const windows: TransitionWindow[] = []
  let endIndex = 0
  for (const start of starts) {
    while (endIndex < ends.length && ends[endIndex] <= start) endIndex++
    if (endIndex >= ends.length) break
    windows.push({ startTs: start, endTs: ends[endIndex] })
    endIndex++
  }
  return windows
}

/** The true geometry/reflow pass — kept separate from `RECALCULATE_STYLE_EVENT_NAMES` (see this file's own top doc comment for why merging them was a real bug in an earlier version). */
const LAYOUT_EVENT_NAMES = new Set(['Layout'])
/** The style-recalculation step — `UpdateLayoutTree` is current Chrome's name for it; `RecalculateStyles` is kept for older versions. Answers the diagnostic spec's own separate "Whether Recalculate Style is also per-frame" question (P2.1) — deliberately NOT folded into `layoutCount`. */
const RECALCULATE_STYLE_EVENT_NAMES = new Set(['RecalculateStyles', 'UpdateLayoutTree'])
/**
 * Paint + GPU-compositing cost — kept separate from `layoutCount`/`layoutDurationsMs` so the two
 * mechanisms this repo's slide-transition-stutter fix cares about stay distinguishable in the report:
 * the fix itself only targets forced-synchronous-layout cost (the font-scale hook's binary search), not
 * paint (e.g. a screen's `showSlotBorders`/per-stage `backgroundColor` change). Without this, a
 * screen with meaningful paint cost of its own could show a smaller-than-expected before/after
 * improvement on `layoutCountMedian` alone and read as "the fix underperformed," when the unaddressed
 * share was simply never a layout cost to begin with. `UpdateLayerTree` (compositing layer tree
 * recompute) is intentionally distinct from `UpdateLayoutTree` (style recalc, see
 * `RECALCULATE_STYLE_EVENT_NAMES` above) — easy to confuse by name, not the same pipeline stage.
 */
const PAINT_COMPOSITE_EVENT_NAMES = new Set(['Paint', 'CompositeLayers', 'UpdateLayerTree'])

/** Trace-event stack-frame function names that indicate a Layout event was forced synchronously from inside the suspect font-scale hook's own read-after-write pattern (`useShrinkToFitFontScale.ts`'s `fitsAt()`) — see the plan's P2.3 attribution. Empirically confirmed (against an unminified `vite dev` build) at `event.args.beginData.stackTrace` on BOTH `Layout` and `UpdateLayoutTree` events, NOT `event.args.data.stackTrace` as originally guessed — both are checked below for robustness across Chrome versions/event shapes. */
const FORCED_SYNC_LAYOUT_STACK_PATTERN = /useShrinkToFitFontScale|useShrinkToFitScale|fitsAt|measureAndScale|applyScale/

function isForcedSyncLayoutSuspect(event: TraceEvent): boolean {
  const beginData = event.args?.beginData as { stackTrace?: { functionName?: string }[] } | undefined
  const data = event.args?.data as { stackTrace?: { functionName?: string }[] } | undefined
  const stack = beginData?.stackTrace ?? data?.stackTrace
  if (!stack) return false
  return stack.some((frame) => FORCED_SYNC_LAYOUT_STACK_PATTERN.test(frame.functionName ?? ''))
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

/** Summarizes every `Layout` trace event (plus a separate `UpdateLayoutTree`/`RecalculateStyles` count) whose timestamp falls inside `window` — the CDP-trace side of a capture, supporting (not primary, per the plan's rAF-delta decision) evidence for P2.1/P2.2/P2.3. */
export function summarizeLayoutWindow(trace: CapturedTrace, window: TransitionWindow): LayoutWindowSummary {
  const inWindow = trace.traceEvents.filter((event) => event.ts >= window.startTs && event.ts <= window.endTs)
  const layoutEvents = inWindow.filter((event) => LAYOUT_EVENT_NAMES.has(event.name))
  const layoutDurationsMs = layoutEvents.map((event) => (event.dur ?? 0) / 1000)
  const recalculateStyleCount = inWindow.filter((event) => RECALCULATE_STYLE_EVENT_NAMES.has(event.name)).length
  const paintCompositeEvents = inWindow.filter((event) => PAINT_COMPOSITE_EVENT_NAMES.has(event.name))
  const paintCompositeDurationMs = paintCompositeEvents.reduce((sum, event) => sum + (event.dur ?? 0) / 1000, 0)

  return {
    window,
    layoutCount: layoutEvents.length,
    layoutDurationsMs,
    worstLayoutMs: layoutDurationsMs.length > 0 ? Math.max(...layoutDurationsMs) : 0,
    medianLayoutMs: median(layoutDurationsMs),
    recalculateStyleCount,
    forcedSyncLayoutSuspected: layoutEvents.some(isForcedSyncLayoutSuspect),
    paintCompositeCount: paintCompositeEvents.length,
    paintCompositeDurationMs,
  }
}

export function summarizeAllTransitionWindows(trace: CapturedTrace): LayoutWindowSummary[] {
  return findTransitionWindows(trace).map((window) => summarizeLayoutWindow(trace, window))
}
