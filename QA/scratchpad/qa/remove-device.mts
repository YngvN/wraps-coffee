// Removes a single machine card by machineID's label (matched via input value) through
// the real Display Manager UI. Generic reusable cleanup/revocation-test helper for this
// QA cycle. Scratchpad-only, not part of the app.
import { chromium } from 'playwright'

const BASE_URL = 'http://localhost:5173'
const LABEL = process.argv[2]
if (!LABEL) {
  console.error('Usage: tsx remove-device.mts "<exact label>"')
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

  const cards = page.locator('.display-manager-view__machines > *')
  const count = await cards.count()
  let removed = false
  for (let i = 0; i < count; i++) {
    const card = cards.nth(i)
    const value = await card.locator('input').first().inputValue().catch(() => '')
    if (value === LABEL) {
      await card.locator('.display-manager-view__remove-button').click()
      await page.waitForTimeout(700)
      removed = true
      console.log('Removed:', LABEL)
      break
    }
  }
  if (!removed) console.log('NOT FOUND:', LABEL)

  await browser.close()
}

main().catch((error) => {
  console.error('FATAL', error)
  process.exit(1)
})
