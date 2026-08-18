/**
 * Scratchpad-only — catches the frames where a bitmap-backed pane is showing **neither** its picture nor
 * a correctly-hidden live subtree.
 *
 * Written for a report that stage 2 of `Empty test` stutters while every other stage is clean, against
 * frame data that says 1->2 is not an outlier at all (40ms/20ms, the same as the rest). A stutter the
 * frame sampler cannot see is a *visual* discontinuity rather than a slow frame, and the candidate here
 * is specific: `LayoutPane` looks the bitmap up by (stage, contentFingerprint), and those two values do
 * not necessarily change in the same commit. `stage` flips when `displayStage` does; the fingerprint
 * follows `useCrossfadeSlot`'s own active-slot flip. Any frame where the new stage is paired with the old
 * content's fingerprint is a **miss**, and a miss means `restingBitmap` is false — which un-hides the live
 * subtree and exposes an unshrunk 350-element catalogue for as long as it lasts.
 *
 * 1->2 is the only transition on that fixture where the pane's content identity changes at all (stage 1
 * is an image, stages 2-11 are the same catalogue), which is exactly why it would be the only one
 * affected.
 *
 * Records per animation frame: the stage and phase, the published `data-slide-identity`, whether the
 * bitmap layer is mounted, and how many slots carry `--bitmap-backed`. Then prints every state change, so
 * a one-frame exposure is visible rather than averaged away.
 *
 * Usage:
 *   QA_BASE_URL=http://localhost:4173 npx tsx QA/scratchpad/qa/bitmap-swap-check.mts <screenId> [runMs]
 */
import { chromium } from 'playwright'
import { BASE_URL } from './harness.mts'

const SCREEN_ID = process.argv[2] ?? 'screen-4d546476-e34b-43d8-b17a-60a430eb48cd'
const RUN_MS = Number(process.argv[3] ?? 90_000)

interface Sample {
  t: number
  stage: string | null
  phase: string | null
  identity: string | null
  layer: boolean
  backed: number
  slots: number
  /** Whether any slot's live subtree is currently laid out — the thing that must never be true while the picture is absent. */
  liveVisible: boolean
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 960, height: 540 } })

// A string, not a function — see `body-still-check.mts` on `__name is not defined`.
await page.addInitScript({
  content: `(() => {
  var samples = [];
  var PANE_ID = 'pane-165995c1-7fb3-41b9-b8ed-957daf274735';
  window.__swapSamples = samples;
  var tick = function () {
    var layout = document.querySelector('.split-layout');
    // Selected by id, not by [data-slide-reflows]: that attribute is absent at stage 1 (the pane holds an
    // image there), which would blind this to the exact transition under test.
    var pane = document.querySelector('[data-pane-id="' + PANE_ID + '"]');
    if (pane) {
      var slots = pane.querySelectorAll('.split-layout__pane-content');
      var backed = pane.querySelectorAll('.split-layout__pane-content--bitmap-backed').length;
      var liveVisible = false;
      for (var i = 0; i < slots.length; i++) {
        var inner = slots[i].querySelector('.split-layout__pane-content-inner');
        if (!inner) continue;
        // Test a DESCENDANT, never the inner element itself: an element with content-visibility: hidden still
        // generates its own box - it is its *contents* that are skipped. Checking the element reports
        // every hidden pane as visible, which is the same class of mistake as reading a body's own
        // computed opacity while an ancestor does the hiding (report fact 30).
        var child = inner.firstElementChild;
        if (child && child.getClientRects().length > 0) liveVisible = true;
      }
      samples.push({
        t: performance.now(),
        stage: layout ? layout.getAttribute('data-stage') : null,
        phase: layout ? layout.getAttribute('data-content-phase') : null,
        identity: pane.getAttribute('data-slide-identity'),
        layer: Boolean(pane.querySelector('.slide-bitmap-layer')),
        backed: backed,
        slots: slots.length,
        liveVisible: liveVisible
      });
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})();`,
})

await page.goto(`${BASE_URL}/screens/${SCREEN_ID}?unattended=1`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(RUN_MS)
const samples = (await page.evaluate(() => (window as unknown as { __swapSamples: Sample[] }).__swapSamples)) as Sample[]
await browser.close()

console.log(`samples: ${samples.length}`)

const key = (s: Sample) => `${s.stage}|${s.phase}|${s.identity}|${s.layer}|${s.backed}|${s.slots}|${s.liveVisible}`
let last = ''
let runStart = 0
const states: { sample: Sample; frames: number; ms: number }[] = []
for (let i = 0; i < samples.length; i++) {
  const k = key(samples[i])
  if (k !== last) {
    if (last) states.push({ sample: samples[i - 1], frames: i - runStart, ms: Math.round(samples[i - 1].t - samples[runStart].t) })
    last = k
    runStart = i
  }
}

// Only the transitions themselves are interesting; a settled stage repeats one state for seconds.
const bad = states.filter((s) => s.sample.liveVisible && !s.sample.layer)
// Only the stages around the reported jump - a settled stage repeats one state for seconds.
for (const state of states.filter((s) => s.sample.stage === '1' || s.sample.stage === '2').slice(0, 40)) {
  const s = state.sample
  const flag = s.liveVisible && !s.layer ? '  <<< LIVE SUBTREE EXPOSED, NO BITMAP' : ''
  console.log(
    `stage ${String(s.stage).padStart(2)} ${String(s.phase).padEnd(8)} id=${String(s.identity).padEnd(7)} layer=${String(s.layer).padEnd(5)} backed=${s.backed} slots=${s.slots} live=${String(s.liveVisible).padEnd(5)} ${String(state.frames).padStart(3)}f ${String(state.ms).padStart(5)}ms${flag}`,
  )
}
console.log(`\n${bad.length === 0 ? 'PASS' : 'FAIL'} — ${bad.length} state(s) with the live subtree exposed and no bitmap`)
