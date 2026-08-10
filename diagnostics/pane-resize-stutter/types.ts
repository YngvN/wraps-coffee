/** Shared result/trace types for the pane-resize-stutter diagnostic tooling — see README.md. */

/**
 * The seeded screen variants — the first four per the plan's "P2.2 needs FOUR seeded screens" design
 * decision, plus `human` (see `buildHumanScenarioScreen`'s own doc comment): a 5th scenario added once
 * the original four turned out to structurally miss the real "Human testing" screen's worst case (a
 * per-stage content-KIND change compounding two concurrent `useShrinkToFitFontScale` searches).
 */
export type ScenarioVariant = 'as-is' | 'emptycatalogue' | 'textblock' | 'emptied' | 'human'

export const SCENARIO_VARIANTS: ScenarioVariant[] = ['as-is', 'emptycatalogue', 'textblock', 'emptied', 'human']

/** Which environment a capture ran against — one row group per target in the final report. */
export type CaptureTarget = 'chromium' | 'firefox' | 'electron' | 'tv-webview'

/** A `console.timeStamp` marker injected by `lib/transitionMarkers.ts`, read back out of a captured CDP trace by `lib/traceParse.ts`. */
export interface TransitionWindow {
  startTs: number
  endTs: number
}

/** Per-transition-window `Layout` trace-event attribution — the CDP-trace side of a capture, supporting (not primary) evidence per the plan's rAF-delta decision. */
export interface LayoutWindowSummary {
  window: TransitionWindow
  layoutCount: number
  layoutDurationsMs: number[]
  worstLayoutMs: number
  medianLayoutMs: number
  recalculateStyleCount: number
  /** True when a `Layout` event's own call frame nests inside a JS task rather than the frame's ordinary layout phase — see traceParse.ts's own doc comment for the exact heuristic. Corresponds to the diagnostic spec's P2.3. */
  forcedSyncLayoutSuspected: boolean
  /** Count of `Paint`/`CompositeLayers`/`UpdateLayerTree` events in this window — see `traceParse.ts`'s own doc comment on `PAINT_COMPOSITE_EVENT_NAMES` for why this is tracked separately from layout: it's the paint-cost share (e.g. `showSlotBorders`, a per-stage `backgroundColor` change) this fix doesn't target, kept measurable so it doesn't get conflated with the layout-cost share the fix does target. */
  paintCompositeCount: number
  /** Summed duration (ms) of this window's own paint/composite events. */
  paintCompositeDurationMs: number
}

/** The canonical cross-target metric (see the plan's "rAF-delta promoted to canonical" decision) — obtainable identically via `page.evaluate` in Chromium, Firefox, Electron, and the TV WebView, no CDP required. */
export interface RafDeltaSummary {
  frameCount: number
  /** A frame whose delta from the previous one exceeds `droppedFrameThresholdMs`. */
  droppedFrames: number
  dropPercent: number
  worstDeltaMs: number
  medianDeltaMs: number
  /** The display's own measured refresh interval (median frame delta while idle, no transition in flight) — what `droppedFrameThresholdMs` (1.5x this) was computed from. */
  refreshIntervalMs: number
}

/** One capture run's full result — written to `results/<id>.json` by `lib/resultsStore.ts`, read back by `scripts/08-aggregate-report.ts`. */
export interface CaptureResult {
  id: string
  timestamp: string
  target: CaptureTarget
  variant: ScenarioVariant
  screenId: string
  /** Freeform notes for target-specific context — e.g. `{ electronFlag: 'CalculateNativeWinOcclusion=off' }`, `{ buildType: 'release' }`. */
  meta: Record<string, string>
  rafDelta: RafDeltaSummary
  /** One entry per transition window captured in this run's trace — absent for a target/run that only captured rAF-delta (e.g. Firefox, or a `gfxinfo`-only TV run). */
  layoutWindows?: LayoutWindowSummary[]
  /** Path (relative to `results/`) to the raw Chrome trace-event JSON, when one was captured. */
  tracePath?: string
}

/** One row of the diagnostic spec's own §7 deliverable table, assembled by `scripts/08-aggregate-report.ts`. */
export interface ReportRow {
  target: CaptureTarget
  variant: ScenarioVariant
  animatedProperty: string
  panes: number
  contentType: string
  /** Primary, directly-comparable column across every target — see the plan's rAF-delta design decision. */
  rafDropPercent: number
  /** Supporting attribution, not comparison — present only for CDP-traced targets. */
  layoutMsWorst?: number
  layoutMsMedian?: number
  /** Median, across every captured transition window, of that window's own `Layout` event count — often the more damning number than duration: a large count of individually-cheap layouts is exactly the read/write-thrashing pattern `useShrinkToFitFontScale.ts`'s `fitsAt()` produces. */
  layoutCountMedian?: number
  forcedSyncLayoutSuspected?: boolean
  /** Median, across every captured transition window, of that window's own total paint/composite duration (ms) — see `LayoutWindowSummary.paintCompositeDurationMs`'s own doc comment for why this is kept separate from the layout figures above. */
  paintCompositeMsMedian?: number
  /** TV-only supporting column, from `dumpsys gfxinfo framestats` against the release build. */
  tvJankPercent?: number
  /** True for the `emptied` variant: it swaps to a DIFFERENT measurement hook entirely (`useShrinkToFitScale`, not `useShrinkToFitFontScale`), not just less content on the same hook — so it's a floor/control measurement, not a fourth point on the `as-is`/`textblock`/`emptycatalogue` same-hook curve. Render it in its own section so an inversion against that curve doesn't get misread as evidence about content cost. */
  isFloorMeasurement?: boolean
  notes?: string
}
