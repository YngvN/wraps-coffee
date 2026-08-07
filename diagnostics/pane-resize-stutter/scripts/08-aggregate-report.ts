/**
 * Assembles every `results/*.json` capture into the diagnostic spec's own §7 one-row-per-transition
 * table (rAF-delta as the primary, directly-comparable column; CDP Layout-duration as supporting
 * attribution — see the plan's rAF-delta design decision), writes `results/report.md` +
 * `results/report.json`, and copies the markdown into `QA/Reports/` following this repo's existing
 * report-naming convention (`qa-report-<topic>-<date>.md`).
 *
 * Also scans for any `tv-framestats-*.txt` files left by `06-tv-frame-stats.sh` and reports their
 * parsed "Janky frames" percentage as a separate supporting section — that data isn't tied to a
 * specific scenario variant (gfxinfo measures the whole app process, not a per-screen breakdown), so it
 * doesn't get folded into a per-variant table cell.
 *
 * Usage: npx tsx diagnostics/pane-resize-stutter/scripts/08-aggregate-report.ts
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadAllCaptureResults, RESULTS_DIR, renderReportMarkdown, writeReport } from '../lib/resultsStore'
import type { CaptureResult, ReportRow, ScenarioVariant } from '../types'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '..', '..', '..')

const VARIANT_DESCRIPTIONS: Record<ScenarioVariant, string> = {
  'as-is': 'catalogue x2 (real data) + time',
  emptycatalogue: 'catalogue x2 (0-1 items) + time',
  textblock: 'catalogue x2 (short names, no descriptions) + time',
  emptied: 'none x2 + time',
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

function toReportRow(result: CaptureResult): ReportRow {
  const worstValues = (result.layoutWindows ?? []).map((window) => window.worstLayoutMs)
  const medianValues = (result.layoutWindows ?? []).map((window) => window.medianLayoutMs)
  const countValues = (result.layoutWindows ?? []).map((window) => window.layoutCount)
  const anyForcedSync = (result.layoutWindows ?? []).some((window) => window.forcedSyncLayoutSuspected)

  return {
    target: result.target,
    variant: result.variant,
    animatedProperty: 'grid-template-columns, grid-template-rows',
    panes: 3,
    contentType: VARIANT_DESCRIPTIONS[result.variant],
    rafDropPercent: result.rafDelta.dropPercent,
    layoutCountMedian: result.layoutWindows ? median(countValues) : undefined,
    layoutMsWorst: result.layoutWindows ? Math.max(0, ...worstValues) : undefined,
    layoutMsMedian: result.layoutWindows ? median(medianValues) : undefined,
    forcedSyncLayoutSuspected: result.layoutWindows ? anyForcedSync : undefined,
    isFloorMeasurement: result.variant === 'emptied',
    notes: Object.entries(result.meta)
      .map(([key, value]) => `${key}=${value}`)
      .join(', '),
  }
}

function findTvFramestatsSummaries(): { file: string; jankPercent: number | undefined }[] {
  if (!existsSync(RESULTS_DIR)) return []
  return readdirSync(RESULTS_DIR)
    .filter((name) => name.startsWith('tv-framestats-') && name.endsWith('.txt'))
    .map((name) => {
      const content = readFileSync(join(RESULTS_DIR, name), 'utf-8')
      const match = /Janky frames:\s*\d+\s*\(([\d.]+)%\)/i.exec(content)
      return { file: name, jankPercent: match ? Number(match[1]) : undefined }
    })
}

function main() {
  const results = loadAllCaptureResults()
  if (results.length === 0) {
    console.log('No results found under results/ yet — run the capture scripts first.')
    return
  }

  const rows = results.map(toReportRow).sort((a, b) => a.target.localeCompare(b.target) || a.variant.localeCompare(b.variant))
  const { mdPath } = writeReport(rows)

  const tvFramestats = findTvFramestatsSummaries()
  let fullMd = readFileSync(mdPath, 'utf-8')
  if (tvFramestats.length > 0) {
    fullMd += '\n## TV gfxinfo framestats (P4.3, release build — not tied to a specific variant)\n\n'
    fullMd += '| File | Janky frames % |\n|---|---|\n'
    for (const entry of tvFramestats) fullMd += `| ${entry.file} | ${entry.jankPercent === undefined ? 'could not parse' : `${entry.jankPercent}%`} |\n`
    writeFileSync(mdPath, fullMd)
  }

  const qaReportsDir = join(REPO_ROOT, 'QA', 'Reports')
  mkdirSync(qaReportsDir, { recursive: true })
  const dateStamp = new Date().toISOString().slice(0, 10)
  const qaReportPath = join(qaReportsDir, `qa-report-pane-resize-stutter-diagnostic-${dateStamp}.md`)
  writeFileSync(qaReportPath, fullMd)

  console.log(renderReportMarkdown(rows))
  console.log(`\nSaved ${mdPath}`)
  console.log(`Saved ${qaReportPath}`)
}

main()
