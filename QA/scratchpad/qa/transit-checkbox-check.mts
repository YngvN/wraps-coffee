// Verifies the new "useRealLineColors" checkbox renders in the admin
// ScreenForm's pane field editor (SlideFields.tsx). Scratchpad-only.
import { chromium } from 'playwright'

const BASE_URL = 'http://localhost:5173'
const SCREEN_ID = 'screen-624ebb7c-9fb9-493c-86c5-ac2baa8d5210' // "Ny test"
const OUT = '/private/tmp/claude-501/-Users-yngve-Desktop-GitHub-wraps-coffee/fe5bfe62-5ce6-4836-88f3-55e0435d6e2a/scratchpad'

async function main() {
  const browser = await chromium.launch({ headless: false })
  const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } })
  page.on('dialog', (dialog) => dialog.accept().catch(() => {}))
  page.setDefaultTimeout(15000)

  await page.goto(`${BASE_URL}/admin/login`)
  await page.locator('#admin-username').fill('admin')
  await page.locator('#admin-password').fill('1234')
  await page.locator('form.admin-login__form button[type="submit"]').click()
  await page.waitForURL('**/admin/dashboard/**', { timeout: 20000 })

  await page.goto(`${BASE_URL}/admin/dashboard/screens?screenId=${SCREEN_ID}&tab=layout`)
  await page.waitForSelector('.transit-slide', { timeout: 20000 })
  // Click the pane's own "Edit pane" overlay button to open its field editor.
  await page.locator('.pane-edit-button').first().click({ force: true })
  await page.waitForTimeout(1000)

  const checkbox = page.getByText('Use each line', { exact: false })
  const count = await checkbox.count()
  console.log('Found "Use each line real official color" label count:', count)
  if (count > 0) {
    await checkbox.first().scrollIntoViewIfNeeded()
  }
  await page.screenshot({ path: `${OUT}/transit-pane-fields.png`, fullPage: true })

  await browser.close()
}

main().catch((error) => {
  console.error('FATAL', error)
  process.exit(1)
})
