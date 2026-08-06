// Captures the "Pair a mobile display" QR code as a standalone PNG for decoding
// (see decode-qr.mjs in the scratch qr-decode dir). Scratchpad-only, not part of the app.
import { chromium } from 'playwright'

const BASE_URL = 'http://localhost:5173'
const OUT_PATH = process.argv[2]
if (!OUT_PATH) {
  console.error('Usage: tsx capture-qr.mts <output png path>')
  process.exit(1)
}

async function main() {
  const browser = await chromium.launch({ headless: false })
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
  page.on('dialog', (dialog) => dialog.accept().catch(() => {}))
  page.setDefaultTimeout(15000)

  await page.goto(`${BASE_URL}/admin/login`)
  await page.locator('#admin-username').fill('admin')
  await page.locator('#admin-password').fill('1234')
  await page.locator('form.admin-login__form button[type="submit"]').click()
  await page.waitForURL('**/admin/dashboard/**', { timeout: 20000 })
  await page.goto(`${BASE_URL}/admin/dashboard/screens?displayManager=1`)
  await page.waitForSelector('.display-manager-view', { timeout: 15000 })

  await page.getByRole('button', { name: /pair a mobile display/i }).click()
  const svg = page.locator('.display-manager-view__pair-qr svg')
  await svg.waitFor({ state: 'visible', timeout: 15000 })
  // Force a large, decode-friendly render size regardless of the modal's own CSS sizing.
  await svg.evaluate((el) => {
    el.setAttribute('width', '600')
    el.setAttribute('height', '600')
  })
  await svg.screenshot({ path: OUT_PATH })
  console.log('Saved QR screenshot to', OUT_PATH)

  const manualText = await page.locator('.display-manager-view__pair-manual').innerText()
  console.log('Manual-entry text shown alongside it:', manualText)

  await browser.close()
}

main().catch((error) => {
  console.error('FATAL', error)
  process.exit(1)
})
