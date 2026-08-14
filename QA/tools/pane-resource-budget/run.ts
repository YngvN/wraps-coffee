/**
 * Sustained resource-budget capture for the per-pane custom CSS/HTML feature: DOM node count, JS heap,
 * and frame-drop percentage over several minutes of active stage rotation, plus a plain JSON payload
 * size check — see README.md for the full "what it measures, and why" reasoning.
 *
 * ⚠️ Per this repo's CLAUDE.md, get explicit confirmation before running this against the live app —
 * it drives real browser automation and writes real synced state (a `[pane-resource-budget]`-prefixed
 * screen, backed up first — see `lib/seedClient.ts`'s own `backupSyncedKeyFile`). This mirrors
 * `diagnostics/pane-resize-stutter/scripts/02-run-browser-trace.ts`'s own established precedent for
 * exactly this kind of tool.
 *
 * Usage:
 *   npx tsx QA/tools/pane-resource-budget/run.ts --scenario=both --durationMs=180000
 *   npx tsx QA/tools/pane-resource-budget/run.ts --scenario=worstcase --durationMs=300000 --headed
 *   npx tsx QA/tools/pane-resource-budget/run.ts --remove
 */
import { randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright'
import type { ScreenConfig } from '../../../src/types/screen'
import { sampleMemoryMetrics, openMemoryMetricsSession } from './lib/cdpMemoryMetrics'
import { computePayloadSizeReport, formatPayloadSizeReport } from './lib/payloadSize'
import { computeRafDeltaSummary, installRafDeltaCollector, readRafDeltaTimestamps, resetRafDeltaTimestamps } from './lib/rafDeltaCapture'
import { buildBaselineScreen, buildWorstCaseScreen } from './lib/buildScenarioScreens'
import { backupSyncedKeyFile, isBudgetId, login, openSyncSession, resolveServerUrls, type SeedServerConfig } from './lib/seedClient'
import type { BudgetCaptureResult, BudgetScenario, MemorySample } from './types'

const REPO_ROOT = join(__dirname, '..', '..', '..')
const RESULTS_DIR = join(__dirname, 'results')
const DEFAULT_DURATION_MS = 180_000 // 3 minutes — "several minutes of active stage rotation" per the plan
const DEFAULT_SAMPLE_INTERVAL_MS = 15_000

function parseArgs(argv: string[]) {
  const args = new Map<string, string>()
  for (const entry of argv) {
    const [key, ...rest] = entry.replace(/^--/, '').split('=')
    args.set(key, rest.join('='))
  }
  return args
}

/** Merges `screen` into the live `admin.screens` array by id (replace-if-present, append otherwise) — never a partial write, matching `SyncSession.write`'s own "full value only" contract. */
async function seedScreen(session: Awaited<ReturnType<typeof openSyncSession>>, screen: ScreenConfig) {
  const current = (session.snapshot['admin.screens'] as ScreenConfig[] | undefined) ?? []
  const withoutThis = current.filter((s) => s.screenID !== screen.screenID)
  session.write('admin.screens', [...withoutThis, screen])
  session.snapshot['admin.screens'] = [...withoutThis, screen]
}

async function removeBudgetScreens(config: SeedServerConfig) {
  const { token } = await login('admin', '1234', config)
  const session = await openSyncSession(token, ['admin.screens'], config)
  const current = (session.snapshot['admin.screens'] as ScreenConfig[] | undefined) ?? []
  const kept = current.filter((s) => !isBudgetId(s.screenID))
  const removedCount = current.length - kept.length
  if (removedCount > 0) {
    backupSyncedKeyFile(REPO_ROOT, 'admin.screens')
    session.write('admin.screens', kept)
    await new Promise((r) => setTimeout(r, 500)) // let the write actually flush before closing
  }
  session.close()
  console.log(`Removed ${removedCount} pane-resource-budget screen(s).`)
}

async function captureScenario(scenario: BudgetScenario, screen: ScreenConfig, opts: { durationMs: number; sampleIntervalMs: number; headed: boolean; config: SeedServerConfig }): Promise<BudgetCaptureResult> {
  const { contentUrl } = resolveServerUrls(opts.config)
  const browser = await chromium.launch({ headless: !opts.headed })
  const page = await browser.newPage()
  await page.goto(`${contentUrl}/screens/${screen.screenID}?unattended=1`)
  await page.evaluate(installRafDeltaCollector)

  const cdpSession = await openMemoryMetricsSession(page)

  const memorySamples: MemorySample[] = []
  const rafDeltaWindows: ReturnType<typeof computeRafDeltaSummary>[] = []
  const sampleCount = Math.max(2, Math.floor(opts.durationMs / opts.sampleIntervalMs))

  console.log(`[${scenario}] capturing ${opts.durationMs}ms in ${sampleCount} windows of ~${opts.sampleIntervalMs}ms each...`)

  for (let i = 0; i < sampleCount; i++) {
    await page.waitForTimeout(opts.sampleIntervalMs)
    memorySamples.push(await sampleMemoryMetrics(cdpSession))
    const timestamps = await page.evaluate(readRafDeltaTimestamps)
    rafDeltaWindows.push(computeRafDeltaSummary(timestamps))
    await page.evaluate(resetRafDeltaTimestamps)
    console.log(`[${scenario}] window ${i + 1}/${sampleCount}: heap=${(memorySamples[i].jsHeapUsedBytes / 1_048_576).toFixed(1)}MB nodes=${memorySamples[i].domNodes} dropPercent=${rafDeltaWindows[i].dropPercent.toFixed(1)}`)
  }

  await browser.close()

  const first = memorySamples[0]
  const last = memorySamples[memorySamples.length - 1]
  const payload = computePayloadSizeReport(screen)
  console.log(formatPayloadSizeReport(payload))

  return {
    id: `${scenario}-${randomUUID().slice(0, 8)}`,
    timestamp: new Date().toISOString(),
    scenario,
    screenId: screen.screenID,
    durationMs: opts.durationMs,
    sampleIntervalMs: opts.sampleIntervalMs,
    memorySamples,
    growth: {
      jsHeapUsedBytes: last.jsHeapUsedBytes - first.jsHeapUsedBytes,
      domNodes: last.domNodes - first.domNodes,
      jsEventListeners: last.jsEventListeners - first.jsEventListeners,
    },
    rafDeltaWindows,
    worstRafDropPercent: Math.max(...rafDeltaWindows.map((w) => w.dropPercent)),
    payload,
  }
}

function printSummary(result: BudgetCaptureResult) {
  console.log(`\n=== ${result.scenario} (${result.screenId}) ===`)
  console.log(`Heap growth: ${(result.growth.jsHeapUsedBytes / 1_048_576).toFixed(2)} MB over ${result.durationMs / 1000}s`)
  console.log(`DOM node growth: ${result.growth.domNodes}`)
  console.log(`JS listener growth: ${result.growth.jsEventListeners}`)
  console.log(`Worst frame-drop window: ${result.worstRafDropPercent.toFixed(1)}%`)
  if (result.payload) console.log(formatPayloadSizeReport(result.payload))
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const config: SeedServerConfig = { host: args.get('host'), wsPort: args.get('wsPort') ? Number(args.get('wsPort')) : undefined, contentPort: args.get('contentPort') ? Number(args.get('contentPort')) : undefined }

  if (args.has('remove')) {
    await removeBudgetScreens(config)
    return
  }

  const scenarioArg = (args.get('scenario') ?? 'both') as BudgetScenario | 'both'
  const durationMs = args.get('durationMs') ? Number(args.get('durationMs')) : DEFAULT_DURATION_MS
  const sampleIntervalMs = args.get('sampleIntervalMs') ? Number(args.get('sampleIntervalMs')) : DEFAULT_SAMPLE_INTERVAL_MS
  const headed = args.has('headed')

  const { token } = await login('admin', '1234', config)
  const session = await openSyncSession(token, ['admin.screens'], config)
  backupSyncedKeyFile(REPO_ROOT, 'admin.screens')

  const baseline = buildBaselineScreen()
  const worstcase = buildWorstCaseScreen()
  if (scenarioArg === 'baseline' || scenarioArg === 'both') await seedScreen(session, baseline)
  if (scenarioArg === 'worstcase' || scenarioArg === 'both') await seedScreen(session, worstcase)
  await new Promise((r) => setTimeout(r, 500)) // let the seed write flush before a fresh page loads it
  session.close()

  mkdirSync(RESULTS_DIR, { recursive: true })
  const results: BudgetCaptureResult[] = []

  if (scenarioArg === 'baseline' || scenarioArg === 'both') {
    const result = await captureScenario('baseline', baseline, { durationMs, sampleIntervalMs, headed, config })
    results.push(result)
    printSummary(result)
  }
  if (scenarioArg === 'worstcase' || scenarioArg === 'both') {
    const result = await captureScenario('worstcase', worstcase, { durationMs, sampleIntervalMs, headed, config })
    results.push(result)
    printSummary(result)
  }

  const reportPath = join(RESULTS_DIR, `${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
  writeFileSync(reportPath, JSON.stringify(results, null, 2))
  console.log(`\nSaved ${reportPath}`)

  if (results.length === 2) {
    const [b, w] = results
    console.log('\n=== worst case vs baseline delta ===')
    console.log(`Heap growth delta: ${((w.growth.jsHeapUsedBytes - b.growth.jsHeapUsedBytes) / 1_048_576).toFixed(2)} MB`)
    console.log(`DOM node growth delta: ${w.growth.domNodes - b.growth.domNodes}`)
    console.log(`Worst frame-drop delta: ${(w.worstRafDropPercent - b.worstRafDropPercent).toFixed(1)} pp`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
