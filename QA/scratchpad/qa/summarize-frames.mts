/**
 * Scratchpad-only — not part of the app. Summarises one or more regime-C frame-collector output
 * files (`frame-collector.mts`'s `<out>.json`) into the two numbers the kiosk-performance
 * investigation compares arms on: **median worst frame** and **median `debtByPhase`**.
 *
 * A median (not a mean) because `worstMs` is a single sample of a heavy-tailed distribution, and a
 * single slow rotation — the TV drops one whenever it feels like it — would drag a mean far enough
 * to invent or hide an effect. Ranges are printed alongside because the report's own bar for calling
 * a change real is ">30% median movement with non-overlapping ranges".
 *
 * Usage: npx tsx QA/scratchpad/qa/summarize-frames.mts <a.json> [b.json ...]
 */
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import type { FrameWindow } from './frameSampler.mts'

/** The three transition phases, in the order they occur — fixed here so every arm prints its columns in the same order regardless of which phases a given run happened to record. */
const PHASES = ['exiting', 'holding', 'idle'] as const

/**
 * Drops every window before the last time the sampler's own `index` restarted, keeping only the
 * final page load's windows.
 *
 * Necessary because the collector is a dumb append-only sink on a fixed port: an app still running
 * the *previous* arm's build keeps posting to it until the relaunch, so the first entries in a file
 * can belong to the arm before it (observed as a lone `index: 31` ahead of a fresh `1`). Mixing those
 * in is exactly the cross-arm contamination this investigation cannot afford, and `index` resetting
 * to 1 on every page load is a reliable marker of where the current build's data actually starts.
 */
function trimToLastLoad(windows: FrameWindow[]): FrameWindow[] {
  let start = 0
  for (let i = 1; i < windows.length; i++) if (windows[i].index <= windows[i - 1].index) start = i
  return windows.slice(start)
}

/** Median of `values`, averaging the two middle samples on an even count. Returns `0` for an empty list so a phase no window recorded prints as a zero rather than `NaN`. */
function median(values: number[]): number {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/** One decimal, and no trailing `.0` — these are millisecond figures quoted in prose, not a data table. */
function fmt(value: number): string {
  return String(Math.round(value * 10) / 10)
}

for (const file of process.argv.slice(2)) {
  let windows: FrameWindow[]
  try {
    windows = trimToLastLoad(JSON.parse(readFileSync(file, 'utf-8')) as FrameWindow[])
  } catch {
    console.log(`${basename(file)}: unreadable or missing`)
    continue
  }
  if (!windows.length) {
    console.log(`${basename(file)}: no windows`)
    continue
  }

  const worst = windows.map((w) => w.worstMs)
  // Total debt per window first, then the median of those totals — not the sum of each phase's own
  // median, which would not correspond to any window that actually happened.
  const totalDebt = windows.map((w) => PHASES.reduce((sum, p) => sum + (w.debtByPhase?.[p] ?? 0), 0))
  const perPhase = PHASES.map((p) => median(windows.map((w) => w.debtByPhase?.[p] ?? 0)))

  console.log(
    `${basename(file).padEnd(30)} n=${String(windows.length).padStart(2)}  ` +
      `worst med=${fmt(median(worst)).padStart(6)}ms [${fmt(Math.min(...worst))}-${fmt(Math.max(...worst))}]  ` +
      `debt med=${fmt(median(totalDebt)).padStart(6)}ms [${fmt(Math.min(...totalDebt))}-${fmt(Math.max(...totalDebt))}]  ` +
      `byPhase[${PHASES.map((p, i) => `${p[0]}=${fmt(perPhase[i])}`).join(' ')}]`,
  )
}
