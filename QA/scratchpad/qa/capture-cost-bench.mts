/**
 * Scratchpad-only — decomposes what a `warmSlideBitmaps` capture actually spends its time on.
 *
 * Report fact 29 measured 4588-9542ms per pane on the TV and, decisively, that a **212x128** device-pixel
 * capture cost 4704ms against 8844ms for 960x1080 — 1/85th the pixels for 53% of the cost. So the cost is
 * not rasterisation. This prices the alternatives against the same live pane:
 *
 * - **`toSvg` vs `toBlob`** — `toSvg` clones the subtree, reads and inlines every element's computed
 *   style, embeds resources and serialises; `toBlob` additionally rasterises that SVG and PNG-encodes it.
 *   The gap between them is per-pixel work; `toSvg` itself is per-element work.
 * - **`skipFonts` vs `fontEmbedCSS`** — whether the ~70KB of inlined woff2 is re-parsed per capture.
 * - **`pixelRatio` 1 vs 2** — a direct 4x change in output pixels, nothing else.
 * - **element count** — the same pane geometry holding a small vs a full catalogue, via
 *   `emptytest-variant.mts`. This is the one that separates "big picture" from "many nodes".
 *
 * Reports the serialised SVG's own length too, since that is the intermediate every later step has to
 * parse, and it is a per-element quantity rather than a per-pixel one.
 *
 * Requires the temporary `window.__qaH2I` hook in `warmSlideBitmaps.ts` — `html-to-image` is bundled, so
 * there is no way to reach it from an injected probe.
 *
 * Usage:
 *   QA_BASE_URL=http://localhost:4173 npx tsx QA/scratchpad/qa/capture-cost-bench.mts <screenId> [stage]
 */
import { chromium } from 'playwright'
import { BASE_URL } from './harness.mts'

const SCREEN_ID = process.argv[2] ?? 'screen-4d546476-e34b-43d8-b17a-60a430eb48cd'
/** Which stage to settle on before capturing — `Empty test`'s catalogue only exists from stage 2. */
const STAGE = Number(process.argv[3] ?? 3)

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 960, height: 540 } })
await page.goto(`${BASE_URL}/screens/${SCREEN_ID}?unattended=1&stage=${STAGE}`, { waitUntil: 'domcontentloaded' })
// Long enough for fonts, data and the shrink search to settle — a capture of unsettled content would
// price a different DOM than the one that actually ships.
await page.waitForTimeout(12_000)

// Deliberately a string, not a function — `tsx`/esbuild wraps inner functions in its own `__name()`
// helper, which does not exist in the page, so a function body here dies with `__name is not defined`.
// See `body-still-check.mts`'s own note and the report's §10.
const result = await page.evaluate(`(async () => {
  var h2i = window.__qaH2I;
  if (!h2i) return { error: 'window.__qaH2I missing - the temporary hook in warmSlideBitmaps.ts is not in this build' };

  var pane = document.querySelector('[data-pane-id][data-slide-reflows]');
  if (!pane) return { error: 'no re-flowing pane on screen - wrong screen or wrong stage' };

  var width = pane.clientWidth;
  var height = pane.clientHeight;
  var elements = pane.querySelectorAll('*').length;
  var textNodes = 0;
  var walker = document.createTreeWalker(pane, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) textNodes++;

  var time = async function (label, run) {
    var start = performance.now();
    var bytes = 0;
    try {
      var out = await run();
      if (typeof out === 'string') bytes = out.length;
      else if (out && typeof out === 'object' && 'size' in out) bytes = out.size;
    } catch (error) {
      return { label: label, ms: -1, bytes: 0, error: String(error) };
    }
    return { label: label, ms: Math.round(performance.now() - start), bytes: bytes };
  };

  var fontStart = performance.now();
  var fontCss = await h2i.getFontEmbedCSS(pane, { preferredFontFormat: 'woff2' });
  var fontMs = Math.round(performance.now() - fontStart);

  // Ordered cheapest-first so a slow early step cannot be blamed on warm caches later on.
  var rows = [];
  rows.push(await time('toSvg   skipFonts        ', function () { return h2i.toSvg(pane, { width: width, height: height, cacheBust: false, skipFonts: true }); }));
  rows.push(await time('toSvg   +fontEmbedCSS    ', function () { return h2i.toSvg(pane, { width: width, height: height, cacheBust: false, fontEmbedCSS: fontCss }); }));
  rows.push(await time('toBlob  skipFonts  dpr 1 ', function () { return h2i.toBlob(pane, { width: width, height: height, cacheBust: false, pixelRatio: 1, skipFonts: true }); }));
  rows.push(await time('toBlob  skipFonts  dpr 2 ', function () { return h2i.toBlob(pane, { width: width, height: height, cacheBust: false, pixelRatio: 2, skipFonts: true }); }));
  rows.push(await time('toBlob  +fonts     dpr 2 ', function () { return h2i.toBlob(pane, { width: width, height: height, cacheBust: false, pixelRatio: 2, fontEmbedCSS: fontCss }); }));

  // A single empty div at the same box size - the floor for 'the pipeline itself', with no subtree to
  // clone and no styles to inline.
  var bare = document.createElement('div');
  bare.style.width = width + 'px';
  bare.style.height = height + 'px';
  bare.style.background = '#123456';
  document.body.appendChild(bare);
  rows.push(await time('toBlob  bare div   dpr 2 ', function () { return h2i.toBlob(bare, { width: width, height: height, cacheBust: false, pixelRatio: 2, skipFonts: true }); }));
  bare.remove();

  return { width: width, height: height, elements: elements, textNodes: textNodes, fontMs: fontMs, fontCssBytes: fontCss.length, rows: rows };
})()`)

await browser.close()

if ('error' in result && result.error) {
  console.log(`FAILED: ${result.error}`)
  process.exit(1)
}

const { width, height, elements, textNodes, fontMs, fontCssBytes, rows } = result as {
  width: number
  height: number
  elements: number
  textNodes: number
  fontMs: number
  fontCssBytes: number
  rows: { label: string; ms: number; bytes: number; error?: string }[]
}

console.log(`pane ${width}x${height} CSS  |  ${elements} elements, ${textNodes} text nodes`)
console.log(`getFontEmbedCSS: ${fontMs}ms, ${(fontCssBytes / 1024).toFixed(0)}KB (once per warm pass, not per capture)\n`)
for (const row of rows) console.log(`  ${row.label} ${String(row.ms).padStart(6)}ms   ${(row.bytes / 1024).toFixed(0).padStart(6)}KB${row.error ? `  ${row.error}` : ''}`)
