/**
 * Launches the real, unmodified `electron/main.cjs` entry point pointed at a seeded scenario screen
 * (via its existing `ADHDISPLAY_URL` env var hook) with `--remote-debugging-port`, optionally also
 * `--disable-features=CalculateNativeWinOcclusion` (P3.1) — then attaches over CDP and reuses the same
 * capture pipeline as `02-run-browser-trace.ts`. No changes to `electron/main.cjs` itself. Time-boxed
 * per the diagnostic spec — run with `--flag=on` and `--flag=off` and stop there.
 *
 * ⚠️ First Electron launch on a machine with no `server/data/display-role.json` yet shows a one-time,
 * blocking interactive setup wizard (a machine-label prompt, `electron/roleSetup.cjs`) — this script
 * does NOT automate that. Launch `npm run start:electron` once by hand first and click through it if
 * `server/data/display-role.json` doesn't already exist; every launch after that is unattended.
 *
 * ⚠️ Per this repo's CLAUDE.md, get explicit confirmation before running this against the live app.
 *
 * Usage:
 *   npx tsx diagnostics/pane-resize-stutter/scripts/03-run-electron-trace.ts --screenId=diag-pane-resize-as-is --flag=off
 *   npx tsx diagnostics/pane-resize-stutter/scripts/03-run-electron-trace.ts --screenId=diag-pane-resize-as-is --flag=on
 */
import { randomUUID } from 'node:crypto'
import { type ChildProcess, spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { startCdpTrace, writeTraceFile } from '../lib/cdpTrace'
import { computeRafDeltaSummary, installRafDeltaCollector, readRafDeltaTimestamps } from '../lib/rafDeltaCapture'
import { RESULTS_DIR, saveCaptureResult } from '../lib/resultsStore'
import { resolveServerUrls } from '../lib/seedClient'
import { summarizeAllTransitionWindows } from '../lib/traceParse'
import { installTransitionMarkers } from '../lib/transitionMarkers'
import { SCENARIO_VARIANTS, type CaptureResult, type ScenarioVariant } from '../types'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '..', '..', '..')
const DEFAULT_CAPTURE_DURATION_MS = 60_000
const DEFAULT_CDP_PORT = 9333
const DIAG_ID_PREFIX = 'diag-pane-resize-'

function parseArgs(argv: string[]) {
  const args = new Map<string, string>()
  for (const entry of argv) {
    const [key, ...rest] = entry.replace(/^--/, '').split('=')
    args.set(key, rest.join('='))
  }
  return args
}

async function waitForCdpPort(port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://localhost:${port}/json/version`)
      if (res.ok) return
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`Timed out waiting for Electron's CDP port ${port} — did the one-time setup wizard block startup? See this script's own doc comment.`)
}

function killElectron(child: ChildProcess): void {
  child.kill()
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const screenId = args.get('screenId')
  if (!screenId) throw new Error('--screenId is required')
  const flag = args.get('flag') === 'on'
  const durationMs = args.get('durationMs') ? Number(args.get('durationMs')) : DEFAULT_CAPTURE_DURATION_MS
  const port = args.get('port') ? Number(args.get('port')) : DEFAULT_CDP_PORT
  const variant = screenId.replace(DIAG_ID_PREFIX, '') as ScenarioVariant
  if (!SCENARIO_VARIANTS.includes(variant)) throw new Error(`Unexpected screenId "${screenId}"`)

  const { contentUrl } = resolveServerUrls({})
  const electronArgs = [`--remote-debugging-port=${port}`]
  if (flag) electronArgs.push('--disable-features=CalculateNativeWinOcclusion')

  console.log(`Launching electron/main.cjs (flag ${flag ? 'ON' : 'OFF'}) against ${screenId}...`)
  const child = spawn('npx', ['electron', 'electron/main.cjs', ...electronArgs], {
    cwd: REPO_ROOT,
    env: { ...process.env, ADHDISPLAY_URL: `${contentUrl}/screens/${screenId}?unattended=1` },
    stdio: 'inherit',
  })

  try {
    await waitForCdpPort(port, 60_000)
    const browser = await chromium.connectOverCDP(`http://localhost:${port}`)
    const context = browser.contexts()[0]
    const page = context.pages().find((candidate) => candidate.url().includes(screenId)) ?? context.pages()[0]
    if (!page) throw new Error('No page found on the connected Electron browser context')

    await page.evaluate(installRafDeltaCollector)
    await page.evaluate(installTransitionMarkers)
    const cdpCapture = await startCdpTrace(page)

    console.log(`Capturing ${durationMs}ms...`)
    await page.waitForTimeout(durationMs)

    const timestamps = await page.evaluate(readRafDeltaTimestamps)
    const rafDelta = computeRafDeltaSummary(timestamps)
    const trace = await cdpCapture.stop()
    const layoutWindows = summarizeAllTransitionWindows(trace)

    const id = `electron-${variant}-flag${flag ? 'On' : 'Off'}-${randomUUID().slice(0, 8)}`
    const tracePath = `${id}.trace.json`
    writeTraceFile(join(RESULTS_DIR, tracePath), trace)

    const result: CaptureResult = {
      id,
      timestamp: new Date().toISOString(),
      target: 'electron',
      variant,
      screenId,
      meta: { electronFlag: `CalculateNativeWinOcclusion=${flag ? 'off' : 'default'}` },
      rafDelta,
      layoutWindows,
      tracePath,
    }
    const savedPath = saveCaptureResult(result)
    console.log(`Saved ${savedPath}`)
    console.log(`rAF drop%: ${rafDelta.dropPercent.toFixed(1)} — note: with --flag=on this reflects occlusion-throttling behavior too, not layout cost alone (see the plan's own caveat).`)

    await browser.close()
  } finally {
    killElectron(child)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
