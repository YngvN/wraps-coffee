/**
 * Scratchpad-only. Verifies the one assumption behind `src/utils/effectiveDevicePixelRatio.ts`: that
 * `screen.width` keeps reporting the device's own default CSS width even when `index.html`'s inline
 * script has forced the layout viewport to a fixed width. If that held, `screen.width * dpr /
 * innerWidth` is the true device-px-per-CSS-px ratio; if it does not, the util would silently
 * mis-size every image on a configured display.
 *
 * Also reports the catalogue pane's resolved scale/overflow at the same time, so one TV run answers
 * both "is the formula right" and "did the render width fix the clamp".
 *
 * The installed companion APK predates the `renderWidthPx` param, so this also injects a
 * `history.replaceState` shim *before* the app's own viewport script to add the param to the URL —
 * which makes the rest of the page (that inline script, and `readDisplayRenderWidth`) behave exactly
 * as it will once the new APK forwards it for real. Ordering is the whole point: the shim has to run
 * before the viewport meta is rewritten, so it is inserted ahead of that script rather than at
 * `</body>` like the sampler.
 *
 * Usage: npx tsx QA/scratchpad/qa/effective-dpr-check.mts <collector-origin> [renderWidthPx]
 */
import { readFileSync, writeFileSync } from 'node:fs'

const MARKER = '<!-- qa-effective-dpr -->'
const INDEX = 'dist/index.html'

const collector = process.argv[2]
if (!collector) throw new Error('usage: effective-dpr-check.mts <collector-origin>')

const html = readFileSync(INDEX, 'utf-8')
if (html.includes(MARKER)) {
  console.log('[inject] already injected — rebuild first to start clean')
  process.exit(0)
}

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
    var contentInner = item && item.closest('.split-layout__pane-content-inner')
    var contentOuter = item && item.closest('.split-layout__pane-content')
    var measured = contentInner && (contentInner.firstElementChild || contentInner)
    var raw = contentInner ? contentInner.style.getPropertyValue('--slide-item-title-size').trim() : ''
    var base = contentOuter ? contentOuter.style.getPropertyValue('--slide-item-title-size').trim() : ''
    var h2 = item && item.querySelector('h2')
    var dpr = window.devicePixelRatio || 1
    var data = {
      // --- the formula under test ---
      renderWidthParam: new URLSearchParams(window.location.search).get('renderWidthPx'),
      innerWidth: window.innerWidth,
      screenWidth: window.screen ? window.screen.width : null,
      devicePixelRatio: dpr,
      derivedEffectiveDpr: window.screen && window.innerWidth ? (window.screen.width * dpr) / window.innerWidth : null,
      // --- the outcome it is meant to enable ---
      resolvedScale: raw && base ? (parseFloat(raw) / parseFloat(base)).toFixed(4) : null,
      h2ComputedFontSize: h2 ? getComputedStyle(h2).fontSize : null,
      overflowH: measured && contentOuter ? measured.scrollHeight - contentOuter.clientHeight : null,
      paneW: contentOuter ? contentOuter.clientWidth : null,
      itemsRendered: contentInner ? contentInner.querySelectorAll('.catalogue-slide__item').length : 0,
    }
    var key = data.innerWidth + '|' + data.resolvedScale + '|' + data.overflowH
    if (key !== lastKey) { lastKey = key; report(data) }
  }
  var deadline = performance.now() + 30000
  function tick() { sample(); if (performance.now() < deadline) setTimeout(tick, 250) }
  tick()
})();
`

const tier = process.argv[3]
// Must land BEFORE the app's own viewport script (which sits right after the viewport meta), so the
// param is already on the URL by the time that script reads it.
const shim = tier
  ? `${MARKER}\n<script>(function(){try{var u=new URL(window.location.href);if(!u.searchParams.get('renderWidthPx')){u.searchParams.set('renderWidthPx',${JSON.stringify(tier)});history.replaceState(null,'',u.toString())}}catch(e){}})()</script>\n`
  : `${MARKER}\n`

const withShim = html.replace('<meta name="viewport"', `${shim}<meta name="viewport"`)
writeFileSync(INDEX, withShim.replace('</body>', `<script>${probe}</script>\n</body>`))
console.log(`[inject] effective-dpr probe injected into ${INDEX}${tier ? ` (simulating renderWidthPx=${tier})` : ' (no tier — measuring the auto/default case)'}, posting to ${collector}`)
