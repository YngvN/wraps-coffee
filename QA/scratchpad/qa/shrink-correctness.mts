/**
 * Scratchpad-only — correctness check for any shrink-to-fit mechanism.
 *
 * A replacement mechanism must not change *what* scale a pane resolves to, only how many forced
 * layouts it costs to get there. This walks a fixture while it cycles its stages and records, per
 * (pane, stage):
 *
 *  - **overflow** on both axes — the invariant the search guarantees. A pane overflowing means the
 *    mechanism returned too large a scale.
 *  - **slack** — how much empty room is left below the content. A mechanism returning a scale far
 *    *too small* leaves every pane fitting comfortably and would pass an overflow-only check
 *    silently, which is exactly the failure mode an async/seeded mechanism is prone to.
 *  - **the resolved scale itself** — the scaled `--slide-item-title-size` on
 *    `.split-layout__pane-content-inner` over its own base value on `.split-layout__pane-content`.
 *    Written out as JSON so an arm can be diffed against a baseline run rather than merely asserted
 *    against an invariant.
 *
 * Usage:
 *   npx tsx QA/scratchpad/qa/shrink-correctness.mts [screenId] [runMs] [outPath]
 *   QA_BASELINE=<baseline.json> npx tsx QA/scratchpad/qa/shrink-correctness.mts ...   # diff mode
 *
 * Only samples while `.split-layout[data-content-phase]` is `idle` — a measurement taken mid-
 * transition is meaningless (the geometry is still animating and the outgoing crossfade slot is
 * still mounted), and including those was the easiest way to produce noise that looks like a
 * regression.
 */
import { writeFileSync, readFileSync, existsSync } from 'node:fs'
import { launch, BASE_URL } from './harness.mts'

const SCREEN_ID = process.argv[2] ?? '1783715372380'
const RUN_MS = Number(process.argv[3] ?? 30_000)
const OUT_PATH = process.argv[4] ?? `QA/scratchpad/qa/shrink-scales-${SCREEN_ID}.json`
const BASELINE_PATH = process.env.QA_BASELINE

/** How far an arm's resolved scale may drift from baseline's before it counts as a finding rather than noise. */
const SCALE_DRIFT_TOLERANCE = 0.05

/** Subpixel rounding in the layout itself — an overflow at or under this is not a real overflow. */
const OVERFLOW_TOLERANCE_PX = 2

interface Sample {
  key: string
  pane: string
  stage: string
  kind: string
  scale: number
  overflowH: number
  overflowW: number
  slackPct: number
  boxH: number
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

const { browser, page } = await launch()
await page.goto(`${BASE_URL}/screens/${SCREEN_ID}?unattended=1`)
await page.locator('.split-layout').first().waitFor({ timeout: 20000 })

// Kept as a template-literal probe (no backticks inside — see the consolidated report's own trap
// list) so it can be lifted into an injected on-device probe later without rewriting it.
const PROBE = `
  (function () {
    var root = document.querySelector('.split-layout');
    if (!root || root.getAttribute('data-content-phase') !== 'idle') return [];
    var stage = root.getAttribute('data-stage') || '?';
    var SHRINK_KINDS = ['transit-slide', 'weather-slide', 'catalogue-slide', 'event-month-slide'];

    function sizeOf(el) {
      var raw = getComputedStyle(el).getPropertyValue('--slide-item-title-size').trim();
      var m = /^([\\d.]+)cqmin$/.exec(raw);
      return m ? parseFloat(m[1]) : null;
    }

    // Both crossfade slots stay mounted (see useCrossfadeSlot) and the outgoing one keeps rendering
    // the PREVIOUS stage's slide indefinitely, holding a stale scale. Opacity alone cannot tell them
    // apart: the 'slide' transition style keeps opacity 1 in all three poses (see transitions.ts's
    // slideVariants) and moves the outgoing slot off with an x/y transform instead. The active slot
    // is therefore the one that is BOTH fully opaque AND resting at an identity transform. Reading
    // only opacity attributed every stale slide to whatever stage happened to be current, which is
    // how this probe first reported a transit pane at a stage whose content is 'none'.
    function isActiveSlot(outer) {
      var cs = getComputedStyle(outer);
      if ((parseFloat(cs.opacity) || 0) < 0.99) return false;
      var t = cs.transform;
      if (!t || t === 'none') return true;
      var nums = t.replace(/^matrix(3d)?\\(/, '').replace(/\\)$/, '').split(',').map(parseFloat);
      // Translation components: matrix() puts them last (indices 4,5); matrix3d() at 12,13.
      var tx = nums.length > 6 ? nums[12] : nums[4];
      var ty = nums.length > 6 ? nums[13] : nums[5];
      return Math.abs(tx) < 1 && Math.abs(ty) < 1;
    }

    var best = {};
    Array.prototype.forEach.call(document.querySelectorAll('.split-layout__pane-content'), function (outer) {
      if (!isActiveSlot(outer)) return;
      var inner = outer.firstElementChild;
      var measured = inner && inner.firstElementChild ? inner.firstElementChild : inner;
      if (!measured) return;
      var kind = SHRINK_KINDS.filter(function (k) { return measured.classList.contains(k); })[0];
      if (!kind) return;
      var paneEl = outer.closest('[data-pane-id]');
      var pane = paneEl ? paneEl.getAttribute('data-pane-id') : '?';

      var base = sizeOf(outer);
      var scaled = sizeOf(inner);
      best[pane] = {
        row: {
          key: pane + '@' + stage,
          pane: pane,
          stage: stage,
          kind: kind,
          scale: base && scaled ? scaled / base : 1,
          overflowH: measured.scrollHeight - outer.clientHeight,
          // Only the two kinds LayoutPane opts into checkWidth for can legitimately overflow
          // sideways; for the others the width axis has its own CSS fallback and is not a failure.
          overflowW: (kind === 'event-month-slide' || kind === 'weather-slide') ? measured.scrollWidth - outer.clientWidth : 0,
          slackPct: outer.clientHeight > 0 ? Math.round((1 - measured.scrollHeight / outer.clientHeight) * 100) : 0,
          boxH: outer.clientHeight
        }
      };
    });

    return Object.keys(best).map(function (k) { return best[k].row; });
  })()
`

const samples: Sample[] = []
const deadline = Date.now() + RUN_MS
while (Date.now() < deadline) {
  await page.waitForTimeout(1500)
  const rows = (await page.evaluate(PROBE)) as Sample[]
  samples.push(...rows)
}
await browser.close()

// ---------- aggregate ----------

const byKey = new Map<string, Sample[]>()
for (const s of samples) {
  const list = byKey.get(s.key)
  if (list) list.push(s)
  else byKey.set(s.key, [s])
}

interface Aggregate {
  pane: string
  stage: string
  kind: string
  scale: number
  scaleMin: number
  scaleMax: number
  worstOverflowH: number
  worstOverflowW: number
  slackPct: number
  n: number
}

const aggregates: Record<string, Aggregate> = {}
for (const [key, list] of [...byKey.entries()].sort()) {
  const scales = list.map((s) => s.scale)
  aggregates[key] = {
    pane: list[0].pane,
    stage: list[0].stage,
    kind: list[0].kind,
    scale: Number(median(scales).toFixed(4)),
    scaleMin: Number(Math.min(...scales).toFixed(4)),
    scaleMax: Number(Math.max(...scales).toFixed(4)),
    worstOverflowH: Math.max(...list.map((s) => s.overflowH)),
    worstOverflowW: Math.max(...list.map((s) => s.overflowW)),
    slackPct: median(list.map((s) => s.slackPct)),
    n: list.length,
  }
}

writeFileSync(OUT_PATH, JSON.stringify({ screenId: SCREEN_ID, capturedAt: new Date().toISOString(), samples: samples.length, panes: aggregates }, null, 2))

// ---------- report ----------

console.log(`\n${samples.length} idle-phase pane snapshots across ${Object.keys(aggregates).length} (pane, stage) pairs → ${OUT_PATH}\n`)
/** Pane ids are long uuids — shorten for the console table only; the JSON keeps them in full. */
const short = (key: string) => key.replace(/^pane-([0-9a-f]{8})[0-9a-f-]*/, 'pane-$1')

console.log('pane@stage'.padEnd(20) + 'kind'.padEnd(20) + 'scale'.padEnd(22) + 'slack'.padEnd(8) + 'n'.padEnd(5) + 'overflow H/W')
for (const [key, a] of Object.entries(aggregates)) {
  const range = a.scaleMin === a.scaleMax ? '' : ` [${a.scaleMin}–${a.scaleMax}]`
  const overflow = `${a.worstOverflowH}px / ${a.worstOverflowW}px`
  console.log(short(key).padEnd(20) + a.kind.padEnd(20) + `${a.scale}${range}`.padEnd(22) + `${a.slackPct}%`.padEnd(8) + String(a.n).padEnd(5) + overflow)
}

const overflowing = Object.entries(aggregates).filter(([, a]) => a.worstOverflowH > OVERFLOW_TOLERANCE_PX || a.worstOverflowW > OVERFLOW_TOLERANCE_PX)
console.log('')
if (overflowing.length === 0) console.log('PASS — no shrink-enabled pane overflowed its box on either axis')
else {
  console.log(`FAIL — ${overflowing.length} overflowing (pane, stage) pair(s):`)
  for (const [key, a] of overflowing) console.log(`  ${short(key)}: H +${a.worstOverflowH}px, W +${a.worstOverflowW}px (at scale ${a.scale})`)
}

// ---------- baseline diff ----------

if (BASELINE_PATH) {
  if (!existsSync(BASELINE_PATH)) {
    console.log(`\nno baseline at ${BASELINE_PATH} — skipping diff`)
  } else {
    const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf-8')) as { panes: Record<string, Aggregate> }
    const drifted: string[] = []
    const missing: string[] = []
    for (const [key, base] of Object.entries(baseline.panes)) {
      const arm = aggregates[key]
      if (!arm) {
        missing.push(key)
        continue
      }
      const drift = Math.abs(arm.scale - base.scale) / (base.scale || 1)
      if (drift > SCALE_DRIFT_TOLERANCE) drifted.push(`  ${key}: baseline ${base.scale} → arm ${arm.scale} (${(drift * 100).toFixed(1)}% drift)`)
    }
    console.log(`\nbaseline diff vs ${BASELINE_PATH}`)
    if (missing.length) console.log(`  ${missing.length} (pane, stage) pair(s) present in baseline but not sampled here: ${missing.join(', ')}`)
    if (drifted.length === 0) console.log(`  PASS — every pane within ${SCALE_DRIFT_TOLERANCE * 100}% of baseline's resolved scale`)
    else {
      console.log(`  FAIL — ${drifted.length} pane(s) drifted more than ${SCALE_DRIFT_TOLERANCE * 100}%:`)
      for (const line of drifted) console.log(line)
    }
  }
}
