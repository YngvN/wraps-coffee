/**
 * P4.2 — connects over CDP to the TV WebView (via an `adb forward`'d debug socket, see
 * `05-tv-webview-inspect.sh`) and reuses the same capture pipeline as `02-run-browser-trace.ts`/
 * `03-run-electron-trace.ts`. Needs a DEBUG build of the companion app installed on the TV (release
 * builds have WebView debugging off) — see the plan's TV/adb design decision, and the split from
 * `06-tv-frame-stats.sh` (which runs against the release build instead).
 *
 * ⚠️ `connectOverCDP` against an adb-forwarded WebView debug socket is expected to work (the same
 * protocol `chrome://inspect` speaks) but wasn't empirically confirmed for this exact WebView build
 * before writing this script — if it fails to attach, fall back to one manual `chrome://inspect`
 * recording, same posture the plan already gives P2.4.
 *
 * ⚠️ Per this repo's CLAUDE.md, get explicit confirmation before running this against the live app.
 *
 * Usage (after running 05-tv-webview-inspect.sh and its printed `adb forward` command):
 *   npx tsx diagnostics/pane-resize-stutter/scripts/07-tv-cdp-trace.ts --screenId=diag-pane-resize-as-is --port=9222
 */
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { startCdpTrace, writeTraceFile } from '../lib/cdpTrace'
import { computeRafDeltaSummary, installRafDeltaCollector, readRafDeltaTimestamps } from '../lib/rafDeltaCapture'
import { RESULTS_DIR, saveCaptureResult } from '../lib/resultsStore'
import { summarizeAllTransitionWindows } from '../lib/traceParse'
import { installTransitionMarkers } from '../lib/transitionMarkers'
import { SCENARIO_VARIANTS, type CaptureResult, type ScenarioVariant } from '../types'

const DEFAULT_CAPTURE_DURATION_MS = 60_000
const DEFAULT_LOCAL_PORT = 9222
const DIAG_ID_PREFIX = 'diag-pane-resize-'

function parseArgs(argv: string[]) {
  const args = new Map<string, string>()
  for (const entry of argv) {
    const [key, ...rest] = entry.replace(/^--/, '').split('=')
    args.set(key, rest.join('='))
  }
  return args
}

async function waitForCdpReachable(port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://localhost:${port}/json/version`)
      if (res.ok) return
    } catch {
      // not forwarded/reachable yet
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`Timed out reaching http://localhost:${port}/json/version — is the adb forward from 05-tv-webview-inspect.sh's output still active?`)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const screenId = args.get('screenId')
  if (!screenId) throw new Error('--screenId is required')
  const port = args.get('port') ? Number(args.get('port')) : DEFAULT_LOCAL_PORT
  const durationMs = args.get('durationMs') ? Number(args.get('durationMs')) : DEFAULT_CAPTURE_DURATION_MS
  const variant = screenId.replace(DIAG_ID_PREFIX, '') as ScenarioVariant
  if (!SCENARIO_VARIANTS.includes(variant)) throw new Error(`Unexpected screenId "${screenId}"`)

  console.log(`Waiting for CDP endpoint at localhost:${port} (run 05-tv-webview-inspect.sh's printed adb forward command first if you haven't)...`)
  await waitForCdpReachable(port, 30_000)

  const browser = await chromium.connectOverCDP(`http://localhost:${port}`)
  const context = browser.contexts()[0]
  const page = context.pages().find((candidate) => candidate.url().includes(screenId)) ?? context.pages()[0]
  if (!page) throw new Error(`No page found on the connected TV WebView — is the companion app currently showing ${screenId}?`)
  console.log(`Attached to: ${page.url()}`)

  await page.evaluate(installRafDeltaCollector)
  await page.evaluate(installTransitionMarkers)
  const cdpCapture = await startCdpTrace(page)

  console.log(`Capturing ${durationMs}ms...`)
  await page.waitForTimeout(durationMs)

  const timestamps = await page.evaluate(readRafDeltaTimestamps)
  const rafDelta = computeRafDeltaSummary(timestamps)
  const trace = await cdpCapture.stop()
  const layoutWindows = summarizeAllTransitionWindows(trace)

  const id = `tv-webview-${variant}-${randomUUID().slice(0, 8)}`
  const tracePath = `${id}.trace.json`
  writeTraceFile(join(RESULTS_DIR, tracePath), trace)

  const result: CaptureResult = {
    id,
    timestamp: new Date().toISOString(),
    target: 'tv-webview',
    variant,
    screenId,
    meta: { buildType: 'debug' },
    rafDelta,
    layoutWindows,
    tracePath,
  }
  const savedPath = saveCaptureResult(result)
  console.log(`Saved ${savedPath}`)
  console.log(`rAF drop%: ${rafDelta.dropPercent.toFixed(1)} (${rafDelta.droppedFrames}/${rafDelta.frameCount} frames)`)

  await browser.close()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
