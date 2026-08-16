/**
 * Scratchpad-only — the test plan's **C-t1**, measured on desktop.
 *
 * Times `html-to-image`'s `toBlob` — the exact call `screenPreviewCapture.ts` makes — against a live
 * kiosk render, at both a single pane's size and the full screen root. Desktop only, so this is a
 * **lower bound** on the TV: it can kill path C outright if it already exceeds the ~200ms budget here,
 * but it cannot clear it.
 *
 * The measured body is passed to `page.evaluate` as a plain source *string*, not a function — tsx
 * transpiles a function argument and injects an `__name` helper that does not exist in the page, so a
 * TypeScript callback fails at runtime with a bare `ReferenceError`. The library is loaded from the
 * repo's own `node_modules` UMD build rather than a CDN, so the measurement needs no network and is
 * pinned to the exact version the app itself uses.
 */
import { launch, BASE_URL } from './harness.mts'

const SCREEN_ID = process.argv[2] ?? '1783431536720'

const { browser, page } = await launch()
await page.goto(`${BASE_URL}/screens/${SCREEN_ID}?unattended=1`)
await page.locator('.split-layout').first().waitFor({ timeout: 20000 })
await page.waitForTimeout(4000)
await page.addScriptTag({ path: 'node_modules/html-to-image/dist/html-to-image.js' })

const results = await page.evaluate(`(async () => {
  var mod = window.htmlToImage;
  async function time(el, runs) {
    var samples = [];
    for (var i = 0; i < runs; i++) {
      var t0 = performance.now();
      await mod.toBlob(el, { pixelRatio: 1 });
      samples.push(performance.now() - t0);
    }
    samples.sort(function (a, b) { return a - b; });
    return Math.round(samples[Math.floor(samples.length / 2)]);
  }
  var root = document.querySelector('.split-layout');
  var panes = Array.prototype.slice.call(document.querySelectorAll('.split-layout__pane'));
  panes.sort(function (a, b) { return b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight; });
  var pane = panes[0];
  return {
    paneCount: panes.length,
    rootSize: root.clientWidth + 'x' + root.clientHeight,
    rootMedianMs: await time(root, 5),
    paneSize: pane ? pane.clientWidth + 'x' + pane.clientHeight : 'n/a',
    paneMedianMs: pane ? await time(pane, 5) : -1
  };
})()`)
console.log(JSON.stringify(results, null, 2))
await browser.close()
