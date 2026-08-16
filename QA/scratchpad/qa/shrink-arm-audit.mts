/**
 * Scratchpad-only — the arm-comparison instrument for the shrink-to-fit rework.
 *
 * `extreme-audit.mts` prints one row per transition, which is the right shape for eyeballing a single
 * run but the wrong shape for comparing arms: on a 3-stage fixture the three transition *types* cost
 * wildly different amounts (on `Screen 3`, `2 -> 3` mounts three catalogue panes and costs ~6x what
 * `1 -> 2` does), so a whole-run median silently mixes them and a change to the expensive one gets
 * diluted into noise by the cheap ones.
 *
 * This groups every sampled window by its own `fromStage -> toStage` pair and reports medians with
 * ranges per group, following the consolidated report's regime C rules: fixed 20ms budget,
 * `debtByPhase` as the primary metric, medians over >=5 rotations, and a change only counts if it
 * moves the median >30% with non-overlapping ranges.
 *
 * Usage:
 *   npx tsx QA/scratchpad/qa/shrink-arm-audit.mts <screenId> [runMs] [outPath]
 *   QA_BASELINE=<baseline.json> npx tsx ... shrink-arm-audit.mts ...    # prints a per-group delta
 */
import { writeFileSync, readFileSync, existsSync } from 'node:fs'
import { launch, BASE_URL } from './harness.mts'
import { frameSamplerSource, type FrameWindow } from './frameSampler.mts'

const SCREEN_ID = process.argv[2] ?? '1783715372380'
const RUN_MS = Number(process.argv[3] ?? 120_000)
const OUT_PATH = process.argv[4] ?? `QA/scratchpad/qa/arm-frames-${SCREEN_ID}.json`
const BASELINE_PATH = process.env.QA_BASELINE

/** The report's own threshold for calling a change real rather than run-to-run spread. */
const MEANINGFUL_DELTA = 0.3

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

function totalDebt(w: FrameWindow): number {
  return Object.values(w.debtByPhase ?? {}).reduce((sum, v) => sum + v, 0)
}

interface Group {
  key: string
  n: number
  worst: number
  worstRange: [number, number]
  debt: number
  debtRange: [number, number]
  debtByPhase: Record<string, number>
}

const { browser, page } = await launch()
await page.addInitScript(frameSamplerSource())
await page.goto(`${BASE_URL}/screens/${SCREEN_ID}?unattended=1`)
await page.locator('.split-layout').first().waitFor({ timeout: 20000 })
console.log(`sampling ${SCREEN_ID} for ${RUN_MS / 1000}s...`)

await page.waitForTimeout(RUN_MS)
const windows = (await page.evaluate(() => (window as unknown as { __qaFrameWindows?: FrameWindow[] }).__qaFrameWindows ?? [])) as FrameWindow[]
await browser.close()

// Trim to the last sampler restart, same reason `summarize-frames.mts` does: the PWA's autoUpdate
// service worker can reload the page mid-run and restart the window index.
let start = 0
for (let i = 1; i < windows.length; i++) if (windows[i].index <= windows[i - 1].index) start = i
const trimmed = windows.slice(start)

const byPair = new Map<string, FrameWindow[]>()
for (const w of trimmed) {
  const key = `${w.fromStage} -> ${w.toStage}`
  const list = byPair.get(key)
  if (list) list.push(w)
  else byPair.set(key, [w])
}

const groups: Group[] = []
for (const [key, list] of [...byPair.entries()].sort()) {
  const worsts = list.map((w) => w.worstMs)
  const debts = list.map(totalDebt)
  const phases: Record<string, number> = {}
  for (const phase of ['exiting', 'holding', 'idle']) {
    phases[phase] = Math.round(median(list.map((w) => w.debtByPhase?.[phase] ?? 0)))
  }
  groups.push({
    key,
    n: list.length,
    worst: Math.round(median(worsts)),
    worstRange: [Math.round(Math.min(...worsts)), Math.round(Math.max(...worsts))],
    debt: Math.round(median(debts)),
    debtRange: [Math.round(Math.min(...debts)), Math.round(Math.max(...debts))],
    debtByPhase: phases,
  })
}

const allDebts = trimmed.map(totalDebt)
const overall = {
  n: trimmed.length,
  worst: Math.round(median(trimmed.map((w) => w.worstMs))),
  debt: Math.round(median(allDebts)),
  debtRange: [Math.round(Math.min(...allDebts)), Math.round(Math.max(...allDebts))] as [number, number],
}

writeFileSync(OUT_PATH, JSON.stringify({ screenId: SCREEN_ID, capturedAt: new Date().toISOString(), overall, groups }, null, 2))

console.log(`\n${trimmed.length} transition windows (of ${windows.length} sampled) → ${OUT_PATH}\n`)
console.log('transition'.padEnd(14) + 'n'.padEnd(5) + 'worst (median)'.padEnd(24) + 'debt (median)'.padEnd(24) + 'debt by phase e/h/i')
for (const g of groups) {
  console.log(
    g.key.padEnd(14) +
      String(g.n).padEnd(5) +
      `${g.worst}ms [${g.worstRange[0]}–${g.worstRange[1]}]`.padEnd(24) +
      `${g.debt}ms [${g.debtRange[0]}–${g.debtRange[1]}]`.padEnd(24) +
      `${g.debtByPhase.exiting} / ${g.debtByPhase.holding} / ${g.debtByPhase.idle}`,
  )
}
console.log(`\nALL           ${String(overall.n).padEnd(5)}${`${overall.worst}ms`.padEnd(24)}${`${overall.debt}ms [${overall.debtRange[0]}–${overall.debtRange[1]}]`}`)

if (BASELINE_PATH) {
  if (!existsSync(BASELINE_PATH)) {
    console.log(`\nno baseline at ${BASELINE_PATH} — skipping diff`)
  } else {
    const base = JSON.parse(readFileSync(BASELINE_PATH, 'utf-8')) as { groups: Group[] }
    console.log(`\nvs ${BASELINE_PATH}`)
    console.log('transition'.padEnd(14) + 'worst'.padEnd(28) + 'debt'.padEnd(28) + 'verdict')
    for (const g of groups) {
      const b = base.groups.find((x) => x.key === g.key)
      if (!b) continue
      const dWorst = b.worst ? (g.worst - b.worst) / b.worst : 0
      const dDebt = b.debt ? (g.debt - b.debt) / b.debt : 0
      // Non-overlapping ranges is the second half of the report's own bar — a big median move whose
      // ranges still overlap is exactly the kind of result that did not survive contact with the TV.
      const separated = g.debtRange[1] < b.debtRange[0] || g.debtRange[0] > b.debtRange[1]
      const real = Math.abs(dDebt) > MEANINGFUL_DELTA && separated
      const verdict = real ? (dDebt < 0 ? 'REAL improvement' : 'REAL regression') : separated ? 'separated, <30%' : 'within noise'
      console.log(
        g.key.padEnd(14) +
          `${b.worst} → ${g.worst}ms (${dWorst >= 0 ? '+' : ''}${(dWorst * 100).toFixed(0)}%)`.padEnd(28) +
          `${b.debt} → ${g.debt}ms (${dDebt >= 0 ? '+' : ''}${(dDebt * 100).toFixed(0)}%)`.padEnd(28) +
          verdict,
      )
    }
  }
}
