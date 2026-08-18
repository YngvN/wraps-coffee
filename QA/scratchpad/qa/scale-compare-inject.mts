/**
 * Scratchpad-only. Reports the catalogue pane's ACTUAL resolved shrink scale on-device, plus the
 * measurements the search itself uses (`scrollHeight` vs `clientHeight`), so the TV's answer can be
 * compared numerically against desktop's instead of guessed at from screenshots.
 *
 * Usage: npx tsx QA/scratchpad/qa/scale-compare-inject.mts <collector-origin>
 */
import { readFileSync, writeFileSync } from 'node:fs'

const MARKER = '<!-- qa-scale-compare -->'
const INDEX = 'dist/index.html'

const collector = process.argv[2]
if (!collector) throw new Error('usage: scale-compare-inject.mts <collector-origin>')

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
  var lastKey = null
  function sample() {
    var inner = document.querySelector('.catalogue-slide__item')
    if (!inner) return
    var contentInner = inner.closest('.split-layout__pane-content-inner')
    var contentOuter = inner.closest('.split-layout__pane-content')
    if (!contentInner || !contentOuter) return
    var measured = contentInner.firstElementChild || contentInner
    var raw = contentInner.style.getPropertyValue('--slide-item-title-size').trim()
    var base = contentOuter.style.getPropertyValue('--slide-item-title-size').trim()
    var items = contentInner.querySelectorAll('.catalogue-slide__item').length
    var data = {
      appliedItemTitle: raw,
      baseItemTitle: base,
      resolvedScale: raw && base ? (parseFloat(raw) / parseFloat(base)).toFixed(4) : null,
      itemsRendered: items,
      scrollH: measured.scrollHeight,
      clientH: contentOuter.clientHeight,
      overflowH: measured.scrollHeight - contentOuter.clientHeight,
      paneW: contentOuter.clientWidth,
      contentPhase: (document.querySelector('.split-layout') || {}).getAttribute
        ? document.querySelector('.split-layout').getAttribute('data-content-phase')
        : null,
      stage: (document.querySelector('.split-layout') || {}).getAttribute
        ? document.querySelector('.split-layout').getAttribute('data-stage')
        : null,
      t: Math.round(performance.now()),
    }
    var key = data.appliedItemTitle + '|' + data.itemsRendered + '|' + data.overflowH + '|' + data.contentPhase
    if (key !== lastKey) { lastKey = key; report(data) }
  }
  var deadline = performance.now() + 30000
  function tick() { sample(); if (performance.now() < deadline) setTimeout(tick, 250) }
  tick()
})();
`

writeFileSync(INDEX, html.replace('</body>', `${MARKER}\n<script>${probe}</script>\n</body>`))
console.log(`[inject] scale-compare probe injected into ${INDEX}, posting to ${collector}`)
