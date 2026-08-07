import type { RafDeltaSummary } from '../types'

/** Multiplier applied to the measured idle refresh interval to decide whether a frame counts as "dropped" — see `computeRafDeltaSummary`. */
const DROPPED_FRAME_MULTIPLIER = 1.5

/**
 * Injected into the page (via `page.evaluate`) to collect a `requestAnimationFrame` timestamp series
 * onto `window.__paneResizeRafTimestamps` — the plan's canonical cross-target metric, since it's the
 * one signal obtainable identically via plain `page.evaluate`-injected JS in Chromium, Firefox,
 * Electron, and the TV WebView, with no CDP required. Runs until the page is closed or
 * `window.__paneResizeRafStop` is set. MUST be fully self-contained (no closures over anything outside
 * itself) — see `transitionMarkers.ts`'s own doc comment for why.
 *
 * The very first statement polyfills esbuild's `__name` helper: tsx transpiles this file with
 * name-preservation on, which wraps inner named function/arrow bindings (e.g. `const tick = ...`) in a
 * call to a `__name` helper — that wrapping survives into `fn.toString()`, which is exactly what
 * Playwright's `page.evaluate(fn)` sends into the page, and the page has no such helper defined.
 */
export function installRafDeltaCollector(): void {
  ;(globalThis as { __name?: (fn: unknown, name?: string) => unknown }).__name ??= (fn: unknown) => fn
  const timestamps: number[] = []
  ;(window as unknown as { __paneResizeRafTimestamps: number[] }).__paneResizeRafTimestamps = timestamps
  const tick = (time: number) => {
    timestamps.push(time)
    if ((window as unknown as { __paneResizeRafStop?: boolean }).__paneResizeRafStop) return
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

/** Reads back `window.__paneResizeRafTimestamps` — call via `page.evaluate(readRafDeltaTimestamps)` after the capture window has elapsed. Self-contained for the same reason as `installRafDeltaCollector`. */
export function readRafDeltaTimestamps(): number[] {
  return (window as unknown as { __paneResizeRafTimestamps?: number[] }).__paneResizeRafTimestamps ?? []
}

/**
 * Turns a raw rAF timestamp series into the report's canonical metric. The idle refresh interval is
 * estimated as the *median* frame delta across the whole capture — over a ~60s window dominated by
 * idle frames between brief transitions, the median is robust to the transitions' own occasional slow
 * frames, so it's a fair "what does a normal frame look like on this device" baseline without needing
 * a separate dedicated idle-only sample.
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
