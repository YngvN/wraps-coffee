/**
 * Scratchpad-only — not part of the app. Reports `useShrinkToFitFontScale`'s own per-run counters
 * (`window.__qaShrinkStats`, published by that hook while `TRUST_WARM_SCALE` is on).
 *
 * Exists because arm H measured **flat** twice — 680ms total debt against arm F's 700ms, with `idle`
 * unmoved at ~600 — while ablating the same hook outright takes the whole run to 80ms/80ms. Frame
 * numbers cannot distinguish the two explanations for that:
 *
 *  - the store fast path is firing, and skipping the probes simply is not where the cost is; or
 *  - the store fast path never fires at all (a key that never matches, or a warm-up that populated
 *    nothing), so the arm was never actually under test.
 *
 * Both produce identical medians, and the second is the one the report's §10 keeps warning about —
 * an arm that silently measured the baseline. `storeSize` plus the `fastPath`/`storeMiss` split
 * answers it directly.
 *
 * Reports cumulative counters once a second, posting only when something changed. Note the deliberate
 * absence of backticks in the source string below — see the report's §10.
 */
export function shrinkStatsProbeSource(postUrl: string): string {
  return `(() => {
  if (window.__qaShrinkStatsProbe) return;
  window.__qaShrinkStatsProbe = true;
  var POST_URL = ${JSON.stringify(postUrl)};
  var lastKey = '';

  function report() {
    var data;
    if (typeof window.__qaShrinkStats !== 'function') {
      // The hook publishes this only while TRUST_WARM_SCALE is on, so an absent reading is itself
      // the answer: this build is not the arm you think you are measuring.
      data = { stats: 'absent' };
    } else {
      data = window.__qaShrinkStats();
    }
    var key = JSON.stringify(data);
    if (key === lastKey) return;
    lastKey = key;
    try {
      fetch(POST_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'debug', data: data }),
        keepalive: true
      });
    } catch (e) {}
  }

  setInterval(report, 1000);
  report();
})();`
}
