import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { CaptureResult, ReportRow } from '../types'

const __dirname = dirname(fileURLToPath(import.meta.url))
export const RESULTS_DIR = join(__dirname, '..', 'results')

function ensureResultsDir(): void {
  mkdirSync(RESULTS_DIR, { recursive: true })
}

export function saveCaptureResult(result: CaptureResult): string {
  ensureResultsDir()
  const filePath = join(RESULTS_DIR, `${result.id}.json`)
  writeFileSync(filePath, JSON.stringify(result, null, 2))
  return filePath
}

export function loadAllCaptureResults(): CaptureResult[] {
  ensureResultsDir()
  return readdirSync(RESULTS_DIR)
    .filter((name) => name.endsWith('.json') && name !== 'report.json' && !name.endsWith('.trace.json'))
    .map((name) => JSON.parse(readFileSync(join(RESULTS_DIR, name), 'utf-8')) as CaptureResult)
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`
}

function formatMs(value: number | undefined): string {
  return value === undefined ? '—' : `${value.toFixed(2)}ms`
}

function renderRowsTable(rows: ReportRow[]): string {
  const header = '| Target | Variant | Animated property | Panes | Content type | rAF drop % | Layout count (median/window) | Layout ms (worst) | Layout ms (median) | Paint+composite ms (median) | Forced sync layout? | TV jank % | Notes |'
  const divider = '|---|---|---|---|---|---|---|---|---|---|---|---|---|'
  const body = rows
    .map(
      (row) =>
        `| ${row.target} | ${row.variant} | ${row.animatedProperty} | ${row.panes} | ${row.contentType} | ${formatPercent(row.rafDropPercent)} | ${row.layoutCountMedian ?? '—'} | ${formatMs(row.layoutMsWorst)} | ${formatMs(row.layoutMsMedian)} | ${formatMs(row.paintCompositeMsMedian)} | ${row.forcedSyncLayoutSuspected === undefined ? '—' : row.forcedSyncLayoutSuspected ? 'yes' : 'no'} | ${row.tvJankPercent === undefined ? '—' : formatPercent(row.tvJankPercent)} | ${row.notes ?? ''} |`,
    )
    .join('\n')
  return `${header}\n${divider}\n${body}`
}

/** Renders the diagnostic spec's own §7 deliverable table — one row per transition/target/variant combination, rAF-delta as the primary (directly comparable) column per the plan's design decision, CDP/`gfxinfo` columns as supporting attribution. `emptied` rows are rendered in their own section (see `ReportRow.isFloorMeasurement`'s own doc comment for why): it's a floor/control measurement on a DIFFERENT hook, not a fourth point on the `as-is`/`textblock`/`emptycatalogue` same-hook curve — a naive single table lets its lower count read as evidence about content cost, which it isn't. `human` rows get their own section too, for a related but different reason: it's a structurally different scenario (`transitionStyle: 'slide'`, per-stage content-kind swap, borders/background-color paint cost) built specifically to reproduce the real "Human testing" screen's worst case, not another point on the same-hook content-cost curve either. */
export function renderReportMarkdown(rows: ReportRow[]): string {
  const humanRows = rows.filter((row) => row.variant === 'human')
  const curveRows = rows.filter((row) => !row.isFloorMeasurement && row.variant !== 'human')
  const floorRows = rows.filter((row) => row.isFloorMeasurement)

  const sections = [`## Same-hook curve (as-is / textblock / emptycatalogue)\n\n${renderRowsTable(curveRows)}`]
  if (floorRows.length > 0) {
    sections.push(
      `## Floor measurement (emptied)\n\nA DIFFERENT hook (\`useShrinkToFitScale\`, not \`useShrinkToFitFontScale\`) is active here, not just less content on the same one — this is the cost of the CSS grid-track transition itself with trivial content, not a fourth point on the curve above. A lower count here than \`emptycatalogue\` is expected, not an anomaly.\n\n${renderRowsTable(floorRows)}`,
    )
  }
  if (humanRows.length > 0) {
    sections.push(
      `## Real-world worst case (human)\n\nMirrors the real "Human testing" screen that surfaced this stutter visibly — a per-stage \`catalogue\`-category swap crossfades between two different resolved contents that both trigger \`useShrinkToFitFontScale\` concurrently, in both crossfade slots at once, which the other scenarios above structurally never exercise (their content never changes, only geometry). Compare this section's before/after (across the fix's two commits, or against a checkout of the commit before either) rather than against the curve above — it's a different scenario, not a further point on that curve. The Paint+composite column matters more here than elsewhere: this scenario also has \`showSlotBorders\` and a per-stage \`backgroundColor\` change, both paint costs the layout-debounce fix doesn't target — a smaller-than-expected \`layoutCountMedian\` improvement alongside an unchanged paint figure would mean the fix worked as intended and the remainder is a separate, unaddressed paint cost, not a failed fix.\n\n${renderRowsTable(humanRows)}`,
    )
  }

  const forcedSyncCaveat =
    '\n\n> **Note on "Forced sync layout?"**: this column comes from matching JS call-stack function names captured alongside `Layout`/`UpdateLayoutTree` trace events against the suspect hook\'s own function names (`fitsAt`, `measureAndScale`, etc. — see `lib/traceParse.ts`, at `event.args.beginData.stackTrace`). Against a `vite preview` production build those names are minified, so this reads "no" there even where it applies — it reads "yes" (empirically confirmed, not just suspected) once the same capture is run against an unminified `vite dev` build. Absence of "yes" on a minified-build row is a tooling limitation, not evidence against P2.3.'
  return `# Pane-resize-stutter diagnostic report\n\nGenerated ${new Date().toISOString()}.\n\n${sections.join('\n\n')}${forcedSyncCaveat}\n`
}

export function writeReport(rows: ReportRow[]): { mdPath: string; jsonPath: string } {
  ensureResultsDir()
  const mdPath = join(RESULTS_DIR, 'report.md')
  const jsonPath = join(RESULTS_DIR, 'report.json')
  writeFileSync(mdPath, renderReportMarkdown(rows))
  writeFileSync(jsonPath, JSON.stringify(rows, null, 2))
  return { mdPath, jsonPath }
}

export function resultsDirExists(): boolean {
  return existsSync(RESULTS_DIR)
}
