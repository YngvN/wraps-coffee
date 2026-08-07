/**
 * Playwright capture against a seeded scenario screen — P1.2/P2.1/P2.2/P2.3. Always captures the
 * canonical rAF-delta metric (`lib/rafDeltaCapture.ts`); additionally captures a raw CDP trace +
 * injected transition markers (`lib/cdpTrace.ts`/`lib/transitionMarkers.ts`) for Chromium only, since
 * CDP is Chromium-specific — see the plan's Playwright-harness design decision.
 *
 * ⚠️ Per this repo's CLAUDE.md, get explicit confirmation before running this against the live app —
 * it drives real browser automation.
 *
 * Usage:
 *   npx tsx diagnostics/pane-resize-stutter/scripts/02-run-browser-trace.ts --browser=chromium --screenId=diag-pane-resize-as-is
 *   npx tsx diagnostics/pane-resize-stutter/scripts/02-run-browser-trace.ts --browser=firefox --screenId=diag-pane-resize-textblock --durationMs=30000
 */
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { chromium, firefox } from 'playwright'
import { startCdpTrace, writeTraceFile } from '../lib/cdpTrace'
import { computeRafDeltaSummary, installRafDeltaCollector, readRafDeltaTimestamps } from '../lib/rafDeltaCapture'
import { RESULTS_DIR, saveCaptureResult } from '../lib/resultsStore'
import { DIAG_ID_PREFIX, resolveServerUrls } from '../lib/seedClient'
import { summarizeAllTransitionWindows } from '../lib/traceParse'
import { installTransitionMarkers } from '../lib/transitionMarkers'
import { SCENARIO_VARIANTS, type CaptureResult, type ScenarioVariant } from '../types'

const DEFAULT_CAPTURE_DURATION_MS = 60_000

function parseArgs(argv: string[]) {
  const args = new Map<string, string>()
  for (const entry of argv) {
    const [key, ...rest] = entry.replace(/^--/, '').split('=')
    args.set(key, rest.join('='))
  }
  return args
}

function variantFromScreenId(screenId: string): ScenarioVariant {
  const suffix = screenId.replace(DIAG_ID_PREFIX, '') as ScenarioVariant
  if (!SCENARIO_VARIANTS.includes(suffix)) throw new Error(`Can't infer scenario variant from screenId "${screenId}" — expected one of ${SCENARIO_VARIANTS.map((v) => `${DIAG_ID_PREFIX}${v}`).join(', ')}`)
  return suffix
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const browserName = args.get('browser') === 'firefox' ? 'firefox' : 'chromium'
  const screenId = args.get('screenId')
  if (!screenId) throw new Error('--screenId is required')
  const durationMs = args.get('durationMs') ? Number(args.get('durationMs')) : DEFAULT_CAPTURE_DURATION_MS
  const variant = variantFromScreenId(screenId)
  const { contentUrl } = resolveServerUrls({ host: args.get('host'), contentPort: args.get('contentPort') ? Number(args.get('contentPort')) : undefined })

  const browserType = browserName === 'firefox' ? firefox : chromium
  const browser = await browserType.launch()
  const page = await browser.newPage()
  await page.goto(`${contentUrl}/screens/${screenId}?unattended=1`)
  await page.evaluate(installRafDeltaCollector)

  const isChromium = browserName === 'chromium'
  if (isChromium) await page.evaluate(installTransitionMarkers)
  const cdpCapture = isChromium ? await startCdpTrace(page) : undefined

  console.log(`Capturing ${durationMs}ms of ${browserName} against ${screenId}...`)
  await page.waitForTimeout(durationMs)

  const timestamps = await page.evaluate(readRafDeltaTimestamps)
  const rafDelta = computeRafDeltaSummary(timestamps)

  const id = `${browserName}-${variant}-${randomUUID().slice(0, 8)}`
  let tracePath: string | undefined
  let layoutWindows: ReturnType<typeof summarizeAllTransitionWindows> | undefined
  if (cdpCapture) {
    const trace = await cdpCapture.stop()
    layoutWindows = summarizeAllTransitionWindows(trace)
    tracePath = `${id}.trace.json`
    writeTraceFile(join(RESULTS_DIR, tracePath), trace)
  }

  await browser.close()

  const result: CaptureResult = {
    id,
    timestamp: new Date().toISOString(),
    target: browserName,
    variant,
    screenId,
    meta: {},
    rafDelta,
    layoutWindows,
    tracePath,
  }
  const savedPath = saveCaptureResult(result)
  console.log(`Saved ${savedPath}`)
  console.log(`rAF drop%: ${rafDelta.dropPercent.toFixed(1)} (${rafDelta.droppedFrames}/${rafDelta.frameCount} frames)`)
  if (layoutWindows) console.log(`Transition windows captured: ${layoutWindows.length}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
