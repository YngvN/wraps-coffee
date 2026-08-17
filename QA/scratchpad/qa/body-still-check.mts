/**
 * Scratchpad-only — answers the one question `body-split-check.mts` explicitly cannot: **was a slide's
 * body ever visible while its own pane box was actually moving?**
 *
 * `body-split-check.mts`'s own doc comment names this limitation — it flags every `'holding'` state with
 * a visible body, including the correct ones (a `stageStatic` pane whose box does not change is
 * *supposed* to stay visible with no fade), so its failures need a human to sort. This measures the
 * thing itself instead: per pane, per animation frame, the box and the body's own computed opacity
 * together, and reports frames where the box moved while the body was still visible.
 *
 * That pairing is the whole point. A body fading over a still box is correct. A still body over a
 * moving box is correct. A *visible* body over a *moving* box is the artefact `reflowHide` exists to
 * prevent (consolidated report fact 24's second half), and it is invisible to both frame numbers and
 * screenshots — the state lasts a few hundred ms and an `adb` screencap lands on it only by luck.
 *
 * Sampling runs **in-page on `requestAnimationFrame`**, not over CDP: a per-sample round trip misses
 * most of a 300ms window, which is how the existing check ends up with a handful of "distinct states"
 * rather than a timeline. Note the sampler calls `getBoundingClientRect` every frame, which forces a
 * layout per frame — fine for a correctness check, and the reason this must never be used as a
 * performance instrument.
 *
 * **The sampler is a source *string*, not a function passed to `addInitScript`.** Handing Playwright a
 * function serialises it via `toString()`, and `tsx`/esbuild has by then wrapped every inner function in
 * its own `__name()` name-preservation helper — which does not exist in the page. The result is a
 * single `__name is not defined` page error, a sampler that never runs, and a check that reports zero
 * samples and therefore **PASS**: a green result meaning nothing was measured at all. Same class of
 * silent no-op as the report's §10 traps, and the same reason the injected TV probes are built as
 * strings. If this ever prints an implausibly low sample count, that is the failure to look for.
 *
 * Usage:
 *   QA_BASE_URL=http://localhost:4173 npx tsx QA/scratchpad/qa/body-still-check.mts <screenId> [runMs]
 */
import { chromium } from 'playwright'
import { BASE_URL } from './harness.mts'

const SCREEN_ID = process.argv[2] ?? 'screen-624ebb7c-9fb9-493c-86c5-ac2baa8d5210'
const RUN_MS = Number(process.argv[3] ?? 75_000)

/** Box deltas below this are layout jitter/sub-pixel rounding, not movement — matching why `REFLOW_HIDE_THRESHOLD` is 0.02 rather than 0. */
const MOVE_EPSILON_PX = 0.75
/** Effective opacity at or below this counts as "not visible". */
const VISIBLE_EPSILON = 0.02

/**
 * One frame's observation of one slide body.
 *
 * **Visibility here is *effective*, not the body's own computed style**, because three different
 * mechanisms hide a body in this codebase and only one of them shows up on the element itself:
 *
 * - the body-only path writes `opacity`/`content-visibility` onto the body — visible on the element;
 * - the whole-slot path writes `content-visibility: hidden` onto an **ancestor**, which leaves the
 *   descendant's own computed `content-visibility` at `visible` and its `opacity` at 1 while the subtree
 *   is not rendered at all;
 * - the `'slide'` transition style **translates** the slot with `opacity` held at 1 in all three poses
 *   (report fact 25's neighbourhood), so an off-box slot reads as fully opaque.
 *
 * Reading the body's own computed opacity therefore reports a hidden pane as visible, which is exactly
 * the false failure the first version of this check produced. So: `rects` catches the not-rendered case
 * (a `content-visibility: hidden` subtree has no boxes at all), `effOpacity` multiplies every ancestor
 * opacity up to the pane, and `overlap` is the fraction of the body's own area that actually falls
 * inside its pane, which is what catches a translated slot.
 */
interface Sample {
  t: number
  paneId: string | null
  /** The pane's own box — the thing whose movement is under test. */
  w: number
  h: number
  /** Product of every opacity from the body up to and including the pane. */
  effOpacity: number
  /** Whether the body generates any boxes at all. `false` means it is not rendered. */
  rects: boolean
  /** Fraction of the body's own rect that lies inside the pane's rect. */
  overlap: number
  phase: string | null
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 960, height: 540 } })

// Deliberately a string — see this file's own doc comment on `__name is not defined`.
await page.addInitScript({
  content: `(() => {
  var samples = [];
  window.__bodySamples = samples;
  var tick = function () {
    var layout = document.querySelector('.split-layout');
    var phase = layout ? layout.getAttribute('data-content-phase') : null;
    var bodies = Array.prototype.slice.call(document.querySelectorAll('[data-slide-body]'));
    for (var i = 0; i < bodies.length; i++) {
      var body = bodies[i];
      var pane = body.closest('[data-pane-id]');
      if (!pane) continue;
      var rect = pane.getBoundingClientRect();
      var bodyRect = body.getBoundingClientRect();
      // Effective opacity: every ancestor up to and including the pane multiplies in. A slot faded to 0
      // leaves its descendants' own computed opacity at 1, so only the product is meaningful.
      var effOpacity = 1;
      var node = body;
      while (node) {
        var style = getComputedStyle(node);
        effOpacity *= parseFloat(style.opacity);
        if (style.visibility === 'hidden' || style.contentVisibility === 'hidden' || style.display === 'none') effOpacity = 0;
        if (node === pane) break;
        node = node.parentElement;
      }
      // How much of the body actually lands inside its own pane — a translated slot (the 'slide'
      // transition style holds opacity 1 in every pose) is off-box rather than transparent.
      var overlapW = Math.max(0, Math.min(rect.right, bodyRect.right) - Math.max(rect.left, bodyRect.left));
      var overlapH = Math.max(0, Math.min(rect.bottom, bodyRect.bottom) - Math.max(rect.top, bodyRect.top));
      var bodyArea = bodyRect.width * bodyRect.height;
      samples.push({
        t: performance.now(),
        paneId: pane.getAttribute('data-pane-id'),
        w: Math.round(rect.width * 10) / 10,
        h: Math.round(rect.height * 10) / 10,
        effOpacity: Math.round(effOpacity * 1000) / 1000,
        rects: body.getClientRects().length > 0,
        overlap: bodyArea > 0 ? Math.round((overlapW * overlapH / bodyArea) * 100) / 100 : 0,
        phase: phase
      });
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})();`,
})

await page.goto(`${BASE_URL}/screens/${SCREEN_ID}?unattended=1`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(RUN_MS)
const samples = (await page.evaluate(() => (window as unknown as { __bodySamples: Sample[] }).__bodySamples)) as Sample[]
await browser.close()

console.log(`samples: ${samples.length} over ${RUN_MS}ms`)

const byPane = new Map<string, Sample[]>()
for (const sample of samples) {
  const key = sample.paneId ?? 'unknown'
  if (!byPane.has(key)) byPane.set(key, [])
  byPane.get(key)!.push(sample)
}

let totalViolations = 0
for (const [paneId, paneSamples] of byPane) {
  let movingFrames = 0
  let violations = 0
  let worstOpacityWhileMoving = 0
  let biggestMove = 0
  /** Which `contentPhase` the violating frames landed in — the whole diagnosis, since each phase implies a different unfixed path (see `LayoutPane`'s `suppressEnter`/`stageStatic`/`reflowHide`). */
  const violationsByPhase = new Map<string, number>()
  const movingByPhase = new Map<string, number>()
  /** Time from the last frame the box moved to the first frame the body was visible again — the release lag the fix is meant to create. */
  const releaseLags: number[] = []
  let lastMoveAt: number | null = null

  for (let i = 1; i < paneSamples.length; i++) {
    const prev = paneSamples[i - 1]
    const now = paneSamples[i]
    const delta = Math.max(Math.abs(now.w - prev.w), Math.abs(now.h - prev.h))
    // All three conditions, per `Sample`: rendered at all, not faded out, and actually inside its pane.
    const visible = now.rects && now.effOpacity > VISIBLE_EPSILON && now.overlap > 0.05
    if (delta > MOVE_EPSILON_PX) {
      movingFrames++
      biggestMove = Math.max(biggestMove, delta)
      lastMoveAt = now.t
      const phase = now.phase ?? 'none'
      movingByPhase.set(phase, (movingByPhase.get(phase) ?? 0) + 1)
      if (visible) {
        violations++
        violationsByPhase.set(phase, (violationsByPhase.get(phase) ?? 0) + 1)
        worstOpacityWhileMoving = Math.max(worstOpacityWhileMoving, now.effOpacity)
      }
    } else if (lastMoveAt !== null && visible) {
      releaseLags.push(Math.round(now.t - lastMoveAt))
      lastMoveAt = null
    }
  }

  totalViolations += violations
  const lag = releaseLags.length ? `${Math.min(...releaseLags)}-${Math.max(...releaseLags)}ms (n=${releaseLags.length})` : 'never released while still'
  // Consecutive moving frames grouped into episodes, so "the box moved for 600ms starting in idle" is
  // distinguishable from "the box moved on 40 scattered single frames" — those need different fixes.
  interface Episode {
    startPhase: string
    startedAt: number
    endedAt: number
    visibleFrames: number
    frames: number
    span: number
  }
  const episodes: Episode[] = []
  let current: Episode | null = null
  for (let i = 1; i < paneSamples.length; i++) {
    const prev = paneSamples[i - 1]
    const now = paneSamples[i]
    const delta = Math.max(Math.abs(now.w - prev.w), Math.abs(now.h - prev.h))
    const visible = now.rects && now.effOpacity > VISIBLE_EPSILON && now.overlap > 0.05
    if (delta > MOVE_EPSILON_PX) {
      if (!current) current = { startPhase: now.phase ?? 'none', startedAt: now.t, endedAt: now.t, visibleFrames: 0, frames: 0, span: 0 }
      current.endedAt = now.t
      current.frames++
      if (visible) current.visibleFrames++
    } else if (current && now.t - current.endedAt > 120) {
      current.span = Math.round(current.endedAt - current.startedAt)
      episodes.push(current)
      current = null
    }
  }

  const perPhase = [...movingByPhase.entries()].map(([phase, moving]) => `${phase}: ${violationsByPhase.get(phase) ?? 0}/${moving}`).join('  ')
  console.log(
    `${paneId}\n` +
      `  frames where the box moved: ${movingFrames} (largest single-frame move ${biggestMove.toFixed(1)}px)\n` +
      `  of those, body was VISIBLE:  ${violations}${violations ? `  worst opacity ${worstOpacityWhileMoving.toFixed(3)}` : ''}\n` +
      `  visible/moving by phase:     ${perPhase}\n` +
      `  release lag after last move: ${lag}\n` +
      `  movement episodes (first 6): ${episodes
        .slice(0, 6)
        .map((e) => `[@${Math.round(e.startedAt - paneSamples[0].t)}ms ${e.startPhase} ${e.span}ms ${e.visibleFrames}/${e.frames} visible]`)
        .join(' ')}`,
  )
}

console.log(`\n${totalViolations === 0 ? 'PASS' : 'FAIL'} — ${totalViolations} frames with a visible body over a moving box`)
