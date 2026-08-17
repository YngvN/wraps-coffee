/**
 * Scratchpad-only — records, per animation frame, exactly which element is painting a pane's backdrop
 * through a stage transition.
 *
 * Written for a report that `Ny test`'s 1→2 shows the *wrong* background on the transit pane — a colour
 * belonging to a later stage rather than the transit's own `#8f250c` stretching with the box. That is a
 * question about paint order and slot lifetime, and neither `debtByPhase` nor a screencap can answer it:
 * a transition lasts ~0.7s and a screencap lands on it by luck, while the frame sampler measures cost
 * rather than appearance.
 *
 * So this samples the pane's whole backdrop stack per frame: every `.split-layout__pane-content` slot
 * (which is what actually paints a slot's own background — see `LayoutPane.tsx`'s `PaneContentSnapshot`),
 * its computed background-colour, its effective opacity and transform, and whether it is still inside the
 * pane's box at all. Two slots are mounted during a crossfade, so "which one is visible right now" is the
 * entire question.
 *
 * Usage:
 *   QA_BASE_URL=http://localhost:4173 npx tsx QA/scratchpad/qa/pane-backdrop-check.mts <paneId> [runMs]
 */
import { chromium } from 'playwright'
import { BASE_URL } from './harness.mts'

const SCREEN_ID = 'screen-624ebb7c-9fb9-493c-86c5-ac2baa8d5210'
const PANE_ID = process.argv[2] ?? 'pane-1a58563b-66c6-4ece-a537-b90beac0bb18'
const RUN_MS = Number(process.argv[3] ?? 60_000)

interface Slot {
  bg: string
  opacity: string
  transform: string
  /** Fraction of the slot's own rect that still falls inside the pane — a translated slot reads as opacity 1 but is off-box. */
  inPane: number
  innerBox: string
  innerTransform: string
}
interface Sample {
  t: number
  stage: string | null
  phase: string | null
  paneBox: string
  slots: Slot[]
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 960, height: 540 } })

// A string, not a function — see `body-still-check.mts` on `__name is not defined`.
await page.addInitScript({
  content: `(() => {
  var samples = [];
  var PANE_ID = ${JSON.stringify(PANE_ID)};
  window.__backdropSamples = samples;
  var tick = function () {
    var layout = document.querySelector('.split-layout');
    var pane = document.querySelector('[data-pane-id="' + PANE_ID + '"]');
    if (pane && layout) {
      var paneRect = pane.getBoundingClientRect();
      var slots = Array.prototype.slice.call(pane.querySelectorAll('.split-layout__pane-content')).map(function (slot) {
        var style = getComputedStyle(slot);
        var rect = slot.getBoundingClientRect();
        var ow = Math.max(0, Math.min(paneRect.right, rect.right) - Math.max(paneRect.left, rect.left));
        var oh = Math.max(0, Math.min(paneRect.bottom, rect.bottom) - Math.max(paneRect.top, rect.top));
        var area = rect.width * rect.height;
        var inner = slot.querySelector('.split-layout__pane-content-inner');
        var innerStyle = inner ? getComputedStyle(inner) : null;
        return {
          bg: style.backgroundColor,
          opacity: style.opacity,
          transform: style.transform === 'none' ? 'none' : 'set',
          inPane: area > 0 ? Math.round((ow * oh / area) * 100) / 100 : 0,
          innerBox: inner ? Math.round(inner.clientWidth) + 'x' + Math.round(inner.clientHeight) : 'none',
          innerTransform: innerStyle ? (innerStyle.transform === 'none' ? 'none' : innerStyle.transform) : 'none'
        };
      });
      samples.push({
        t: performance.now(),
        stage: layout.getAttribute('data-stage'),
        phase: layout.getAttribute('data-content-phase'),
        paneBox: Math.round(paneRect.width) + 'x' + Math.round(paneRect.height),
        slots: slots
      });
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})();`,
})

await page.goto(`${BASE_URL}/screens/${SCREEN_ID}?unattended=1`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(RUN_MS)
const samples = (await page.evaluate(() => (window as unknown as { __backdropSamples: Sample[] }).__backdropSamples)) as Sample[]
await browser.close()

console.log(`samples: ${samples.length}`)
const key = (s: Sample) => `${s.stage}|${s.phase}|${s.paneBox}|${s.slots.map((slot) => `${slot.bg}/${slot.opacity}/${slot.transform}/${slot.inPane}/${slot.innerBox}`).join(' + ')}`
let last = ''
for (const sample of samples) {
  const k = key(sample)
  if (k === last) continue
  last = k
  console.log(
    `stage ${String(sample.stage).padStart(2)} ${String(sample.phase).padEnd(8)} pane ${sample.paneBox.padStart(9)}  ` +
      sample.slots.map((slot) => `[bg ${slot.bg} op ${slot.opacity} tf ${slot.transform} inPane ${slot.inPane} inner ${slot.innerBox}]`).join(' '),
  )
}
