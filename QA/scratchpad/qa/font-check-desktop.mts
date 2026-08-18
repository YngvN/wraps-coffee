// Ad hoc: does Pangolin actually load in a fresh desktop Playwright session now that it's in the
// self-hosted font bundle? Source-string page.evaluate (see QA report §10 __name trap).
import { chromium } from 'playwright'

const BASE_URL = process.env.QA_BASE_URL ?? 'http://localhost:4173'
const SCREEN_ID = 'screen-624ebb7c-9fb9-493c-86c5-ac2baa8d5210'

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 960, height: 540 } })
await page.goto(`${BASE_URL}/screens/${SCREEN_ID}?unattended=1`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(7500)

const source = `(() => {
  var el = document.querySelector('.catalogue-slide__item h2')
  var pangolinEntries = []
  document.fonts.forEach(function (f) {
    if (f.family.indexOf('Pangolin') !== -1) pangolinEntries.push(f.family + ' ' + f.weight + ':' + f.status)
  })
  return {
    found: !!el,
    appliedFontFamily: el ? getComputedStyle(el).fontFamily : null,
    appliedFontSize: el ? getComputedStyle(el).fontSize : null,
    h2RectHeight: el ? el.getBoundingClientRect().height : null,
    pangolinCheck: document.fonts.check('16px Pangolin'),
    pangolinEntries: pangolinEntries,
    fontsReady: document.fonts.status,
  }
})()`

const result = await page.evaluate(source)
console.log(JSON.stringify(result, null, 2))
await browser.close()
