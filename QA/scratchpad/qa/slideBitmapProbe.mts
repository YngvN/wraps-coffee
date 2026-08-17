/**
 * Scratchpad-only — not part of the app. In-page probe for the **`SlideBitmapLayer`** pipeline
 * (`slideBitmapStore` / `warmSlideBitmaps`), as opposed to `bitmapProbe.mts`, which reports on the
 * older viewport-raster `CatalogueBitmap` experiment and reads DOM this pipeline does not produce.
 *
 * Why a bitmap arm is uninterpretable without this (consolidated report fact 21, traps 1-4): a warm
 * pass that captured nothing, a store whose keys never match what the panes look up, and a layer that
 * mounts but whose image never decoded all produce frame numbers that look like *success* — a pane
 * rendering live measures as the baseline, and a blank capture measures better than either. So this
 * reports the three states separately rather than inferring them from timings.
 *
 * Also carries the per-capture cost (`window.__qaSlideBitmapTimings`), which is the one number the
 * investigation has never had: the report knows a full-screen capture costs 250ms on a 10-core desktop,
 * but not what one pane costs on this TV at `devicePixelRatio` 2 — and that decides whether captures
 * can be spread across idle dwells instead of a boot burst.
 *
 * Reports on change only, plus a heartbeat, since the interesting events are state transitions.
 *
 * Note the deliberate absence of backticks in the source string below — see the report's §10.
 */
export function slideBitmapProbeSource(postUrl: string): string {
  return `(() => {
  if (window.__qaSlideBitmapProbe) return;
  window.__qaSlideBitmapProbe = true;
  var POST_URL = ${JSON.stringify(postUrl)};
  var lastKey = '';
  var ticks = 0;

  function post(data) {
    try {
      fetch(POST_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'debug', data: data }),
        keepalive: true
      });
    } catch (e) {}
  }

  function report() {
    ticks++;
    var store = window.__qaSlideBitmaps ? window.__qaSlideBitmaps() : { size: -1, keys: [] };
    var timings = window.__qaSlideBitmapTimings ? window.__qaSlideBitmapTimings() : [];
    var layout = document.querySelector('.split-layout');
    var layers = Array.prototype.slice.call(document.querySelectorAll('.slide-bitmap-layer')).map(function (layer) {
      var img = layer.querySelector('img');
      var pane = layer.closest('[data-pane-id]');
      return {
        paneId: pane ? pane.getAttribute('data-pane-id') : null,
        complete: img ? img.complete : null,
        natural: img ? img.naturalWidth + 'x' + img.naturalHeight : 'none',
        paneBox: pane ? Math.round(pane.clientWidth) + 'x' + Math.round(pane.clientHeight) : null,
        scaleX: getComputedStyle(layer).getPropertyValue('--slide-bitmap-scale-x').trim(),
        scaleY: getComputedStyle(layer).getPropertyValue('--slide-bitmap-scale-y').trim()
      };
    });

    // How many panes are advertising themselves as capture candidates, and how many are in each of the
    // two hide states — a bitmap that never shows is usually a mismatch between these two sets.
    var reflowing = document.querySelectorAll('[data-pane-id][data-slide-reflows]').length;
    var bodyHidden = document.querySelectorAll('.split-layout__pane-content--body-hidden').length;
    var bodySkipped = document.querySelectorAll('.split-layout__pane-content--body-skipped').length;
    var layoutSkipped = document.querySelectorAll('.split-layout__pane-content--layout-skipped').length;

    var data = {
      phase: layout ? layout.getAttribute('data-content-phase') : null,
      stage: layout ? layout.getAttribute('data-stage') : null,
      storeSize: store.size,
      storeKeys: store.keys,
      captures: timings.length,
      // Summarised rather than dumped every tick — the full list rides along only when it grows.
      captureMsTotal: timings.reduce(function (sum, t) { return sum + t.captureMs; }, 0),
      layers: layers,
      reflowingPanes: reflowing,
      bodyHidden: bodyHidden,
      bodySkipped: bodySkipped,
      layoutSkipped: layoutSkipped
    };

    // The identity that decides whether this is a new state. Deliberately excludes the phase/stage,
    // which change constantly and would post every tick, but includes everything about the bitmaps.
    var key = JSON.stringify([data.storeSize, data.captures, data.layers, data.reflowingPanes, data.bodyHidden, data.bodySkipped, data.layoutSkipped]);
    if (key === lastKey && ticks % 20 !== 0) return;
    var changed = key !== lastKey;
    lastKey = key;
    data.reason = changed ? 'change' : 'heartbeat';
    // Timings are the expensive part of the payload, so they ride only on a change, and only once the
    // warm pass has actually produced some.
    if (changed && timings.length) data.timings = timings;
    post(data);
  }

  setInterval(report, 500);
  report();
})();`
}
