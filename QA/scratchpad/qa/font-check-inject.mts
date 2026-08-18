/**
 * Scratchpad-only — one-off diagnostic, not part of the app. The TV's catalogue pane resolves a
 * visibly smaller shrink-to-fit scale (fewer rows fit) than desktop Chromium does at the identical
 * 960x540 CSS viewport, even right after a fresh app relaunch (ruling out search-state drift). The
 * leading remaining theory: the self-hosted Quicksand body font (`$font-sans`, `font-display: swap`
 * in the 804KB generated `dist/fonts/google-fonts.css`) either loads slower or fails outright on the
 * TV's WebView, so `useShrinkToFitFontScale`'s very first `fitsAt()` measurements — and possibly every
 * one after, if it never actually swaps in — run against a wider/taller fallback font (`system-ui`,
 * `Roboto`), which neither `ResizeObserver` nor `MutationObserver` would ever notice (a font swap is
 * neither a box-size change nor a DOM mutation), and the periodic poll's own re-derive would keep
 * confirming as correct-for-that-font. This is un-checkable without device DevTools, so it's injected
 * into the built `dist/index.html` and posted to `frame-collector.mts`'s generic `{kind:'debug'}` sink,
 * same pattern as `tv-inject-sampler.mts`.
 *
 * Usage: npx tsx QA/scratchpad/qa/font-check-inject.mts <collector-origin>
 *   e.g. npx tsx QA/scratchpad/qa/font-check-inject.mts http://192.168.0.213:4999
 */
import { readFileSync, writeFileSync } from 'node:fs'

const MARKER = '<!-- qa-font-check -->'
const INDEX = 'dist/index.html'

const collector = process.argv[2]
if (!collector) throw new Error('usage: font-check-inject.mts <collector-origin>')

const html = readFileSync(INDEX, 'utf-8')
if (html.includes(MARKER)) {
  console.log('[inject] already injected — rebuild first to start clean')
  process.exit(0)
}

const probe = `
(function () {
  function report(data) {
    fetch(${JSON.stringify(collector)}, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'debug', data: data }),
    }).catch(function () {})
  }
  // The item title is an <h2> with no explicit font-family of its own — it inherits the GLOBAL h2
  // rule (\`global.scss\`), which is $font-subheading = 'Pangolin', a cursive handwriting font, NOT
  // $font-sans/Quicksand as first assumed. Checking Pangolin specifically this time. The allergen/
  // description <p> tags below it use the plain body font ($font-sans/Quicksand) via inheritance,
  // checked too for completeness.
  var lastKey = null
  function sample() {
    var el = document.querySelector('.catalogue-slide__item h2')
    if (!el) return
    var pStyle = el.closest('.catalogue-slide__item') ? getComputedStyle(el.closest('.catalogue-slide__item').querySelector('p')) : null
    var pangolinFamilies = []
    var quicksandFamilies = []
    document.fonts.forEach(function (f) {
      if (f.family.indexOf('Pangolin') !== -1) pangolinFamilies.push(f.family + ' ' + f.weight + ' ' + f.style + ':' + f.status)
      if (f.family.indexOf('Quicksand') !== -1) quicksandFamilies.push(f.family + ' ' + f.weight + ' ' + f.style + ':' + f.status)
    })
    var data = {
      t: Math.round(performance.now()),
      h2AppliedFontFamily: getComputedStyle(el).fontFamily,
      h2AppliedFontSize: getComputedStyle(el).fontSize,
      h2RectHeight: el.getBoundingClientRect().height,
      pAppliedFontFamily: pStyle ? pStyle.fontFamily : null,
      pangolinCheck: document.fonts.check('16px Pangolin'),
      pangolinCheck700: document.fonts.check('700 16px Pangolin'),
      pangolinEntries: pangolinFamilies,
      quicksandCheck: document.fonts.check('16px Quicksand'),
      quicksandEntries: quicksandFamilies,
      viewportW: window.innerWidth,
      viewportH: window.innerHeight,
      dpr: window.devicePixelRatio,
    }
    var key = JSON.stringify([data.h2AppliedFontFamily, data.h2RectHeight, data.pangolinCheck, data.quicksandCheck])
    if (key !== lastKey) {
      lastKey = key
      report(data)
    }
  }
  // Poll continuously rather than fixed timeouts — the catalogue pane is only mounted during stage 3
  // of a 4-stage, 3s-per-stage rotation, so a fixed delay easily misses the window entirely.
  var deadline = performance.now() + 22000
  function tick() {
    sample()
    if (performance.now() < deadline) setTimeout(tick, 300)
  }
  tick()
})();
`

const script = `${MARKER}\n<script>${probe}</script>\n`
writeFileSync(INDEX, html.replace('</body>', `${script}</body>`))
console.log(`[inject] font-check probe injected into ${INDEX}, posting to ${collector}`)
