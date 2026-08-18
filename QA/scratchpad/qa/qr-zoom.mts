/** Scratchpad-only — high-DPI close-up of a rendered QR code, to eyeball the finder patterns. */
import { chromium } from 'playwright'
const BASE = process.env.QA_BASE_URL ?? 'http://localhost:4173'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 4 })
await page.goto(`${BASE}/screens/screen-8ec76ce7-2a6d-4677-ae66-f5eb5a74e91a?unattended=1`)
await page.locator('.split-layout').first().waitFor({ timeout: 20000 })
await page.waitForTimeout(6000)
await page.locator('.qr-code-slide__code').first().screenshot({ path: 'QA/scratchpad/qa/qr-zoom.png' })
console.log('captured at 4x')
await browser.close()
