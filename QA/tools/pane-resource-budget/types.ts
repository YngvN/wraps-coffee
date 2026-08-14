/** Shared result types for the pane-resource-budget tool — see README.md for what each one measures and why. */

/** The canonical cross-target frame-timing metric — same shape as `diagnostics/pane-resize-stutter/types.ts`'s own `RafDeltaSummary`, ported rather than imported (see `lib/rafDeltaCapture.ts`'s own doc comment). */
export interface RafDeltaSummary {
  frameCount: number
  droppedFrames: number
  dropPercent: number
  worstDeltaMs: number
  medianDeltaMs: number
  refreshIntervalMs: number
}

/**
 * One point-in-time CDP memory/DOM reading. Both `Performance.getMetrics()` (JS heap) and
 * `Memory.getDOMCounters()` (DOM node/listener/document counts) are read together rather than relying
 * on just one: `customHtml` injects real DOM directly (a DOM-node-count concern), while the
 * shrink-to-fit hooks' own MutationObserver/ResizeObserver/poll triad is a JS-heap-churn concern — a
 * regression could show up in either signal without the other moving.
 */
export interface MemorySample {
  timestamp: number
  jsHeapUsedBytes: number
  jsHeapTotalBytes: number
  domNodes: number
  domDocuments: number
  jsEventListeners: number
  /** Cross-check against `domNodes` — see `cdpMemoryMetrics.ts`'s own doc comment. */
  perfApiNodes: number
}

/** Which seeded scenario a capture ran against. */
export type BudgetScenario = 'baseline' | 'worstcase'

/**
 * One full sustained-capture run's result — several minutes of active stage rotation, not a single
 * instant snapshot, per the plan's own "sustained-idle heap/DOM growth" requirement. `memorySamples` is
 * ordered chronologically; `growth` is computed as the last sample minus the first, since a single-run
 * instant delta is what actually answers "does this leak/churn under sustained rotation", not an
 * average across the whole window (which would smear an early leak into a long, mostly-flat curve).
 */
export interface BudgetCaptureResult {
  id: string
  timestamp: string
  scenario: BudgetScenario
  screenId: string
  durationMs: number
  sampleIntervalMs: number
  memorySamples: MemorySample[]
  growth: {
    jsHeapUsedBytes: number
    domNodes: number
    jsEventListeners: number
  }
  /** One rAF-delta summary per sample window (not one summary for the whole run) — see `lib/rafDeltaCapture.ts`'s own `resetRafDeltaTimestamps` doc comment for why. */
  rafDeltaWindows: RafDeltaSummary[]
  /** The worst (highest) `dropPercent` across every window — the single number most worth flagging in a summary table. */
  worstRafDropPercent: number
  payload?: PayloadSizeReport
}

/** A plain, no-browser check of a screen's own total JSON payload size and how close its panes sit to their `customCss`/`customHtml` length caps — see `lib/payloadSize.ts`. */
export interface PayloadSizeReport {
  screenId: string
  totalBytes: number
  paneCount: number
  panesNearCssCap: number
  panesNearHtmlCap: number
  /** "Near" threshold used for the two counts above, as a fraction of `MAX_PANE_CUSTOM_CSS_LENGTH`/`MAX_PANE_CUSTOM_HTML_LENGTH` (e.g. 0.9 = within 90% of the cap). */
  nearCapThreshold: number
}
