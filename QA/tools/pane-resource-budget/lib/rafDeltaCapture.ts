import type { RafDeltaSummary } from '../types'

/**
 * Ported (not imported) from `diagnostics/pane-resize-stutter/lib/rafDeltaCapture.ts` — that directory
 * is explicitly throwaway/safe-to-delete for its own stutter investigation, so this tool (meant to be
 * kept and re-run, unlike that one) carries its own copy of the reusable pattern rather than reaching
 * across into a directory liable to disappear out from under it.
 */

/** Multiplier applied to the measured idle refresh interval to decide whether a frame counts as "dropped". */
const DROPPED_FRAME_MULTIPLIER = 1.5

/**
 * Injected into the page (via `page.evaluate`) to collect a `requestAnimationFrame` timestamp series
 * onto `window.__paneResourceBudgetRafTimestamps` — obtainable identically via plain
 * `page.evaluate`-injected JS across every Playwright-supported target, no CDP required. Runs until the
 * page is closed or `window.__paneResourceBudgetRafStop` is set. MUST be fully self-contained (no
 * closures over anything outside itself) — Playwright serializes this function's own source and sends
 * it into the page verbatim.
 *
 * The very first statement polyfills esbuild's `__name` helper: tsx transpiles this file with
 * name-preservation on, which wraps inner named function/arrow bindings in a call to a `__name` helper
 * — that wrapping survives into `fn.toString()`, which is exactly what `page.evaluate(fn)` sends into
 * the page, and the page has no such helper defined.
 */
export function installRafDeltaCollector(): void {
  ;(globalThis as { __name?: (fn: unknown, name?: string) => unknown }).__name ??= (fn: unknown) => fn
  const timestamps: number[] = []
  ;(window as unknown as { __paneResourceBudgetRafTimestamps: number[] }).__paneResourceBudgetRafTimestamps = timestamps
  const tick = (time: number) => {
    timestamps.push(time)
    if ((window as unknown as { __paneResourceBudgetRafStop?: boolean }).__paneResourceBudgetRafStop) return
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

/** Reads back `window.__paneResourceBudgetRafTimestamps` — call via `page.evaluate(readRafDeltaTimestamps)`. Self-contained for the same reason as `installRafDeltaCollector`. */
export function readRafDeltaTimestamps(): number[] {
  return (window as unknown as { __paneResourceBudgetRafTimestamps?: number[] }).__paneResourceBudgetRafTimestamps ?? []
}

/** Clears the collected timestamp buffer without stopping collection — lets `run.ts` take one rAF-delta reading per sample window over a long sustained capture instead of one single summary across the whole run (which would smear an early regression into a long, mostly-fine average). */
export function resetRafDeltaTimestamps(): void {
  ;(window as unknown as { __paneResourceBudgetRafTimestamps: number[] }).__paneResourceBudgetRafTimestamps = []
}

/**
 * Turns a raw rAF timestamp series into the report's canonical metric. The idle refresh interval is
 * estimated as the *median* frame delta across the sample window — robust to a window's own occasional
 * slow frame (a stage transition mid-window) without needing a separate dedicated idle-only sample.
 */
export function computeRafDeltaSummary(timestamps: number[]): RafDeltaSummary {
  if (timestamps.length < 2) return { frameCount: timestamps.length, droppedFrames: 0, dropPercent: 0, worstDeltaMs: 0, medianDeltaMs: 0, refreshIntervalMs: 0 }

  const deltas: number[] = []
  for (let i = 1; i < timestamps.length; i++) deltas.push(timestamps[i] - timestamps[i - 1])

  const sorted = [...deltas].sort((a, b) => a - b)
  const refreshIntervalMs = sorted[Math.floor(sorted.length / 2)]
  const threshold = refreshIntervalMs * DROPPED_FRAME_MULTIPLIER
  const droppedFrames = deltas.filter((delta) => delta > threshold).length

  return {
    frameCount: deltas.length,
    droppedFrames,
    dropPercent: (droppedFrames / deltas.length) * 100,
    worstDeltaMs: sorted[sorted.length - 1],
    medianDeltaMs: refreshIntervalMs,
    refreshIntervalMs,
  }
}
