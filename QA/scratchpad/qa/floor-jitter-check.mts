// Verifies the 'floor' jitter fix in useShrinkToFitFontScale.ts: pins the editor to stage 3 (so the
// pane-1a58563b catalogue pane stays mounted at rest, with no stage-rotation remounts to contaminate
// the sample — the read-only kiosk route's own 3s-per-stage rotation cycled this same leaf id through
// unrelated content on other stages, which the first version of this check didn't account for and
// produced a noisy false positive), then samples its own applied --slide-item-title-size (cqmin) on
// every animation frame. Before the fix, the 2s safety poll's re-derivation painted a single frame at
// MIN_SCALE (1% of base) before climbing back — this looks for exactly that dip.
//
// Usage: QA_BASE_URL=http://localhost:4173 npx tsx QA/scratchpad/qa/floor-jitter-check.mts [runMs]
import { chromium } from 'playwright'

const BASE_URL = process.env.QA_BASE_URL ?? 'http://localhost:4173'
const SCREEN_ID = 'screen-624ebb7c-9fb9-493c-86c5-ac2baa8d5210' // "Ny test"
const PANE_ID = 'pane-1a58563b-66c6-4ece-a537-b90beac0bb18' // catalogue pane, stage 3
const RUN_MS = Number(process.argv[2] ?? 10000)

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
page.setDefaultTimeout(15000)

await page.goto(`${BASE_URL}/admin/login`)
await page.locator('#admin-username').fill('admin')
await page.locator('#admin-password').fill('1234')
await page.locator('form.admin-login__form button[type="submit"]').click()
await page.waitForURL('**/admin/dashboard/**', { timeout: 20000 })

await page.goto(`${BASE_URL}/screens/editor/${SCREEN_ID}`)
await page.waitForTimeout(2000)

// Pause auto-rotation, then scrub 1 -> 2 -> 3, and pin there for the whole sampling window.
const controls = page.locator('.stage-playback-controls button')
const playState = await controls.nth(1).getAttribute('aria-label')
if (playState && !/play/i.test(playState)) await controls.nth(1).click()
await page.waitForTimeout(200)
await controls.nth(2).click()
await page.waitForTimeout(400)
await controls.nth(2).click()
await page.waitForTimeout(4500) // let the stage-3 transition settle before sampling starts

// A source STRING, not a function reference — tsx/esbuild wraps inner named functions (like `tick`
// below) in a `__name()` name-preservation helper that does not exist in the page, so a function
// reference here dies silently/loudly with `__name is not defined`. See QA report §10.
const samplerSource = `(() => {
  const paneId = ${JSON.stringify(PANE_ID)}
  const runMs = ${RUN_MS}
  return new Promise((resolve) => {
    const out = []
    const deadline = performance.now() + runMs
    function tick() {
      const pane = document.querySelector('[data-pane-id="' + paneId + '"] .split-layout__pane-content-inner')
      if (pane) {
        const raw = pane.style.getPropertyValue('--slide-item-title-size').trim()
        const match = /^([\\d.]+)cqmin$/.exec(raw)
        if (match) out.push({ t: performance.now(), v: parseFloat(match[1]) })
      }
      if (performance.now() < deadline) requestAnimationFrame(tick)
      else resolve(out)
    }
    requestAnimationFrame(tick)
  })
})()`

const samples = (await page.evaluate(samplerSource)) as { t: number; v: number }[]

await browser.close()

if (samples.length === 0) {
  console.log('NO SAMPLES — pane not found or --slide-item-title-size never set (check pane id / stage)')
  process.exit(1)
}

const values = samples.map((s) => s.v)
const min = Math.min(...values)
const max = Math.max(...values)
const settled = values[values.length - 1]
console.log(`samples: ${samples.length}, min: ${min.toFixed(4)}, max: ${max.toFixed(4)}, settled(last): ${settled.toFixed(4)}`)

// Compact time series: one line whenever the value CHANGES, with the elapsed ms — shows the actual
// shape (a steady climb? a repeating sawtooth? how often does it move at all?) instead of just min/max.
let prev: number | null = null
for (const s of samples) {
  if (prev === null || s.v !== prev) {
    console.log(`  t=${s.t.toFixed(0)}ms v=${s.v.toFixed(4)}`)
    prev = s.v
  }
}

// MIN_SCALE = 0.01 of the item-title base (5.5cqmin default) => ~0.055cqmin — miles below anything a
// legitimate converged/converging value could read once content fits within the "preferred" range
// ([MIN_LEGIBLE_SCALE, 1] = [0.5, 1] of base, i.e. [2.75, 5.5]cqmin here). Flag anything under 1cqmin
// as a floor-collapse frame, not just "below the settled value" (a mid-search climb is legitimate).
const collapsed = samples.filter((s) => s.v < 1)
console.log(`frames below 1cqmin (near-MIN_SCALE collapse): ${collapsed.length}`)
if (collapsed.length > 0) {
  console.log('  offending samples:', collapsed.slice(0, 10).map((s) => `t=${s.t.toFixed(0)}ms v=${s.v.toFixed(4)}`).join('; '))
}
// Also report any *change* at all after the value first reaches the settled baseline, to catch a
// smaller-magnitude dip that still isn't a legitimate part of the initial convergence.
const firstSettledIdx = values.findIndex((v) => v === settled)
const afterFirstSettle = values.slice(firstSettledIdx)
const driftAfterSettle = afterFirstSettle.some((v) => v !== settled)
console.log(`value drifts at all after first reaching ${settled.toFixed(4)}: ${driftAfterSettle ? 'YES' : 'NO'}`)

console.log(collapsed.length === 0 ? 'PASS — no collapse-to-floor frame observed' : 'FAIL — a collapse frame was observed')
