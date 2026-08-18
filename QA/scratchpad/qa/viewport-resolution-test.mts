/**
 * Scratchpad-only. Tests the "render at a higher CSS resolution" idea against the Android WebView's
 * 8px minimum-font-size clamp (see the 2026-08-18 finding: the TV's catalogue pane needs ~5.3px text
 * at the default 960x540 CSS viewport, which Android clamps to 8px, so shrink-to-fit can never fit it).
 *
 * Rewrites the built `dist/index.html`'s own viewport meta to a fixed CSS width, then reports what the
 * catalogue pane actually resolves to. A larger CSS viewport means a given *physical* size maps to more
 * CSS px, so the fixed 8px clamp covers a smaller fraction of the pane and stops binding.
 *
 * Note the backing store is unchanged (960x540@2 and 1920x1080@1 both raster 1920x1080 device px), so
 * this is not the same as raising the panel's own resolution — it changes layout units, not raster work.
 *
 * Usage: npx tsx QA/scratchpad/qa/viewport-resolution-test.mts <collector-origin> <cssWidth>
 *   e.g. npx tsx QA/scratchpad/qa/viewport-resolution-test.mts http://192.168.0.213:4999 1920
 */
import { readFileSync, writeFileSync } from 'node:fs'

const MARKER = '<!-- qa-viewport-test -->'
const INDEX = 'dist/index.html'

const collector = process.argv[2]
const cssWidth = process.argv[3]
if (!collector || !cssWidth) throw new Error('usage: viewport-resolution-test.mts <collector-origin> <cssWidth>')

let html = readFileSync(INDEX, 'utf-8')
if (html.includes(MARKER)) {
  console.log('[inject] already injected — rebuild first to start clean')
  process.exit(0)
}

// The whole point of the experiment: replace `width=device-width` with a fixed CSS width.
const before = html
html = html.replace(
  /<meta name="viewport" content="[^"]*"\s*\/?>/,
  `<meta name="viewport" content="width=${cssWidth}, initial-scale=1.0" />`,
)
if (html === before) throw new Error('viewport meta not found/replaced — check dist/index.html')

const probe = `
(function () {
  function report(data) {
    fetch(${JSON.stringify(collector)}, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'debug', data: data }),
    }).catch(function () {})
  }
  var lastKey = null
  function sample() {
    var item = document.querySelector('.catalogue-slide__item')
    if (!item) return
    var contentInner = item.closest('.split-layout__pane-content-inner')
    var contentOuter = item.closest('.split-layout__pane-content')
    if (!contentInner || !contentOuter) return
    var measured = contentInner.firstElementChild || contentInner
    var raw = contentInner.style.getPropertyValue('--slide-item-title-size').trim()
    var base = contentOuter.style.getPropertyValue('--slide-item-title-size').trim()
    var h2 = item.querySelector('h2')
    var layout = document.querySelector('.split-layout')
    var data = {
      cssViewport: window.innerWidth + 'x' + window.innerHeight,
      dpr: window.devicePixelRatio,
      appliedItemTitle: raw,
      baseItemTitle: base,
      resolvedScale: raw && base ? (parseFloat(raw) / parseFloat(base)).toFixed(4) : null,
      // The number that actually matters: what the browser RENDERS after its own min-font-size clamp.
      h2ComputedFontSize: h2 ? getComputedStyle(h2).fontSize : null,
      itemsRendered: contentInner.querySelectorAll('.catalogue-slide__item').length,
      scrollH: measured.scrollHeight,
      clientH: contentOuter.clientHeight,
      overflowH: measured.scrollHeight - contentOuter.clientHeight,
      paneW: contentOuter.clientWidth,
      phase: layout ? layout.getAttribute('data-content-phase') : null,
      stage: layout ? layout.getAttribute('data-stage') : null,
      t: Math.round(performance.now()),
    }
    var key = data.appliedItemTitle + '|' + data.overflowH + '|' + data.phase + '|' + data.stage
    if (key !== lastKey) { lastKey = key; report(data) }
  }
  var deadline = performance.now() + 30000
  function tick() { sample(); if (performance.now() < deadline) setTimeout(tick, 250) }
  tick()
})();
`

writeFileSync(INDEX, html.replace('</body>', `${MARKER}\n<script>${probe}</script>\n</body>`))
console.log(`[inject] viewport forced to width=${cssWidth}, probe posting to ${collector}`)
