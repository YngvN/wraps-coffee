/**
 * Scratchpad-only — splits one run file into its **warm** and **steady** halves and reports each
 * separately.
 *
 * `summarize-frames.mts` medians a whole run, which is the right default but hides exactly the thing
 * that killed the first bitmap arm: the boot warm's own cost. Fact 26 measured worst frames of
 * 3620/3500/3540ms *during* warming against a steady state that was merely flat — a whole-run median
 * mixes the two and reports neither.
 *
 * The split point is given in windows rather than detected, because "the warm finished" is not visible
 * in frame data. `slideBitmapProbe`'s `captures` counter is what actually tells you which window it
 * completed in; pass that window index here.
 *
 * Usage: npx tsx QA/scratchpad/qa/split-warm-steady.mts <run.json> <splitAfterWindowIndex>
 */
import { readFileSync } from 'node:fs'
import type { FrameWindow } from './frameSampler.mts'

const [file, splitArg] = process.argv.slice(2)
if (!file || !splitArg) throw new Error('usage: split-warm-steady.mts <run.json> <splitAfterWindowIndex>')
const splitAfter = Number(splitArg)

const all = JSON.parse(readFileSync(file, 'utf-8')) as FrameWindow[]

/** Same rule `summarize-frames`/`wait-frames` use: `index` restarting marks a new page load, and only the last load is this arm's. */
function trimToLastLoad(windows: FrameWindow[]): FrameWindow[] {
  let start = 0
  for (let i = 1; i < windows.length; i++) if (windows[i].index <= windows[i - 1].index) start = i
  return windows.slice(start)
}

function median(values: number[]): number {
  if (values.length === 0) return NaN
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function debt(window: FrameWindow): number {
  const byPhase = window.debtByPhase ?? {}
  return Object.values(byPhase).reduce((sum, value) => sum + (value ?? 0), 0)
}

function report(label: string, windows: FrameWindow[]) {
  if (windows.length === 0) {
    console.log(`${label.padEnd(10)} (none)`)
    return
  }
  const worst = windows.map((w) => w.worstMs)
  const debts = windows.map(debt)
  const phase = (name: string) => median(windows.map((w) => w.debtByPhase?.[name] ?? 0))
  console.log(
    `${label.padEnd(10)} n=${String(windows.length).padStart(3)}  worst med=${String(median(worst)).padStart(6)}ms [${Math.min(...worst)}-${Math.max(...worst)}]  ` +
      `debt med=${String(median(debts)).padStart(6)}ms [${Math.min(...debts)}-${Math.max(...debts)}]  ` +
      `byPhase[e=${phase('exiting')} h=${phase('holding')} i=${phase('idle')}]  worstOfAll=${Math.max(...worst)}ms`,
  )
}

const run = trimToLastLoad(all)
console.log(`${file}  (${run.length} windows from the current load, split after window ${splitAfter})`)
report('warm', run.filter((w) => w.index <= splitAfter))
report('steady', run.filter((w) => w.index > splitAfter))
