/**
 * Scratchpad-only — the test plan's **Step 1a**, reduced to the one question left open after V1.
 *
 * V1 showed that disabling shrink-to-fit removes 85-89% of a real screen's transition cost, but not
 * *why* it is expensive. Two fixes follow from two different answers, and they are near-opposite
 * implementations:
 *
 *  - mostly `fitsAt(1)` fast-path hits -> the cost is N panes x 1 forced layout, and the fix is
 *    **batching** the reads and writes across panes instead of interleaving them per pane;
 *  - mostly full 8-iteration searches -> the fix is **seeding** each search from the pane's own
 *    last-known scale so it converges in 1-2 iterations.
 *
 * Deliberately a **desktop** run: these are counts, not timings, so the numbers are identical to the
 * device's and the TV is not needed to decide the design. It also reports how often the same pane
 * re-measures at the same size, which is what says whether a third option — caching the resolved
 * scale per (pane, size, content) — would beat both.
 */
import { launch, BASE_URL } from './harness.mts'

interface ShrinkEvent { hook: 'font' | 'transform'; pane: string; phase: string; iterations: number; forcedLayouts: number; ms: number }

const SCREEN_ID = process.argv[2] ?? '1783715372380'
const RUN_MS = Number(process.argv[3] ?? 40_000)

const { browser, page } = await launch()
await page.goto(`${BASE_URL}/screens/${SCREEN_ID}?unattended=1`)
await page.locator('.split-layout').first().waitFor({ timeout: 20000 })
await page.waitForTimeout(RUN_MS)

const events = (await page.evaluate(() => (window as unknown as { __qaShrink?: ShrinkEvent[] }).__qaShrink ?? [])) as ShrinkEvent[]
await browser.close()

const font = events.filter((e) => e.hook === 'font')
const transform = events.filter((e) => e.hook === 'transform')
const fastPath = font.filter((e) => e.iterations === 0)
const fullSearch = font.filter((e) => e.iterations > 0)
const totalForced = events.reduce((sum, e) => sum + e.forcedLayouts, 0)
const totalMs = events.reduce((sum, e) => sum + e.ms, 0)

const byPhase: Record<string, { passes: number; forced: number; ms: number }> = {}
for (const e of events) {
  const row = (byPhase[e.phase] ??= { passes: 0, forced: 0, ms: 0 })
  row.passes += 1
  row.forced += e.forcedLayouts
  row.ms += e.ms
}

const perPane: Record<string, { passes: number; full: number; ms: number }> = {}
for (const e of font) {
  const row = (perPane[e.pane] ??= { passes: 0, full: 0, ms: 0 })
  row.passes += 1
  if (e.iterations > 0) row.full += 1
  row.ms += e.ms
}

console.log(`screen=${SCREEN_ID}  window=${RUN_MS / 1000}s  events=${events.length}`)
console.log(`\nfont-scale passes:   ${font.length}   (fast path ${fastPath.length}, full search ${fullSearch.length})`)
console.log(`transform passes:    ${transform.length}`)
console.log(`TOTAL forced layouts: ${totalForced}   total time in measure: ${Math.round(totalMs)}ms`)
console.log(`\nby phase:`)
for (const [phase, row] of Object.entries(byPhase).sort((a, b) => b[1].forced - a[1].forced)) {
  console.log(`  ${phase.padEnd(9)} passes=${String(row.passes).padStart(4)}  forcedLayouts=${String(row.forced).padStart(5)}  ${String(Math.round(row.ms)).padStart(5)}ms`)
}
// The single most diagnostic view: how many forced layouts each individual pass actually cost.
// An average hides whether the seeded fast path is firing at all — 6 probes/pass could be every pass
// costing 6, or half costing 3 and half costing 10, and those imply completely different next moves.
const histogram: Record<number, number> = {}
for (const e of font) histogram[e.forcedLayouts] = (histogram[e.forcedLayouts] ?? 0) + 1
console.log(`\nforced layouts per font-scale pass:`)
for (const [probes, count] of Object.entries(histogram).sort((a, b) => Number(a[0]) - Number(b[0]))) {
  console.log(`  ${String(probes).padStart(3)} layouts  x${String(count).padStart(3)}  ${'#'.repeat(count)}`)
}

console.log(`\nper pane (font-scale only):`)
for (const [pane, row] of Object.entries(perPane).sort((a, b) => b[1].ms - a[1].ms)) {
  console.log(`  ${pane.slice(0, 28).padEnd(30)} passes=${String(row.passes).padStart(3)}  fullSearch=${String(row.full).padStart(3)}  ${String(Math.round(row.ms)).padStart(5)}ms`)
}
