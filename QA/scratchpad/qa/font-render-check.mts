import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

/** Confirms the themed fonts are actually loaded and rendered, not merely declared in CSS. */
const BASE = process.env.SITE_URL ?? 'http://localhost:8888'
const OUT = 'QA/scratchpad/qa/font-render-screenshots'
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ headless: false, slowMo: 150 })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })

await page.goto(`${BASE}/menu`, { waitUntil: 'networkidle' }).catch(() => {})
// document.fonts.ready resolves once every @font-face the page uses has settled.
await page.evaluate('document.fonts.ready').catch(() => {})
await page.waitForTimeout(2500)
await page.screenshot({ path: `${OUT}/menu.png` })

const report = await page.evaluate(`(() => {
  const loaded = []
  document.fonts.forEach((f) => loaded.push(f.family + ' ' + f.status))
  const h1 = document.querySelector('h1')
  return {
    loadedFaces: [...new Set(loaded)],
    h1Text: h1 ? h1.textContent : '(none)',
    h1FontFamily: h1 ? getComputedStyle(h1).fontFamily : '(none)',
    bodyFontFamily: getComputedStyle(document.body).fontFamily,
    // check() asks whether the browser can render this text in that family.
    canRenderHeading: document.fonts.check('16px "Fredericka the Great"'),
    canRenderBody: document.fonts.check('16px "Quicksand"'),
    canRenderSub: document.fonts.check('16px "Pangolin"'),
  }
})()`)

console.log(JSON.stringify(report, null, 2))
await browser.close()
