/**
 * Scratchpad-only — not part of the app. Blocks until a frame-collector output file holds at least
 * `count` windows *from the current page load*, then exits.
 *
 * Counts trimmed rather than raw windows for the same reason `summarize-frames.mts` reports trimmed
 * ones: the collector is an append-only sink on a fixed port, so a file can start with windows from
 * the previous arm's still-running build, and a mid-run service-worker reload restarts the sampler's
 * own index. Waiting on the raw length would happily stop with a handful of usable samples.
 *
 * Usage: npx tsx QA/scratchpad/qa/wait-frames.mts <file.json> <count> [timeoutSeconds]
 */
import { readFileSync } from 'node:fs'
import type { FrameWindow } from './frameSampler.mts'

const [file, countArg, timeoutArg] = process.argv.slice(2)
if (!file || !countArg) throw new Error('usage: wait-frames.mts <file.json> <count> [timeoutSeconds]')
const target = Number(countArg)
const deadline = Date.now() + Number(timeoutArg ?? 600) * 1000

/** Windows since the last time the sampler's `index` restarted — see `summarize-frames.mts`'s own copy of this rule. */
function trimmed(): FrameWindow[] {
  let windows: FrameWindow[]
  try {
    windows = JSON.parse(readFileSync(file, 'utf-8')) as FrameWindow[]
  } catch {
    return []
  }
  let start = 0
  for (let i = 1; i < windows.length; i++) if (windows[i].index <= windows[i - 1].index) start = i
  return windows.slice(start)
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

while (Date.now() < deadline) {
  const count = trimmed().length
  if (count >= target) {
    console.log(`[wait] ${file}: ${count} windows from the current load`)
    process.exit(0)
  }
  await sleep(5000)
}
console.log(`[wait] TIMED OUT — ${file}: only ${trimmed().length} windows from the current load`)
process.exit(1)
