/**
 * Scratchpad-only — not part of the app. A one-off in-page probe for the `CatalogueBitmap` arm
 * (2026-08-17), reporting what that component's own capture actually produced.
 *
 * Exists because the TV runs a release build with no attachable DevTools (see the consolidated
 * kiosk-performance report's §1), and a *failed* or *blank* capture is indistinguishable from a
 * successful one by frame numbers alone — a capture that silently fell back to the live DOM would
 * reproduce the baseline exactly, and a capture that produced an empty bitmap would look like a huge
 * win while actually rendering nothing. Both are numbers with the opposite of their apparent meaning,
 * so the arm is uninterpretable without this.
 *
 * Reports, once a second: the host's own `data-catalogue-bitmap` status, whether an `<img>` or the
 * live raster tree is mounted, the bitmap's decoded dimensions and data-URL length (a blank PNG
 * compresses to a few hundred bytes, a real catalogue to tens of KB — which is the single most
 * diagnostic number here), and the live tree's own child count.
 *
 * Note the deliberate absence of backticks in the source string below — see the report's §10.
 */
export function bitmapProbeSource(postUrl: string): string {
  return `(() => {
  if (window.__qaBitmapProbe) return;
  window.__qaBitmapProbe = true;
  var POST_URL = ${JSON.stringify(postUrl)};
  var lastKey = '';

  function report() {
    var host = document.querySelector('.catalogue-bitmap');
    var data;
    if (!host) {
      data = { host: 'absent' };
    } else {
      var img = host.querySelector('.catalogue-bitmap__image');
      var raster = host.querySelector('.catalogue-bitmap__raster');
      var slide = host.querySelector('.catalogue-slide');
      data = {
        status: host.getAttribute('data-catalogue-bitmap'),
        // Length of the inlined @font-face CSS the capture actually used — 0 or absent means the
        // bitmap rasterised in a fallback typeface. See CatalogueBitmap's ensureFontEmbedCss.
        fontCssBytes: host.getAttribute('data-catalogue-font-css'),
        scale: getComputedStyle(host).getPropertyValue('--catalogue-raster-scale').trim(),
        hostBox: Math.round(host.clientWidth) + 'x' + Math.round(host.clientHeight),
        showing: img ? 'img' : (raster ? 'live' : 'neither'),
        imgNatural: img ? img.naturalWidth + 'x' + img.naturalHeight : null,
        imgComplete: img ? img.complete : null,
        // The load-bearing number: a blank PNG is tiny, a real catalogue is tens of KB.
        urlBytes: img && img.src ? img.src.length : null,
        liveChildren: slide ? slide.childElementCount : null,
        liveScrollH: raster ? raster.scrollHeight : null
      };
    }
    var key = JSON.stringify(data);
    // Only post on change — this runs for the whole run and the interesting events are the
    // transitions between states, not a per-second repeat of a steady one.
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
