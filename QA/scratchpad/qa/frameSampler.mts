/**
 * Scratchpad-only — not part of the app. The in-page `requestAnimationFrame` frame-cost sampler,
 * kept as a plain source *string* so the exact same code can run in two very different places:
 *
 *  - desktop, injected by Playwright (`page.addInitScript`) — see `extreme-audit.mts`
 *  - the Android TV, injected into the built `dist/index.html` — see `tv-frame-run.mts`
 *
 * Running one implementation on both is the whole point: a CDP trace and Android's own `gfxinfo`
 * measure different things and can't be compared to each other, whereas this measures the identical
 * thing (the browser's own frame cadence) on both devices.
 *
 * It segments frames into *transitions* using `.split-layout`'s own `data-content-phase`/`data-stage`
 * attributes (see `SplitLayout.tsx`): a transition window opens the moment the phase leaves `'idle'`
 * and closes `TAIL_MS` after it returns, so the window covers the exit animation, the geometry
 * change, the borders growing back, *and* the new content sliding in.
 *
 * Reported per window: frame count, worst inter-frame delta, and how many deltas exceeded each of the
 * two budgets. Both budgets are reported always — the desktop panel refreshes at 60Hz (16.7ms) and
 * this TV at 50Hz (20ms), so neither number alone is comparable across the two.
 */

export interface FrameWindow {
  index: number
  fromStage: number
  toStage: number
  /** Wall-clock length of the sampled window, ms. */
  durationMs: number
  frames: number
  worstMs: number
  over16_7: number
  over20: number
  over33: number
  /** Mean inter-frame delta, ms — the plain "was the frame loop keeping up" number. */
  meanMs: number
  /** How far into the window the worst frame landed, ms — separates "the animation is expensive" from "one commit near the start/end is expensive and the animation is incidental". */
  worstAtMs: number
  /** Which `contentPhase` was in effect when the worst frame landed, for the same reason. */
  worstPhase: string
  /**
   * **The primary metric for mount-stall work.** Total time spent over budget *during `'holding'`
   * only* — `Σ (delta − BUDGET_MS)` across every frame in that phase whose delta exceeded it.
   *
   * Replaces `worstMs` as the number to compare variants on, for two reasons the 2026-08-15 report
   * ran into directly ("on the dense stages the run-to-run spread is wider than the difference
   * between the two columns"):
   *
   *  - **A sum is far more stable than a maximum.** `worstMs` is a single sample of a heavy-tailed
   *    distribution and moves hundreds of ms run to run on the same build; a sum over the whole
   *    phase averages that out and can actually resolve a 30% effect.
   *  - **Scoping to `'holding'` targets the thing being measured.** That is the phase the geometry
   *    commits and the new panes mount in — 13 of 21 worst frames landed there — so a whole-window
   *    number dilutes it with the exit animation and the content slide-in either side.
   *
   * `worstMs` stays alongside it, unchanged, as the number comparable to the existing report.
   */
  holdingDebtMs: number
  /** How many frames the `'holding'` phase lasted — context for `holdingDebtMs`, which would otherwise not distinguish "one very bad frame" from "many mildly bad ones". */
  holdingFrames: number
  /**
   * The same over-budget sum as `holdingDebtMs`, but split across **all three** phases plus the
   * post-`'idle'` tail.
   *
   * Added after the first TV run on a real screen (`Screen 3 (verify)`) contradicted the assumption
   * `holdingDebtMs` alone was built on. The 2026-08-15 report found 13 of 21 worst frames in
   * `'holding'` and concluded the mount was the whole cost; on a real screen only 5 of 23 landed
   * there, against 12 in `'exiting'` and 6 in `'idle'`. Those two are exactly the boundaries where
   * `LayoutPane`'s own `trackShrink` flips and every shrink-enabled pane re-runs its binary search in
   * one commit — so a holding-only metric is blind to most of the cost it was meant to measure.
   *
   * Keyed by the raw `data-content-phase` value, so a phase that is ever added shows up on its own
   * rather than being silently folded into another bucket.
   */
  debtByPhase: Record<string, number>
  /** Frame count per phase, same keying as `debtByPhase` — a phase's debt is uninterpretable without knowing how many frames it had to accumulate over. */
  framesByPhase: Record<string, number>
}

/**
 * Builds the sampler's own source. `postUrl` (optional) makes each completed window POST itself to a
 * collector (see `frame-collector.mts`) — omit it to only accumulate into `window.__qaFrameWindows`,
 * which is what the Playwright path reads directly.
 */
export function frameSamplerSource(postUrl?: string): string {
  return `(() => {
  if (window.__qaFrameSampler) return;
  window.__qaFrameSampler = true;
  window.__qaFrameWindows = [];
  var TAIL_MS = 700;
  // Held fixed at the *TV's* 50Hz budget on both devices deliberately — \`holdingDebtMs\` is meant to
  // be one quantity computed identically everywhere, the same reason this whole sampler exists as a
  // single shared source string. A desktop number computed against 16.7 would not be the same metric.
  var BUDGET_MS = 20;
  var POST_URL = ${postUrl ? JSON.stringify(postUrl) : 'null'};
  var deltas = [];
  var marks = [];
  var last = 0;
  var open = null;
  var closeAt = 0;
  var index = 0;

  function root() { return document.querySelector('.split-layout'); }

  function finish() {
    if (!open) return;
    var w = {
      index: open.index,
      fromStage: open.fromStage,
      toStage: Number((root() && root().getAttribute('data-stage')) || open.fromStage),
      durationMs: Math.round(performance.now() - open.startedAt),
      frames: deltas.length,
      worstMs: deltas.length ? Math.round(Math.max.apply(null, deltas) * 10) / 10 : 0,
      over16_7: deltas.filter(function (d) { return d > 16.7; }).length,
      over20: deltas.filter(function (d) { return d > 20; }).length,
      over33: deltas.filter(function (d) { return d > 33; }).length,
      meanMs: deltas.length ? Math.round((deltas.reduce(function (a, b) { return a + b; }, 0) / deltas.length) * 10) / 10 : 0,
      worstAtMs: 0,
      worstPhase: '-',
      holdingDebtMs: 0,
      holdingFrames: 0,
      debtByPhase: {},
      framesByPhase: {}
    };
    // Compared against the *raw* max, not \`w.worstMs\` — that is rounded to one decimal and can round
    // *up* past every real delta, in which case no mark ever matched and \`worstPhase\` silently
    // reported '-'. Which phase the worst frame landed in is the single most load-bearing field here
    // (it is what attributes the cost to the mount rather than to an animation), so it must never
    // depend on a rounding direction.
    var rawWorst = deltas.length ? Math.max.apply(null, deltas) : 0;
    for (var i = 0; i < marks.length; i++) {
      if (marks[i][0] >= rawWorst) { w.worstAtMs = marks[i][1]; w.worstPhase = marks[i][2]; }
      var phaseKey = marks[i][2] || '?';
      w.framesByPhase[phaseKey] = (w.framesByPhase[phaseKey] || 0) + 1;
      if (marks[i][0] > BUDGET_MS) w.debtByPhase[phaseKey] = (w.debtByPhase[phaseKey] || 0) + (marks[i][0] - BUDGET_MS);
    }
    for (var key in w.debtByPhase) w.debtByPhase[key] = Math.round(w.debtByPhase[key]);
    w.holdingDebtMs = w.debtByPhase['holding'] || 0;
    w.holdingFrames = w.framesByPhase['holding'] || 0;
    window.__qaFrameWindows.push(w);
    if (POST_URL) {
      try { fetch(POST_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(w), keepalive: true }); } catch (e) {}
    }
    open = null;
    deltas = [];
    marks = [];
  }

  function tick(now) {
    requestAnimationFrame(tick);
    var el = root();
    var phase = el ? el.getAttribute('data-content-phase') : null;
    if (phase && phase !== 'idle' && !open) {
      index += 1;
      open = { index: index, fromStage: Number((el && el.getAttribute('data-stage')) || 0), startedAt: now };
      deltas = [];
      marks = [];
      last = now;
      closeAt = 0;
      return;
    }
    if (open) {
      if (last) { deltas.push(now - last); marks.push([now - last, Math.round(now - open.startedAt), phase || '?']); }
      last = now;
      if (phase === 'idle') {
        // The tail: the geometry has settled but the borders are still growing back and the new
        // content is still sliding in, which is exactly where the cost of an animated transition
        // would show up. Re-armed (not just set once) so a phase that briefly flickers back to idle
        // mid-sequence doesn't cut the window short.
        if (!closeAt) closeAt = now + TAIL_MS;
        if (now >= closeAt) finish();
      } else {
        closeAt = 0;
      }
      return;
    }
    last = now;
  }
  requestAnimationFrame(tick);
})();`
}

/** One stage transition's own geometry/identity result — see `transitionSamplerSource`. */
export interface TransitionSample {
  index: number
  fromStage: number
  toStage: number
  /**
   * The worst pane's *fraction* of its total move completed in the first 80ms after the geometry
   * commit, as a percentage. ~100 means it jumped the entire distance in one frame (a snap); a low
   * number means it is genuinely easing. Deliberately a fraction rather than a pixel count so it
   * doesn't change meaning when the animation's duration does, and so it is comparable between two
   * architectures whose animations are not the same length.
   */
  snapPercent: number
  /** How far that worst pane travelled in total, px — context for `snapPercent`, which is meaningless for a pane that barely moved. */
  totalPx: number
  /** Which pane that was. */
  snapPane: string
  /** Panes present both before and after that kept the same DOM element. */
  survived: number
  /** Panes present both before and after that React tore down and rebuilt — the remount bug. */
  remounted: number
  /** Worst |border position − the pane edge it should be sitting on| seen through the transition, px. */
  borderErrorPx: number
}

/**
 * The geometry/identity half of the audit, as an in-page sampler.
 *
 * Driven entirely by `.split-layout`'s own `data-content-phase` rather than by the harness clicking a
 * "next step" button, for two reasons: it works unchanged on the **read-only kiosk route** (which has
 * no such button, and which is the only surface the flat pane layer actually takes over), and it
 * samples at the exact commit the geometry changes instead of at a wall-clock guess about when that
 * will be.
 *
 * Two measurement details matter for comparing the two architectures fairly:
 *
 *  - **Visible, not layout, rects.** The flat path deliberately moves a pane's layout box to its
 *    destination immediately and animates a `clip-path` reveal instead (see `paneRectMotion`), and
 *    `getBoundingClientRect` doesn't account for clipping — so a raw box measurement would report a
 *    correctly-animating pane as a hard snap. `visibleRect` applies the element's own computed
 *    `clip-path` inset, which is what the eye actually sees, and reduces to the plain box on the
 *    nested-grid path where nothing is clipped.
 *  - **Architecture-independent border error.** The old check read `grid-template-columns` off each
 *    border's parent, which doesn't exist in the flat path at all. This instead asks the question both
 *    paths owe the same answer to: is this line sitting on a real pane edge right now?
 */
export function transitionSamplerSource(): string {
  return `(() => {
  if (window.__qaTransitionSampler) return;
  window.__qaTransitionSampler = true;
  window.__qaTransitions = [];
  var index = 0;
  var pending = null;
  var lastPhase = 'idle';

  function root() { return document.querySelector('.split-layout'); }

  function visibleRect(el) {
    var r = el.getBoundingClientRect();
    var clip = getComputedStyle(el).clipPath || 'none';
    var m = /inset\\(([^)]+)\\)/.exec(clip);
    if (!m) return { x: r.x, y: r.y, w: r.width, h: r.height };
    var parts = m[1].trim().split(/\\s+/).map(function (v) {
      if (v.indexOf('%') >= 0) return { pct: parseFloat(v) };
      return { px: parseFloat(v) };
    });
    while (parts.length < 4) parts.push(parts[parts.length - 1]);
    var top = parts[0].pct !== undefined ? (parts[0].pct / 100) * r.height : parts[0].px;
    var right = parts[1].pct !== undefined ? (parts[1].pct / 100) * r.width : parts[1].px;
    var bottom = parts[2].pct !== undefined ? (parts[2].pct / 100) * r.height : parts[2].px;
    var left = parts[3].pct !== undefined ? (parts[3].pct / 100) * r.width : parts[3].px;
    return { x: r.x + left, y: r.y + top, w: Math.max(0, r.width - left - right), h: Math.max(0, r.height - top - bottom) };
  }

  function rects() {
    var out = {};
    Array.prototype.forEach.call(document.querySelectorAll('[data-pane-id]'), function (el) {
      out[el.getAttribute('data-pane-id')] = visibleRect(el);
    });
    return out;
  }

  function stamp() {
    var out = {};
    Array.prototype.forEach.call(document.querySelectorAll('[data-pane-id]'), function (el, i) {
      var token = 'q' + Date.now() + '_' + i;
      el.dataset.qaIdentity = token;
      out[el.getAttribute('data-pane-id')] = token;
    });
    return out;
  }

  function identityCheck(before) {
    var survived = 0, remounted = 0;
    Array.prototype.forEach.call(document.querySelectorAll('[data-pane-id]'), function (el) {
      var id = el.getAttribute('data-pane-id');
      if (!(id in before)) return;
      if (el.dataset.qaIdentity === before[id]) survived += 1; else remounted += 1;
    });
    return { survived: survived, remounted: remounted };
  }

  // Is each border line sitting on a real pane edge right now? Asked this way so it means the same
  // thing under nested grids and under absolutely-positioned panes.
  function borderError() {
    var panes = Array.prototype.map.call(document.querySelectorAll('[data-pane-id]'), visibleRect);
    var worst = 0;
    Array.prototype.forEach.call(document.querySelectorAll('.split-border-line'), function (el) {
      var r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      var vertical = r.height >= r.width;
      var center = vertical ? r.x + r.width / 2 : r.y + r.height / 2;
      var best = Infinity;
      panes.forEach(function (p) {
        var overlap = vertical
          ? Math.min(r.y + r.height, p.y + p.h) - Math.max(r.y, p.y)
          : Math.min(r.x + r.width, p.x + p.w) - Math.max(r.x, p.x);
        if (overlap <= 1) return;
        var edges = vertical ? [p.x, p.x + p.w] : [p.y, p.y + p.h];
        edges.forEach(function (e) { best = Math.min(best, Math.abs(center - e)); });
      });
      if (best !== Infinity && best > worst) worst = best;
    });
    return worst;
  }

  function watch() {
    var el = root();
    var phase = el ? el.getAttribute('data-content-phase') : null;
    if (!el || !phase) { requestAnimationFrame(watch); return; }

    if (lastPhase === 'idle' && phase !== 'idle') {
      index += 1;
      // Captured before the tree changes, so this is genuinely the *old* geometry — the baseline both
      // the "how far did it move in 80ms" and the "how far did it move in total" numbers measure from.
      pending = { index: index, fromStage: Number(el.getAttribute('data-stage')), stamps: stamp(), preRects: rects(), borderErrorPx: 0, done: false };
    }
    if (pending && lastPhase !== 'holding' && phase === 'holding') {
      // The geometry commit itself. Sample now and again a beat later: an animating pane has barely
      // moved in between, a snapping one has already travelled its whole distance.
      var pre = pending.preRects;
      var openPending = pending;
      var ident = identityCheck(openPending.stamps);
      setTimeout(function () {
        var early = rects();
        // Sampled once the animation has certainly finished, so the total is the real distance each
        // pane travelled rather than just a second point on the same curve.
        setTimeout(function () {
          var settled = rects();
          var worstFraction = 0, worstTotal = 0, who = '-';
          Object.keys(settled).forEach(function (id) {
            if (!pre[id] || !early[id]) return;
            var dist = function (a, b) {
              return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.w - b.w) + Math.abs(a.h - b.h);
            };
            var total = dist(settled[id], pre[id]);
            // Below this a pane simply didn't move, and a fraction of nothing is noise, not a snap.
            if (total < 24) return;
            var fraction = dist(early[id], pre[id]) / total;
            if (fraction > worstFraction) { worstFraction = fraction; worstTotal = total; who = id; }
          });
          window.__qaTransitions.push({
            index: openPending.index, fromStage: openPending.fromStage, toStage: Number(root().getAttribute('data-stage')),
            snapPercent: Math.round(Math.min(1, worstFraction) * 100), totalPx: Math.round(worstTotal), snapPane: who,
            survived: ident.survived, remounted: ident.remounted, borderErrorPx: 0, _ref: openPending
          });
          openPending.done = true;
        }, 1200);
      }, 80);
    }
    if (pending && !pending.done) pending.borderErrorPx = Math.max(pending.borderErrorPx, borderError());
    if (pending && pending.done && phase !== 'idle') pending.borderErrorPx = Math.max(pending.borderErrorPx, borderError());
    // Fold the running border error back onto the published record until the transition fully settles.
    window.__qaTransitions.forEach(function (t) {
      if (t._ref) t.borderErrorPx = Math.round(t._ref.borderErrorPx * 10) / 10;
    });
    if (pending && pending.done && phase === 'idle') pending = null;

    lastPhase = phase;
    requestAnimationFrame(watch);
  }
  requestAnimationFrame(watch);
})();`
}
