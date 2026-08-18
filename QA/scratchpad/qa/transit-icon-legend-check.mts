// Views the "View transit icons" legend modal in Integrations, which renders
// every Entur transport mode's glyph regardless of what's live at any one
// configured stop — a quick way to see all the new filled icons together.
import { chromium } from 'playwright'

const BASE_URL = 'http://localhost:5173'
const OUT = '/private/tmp/claude-501/-Users-yngve-Desktop-GitHub-wraps-coffee/fe5bfe62-5ce6-4836-88f3-55e0435d6e2a/scratchpad'

async function main() {
  const browser = await chromium.launch({ headless: false })
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } })
  page.on('dialog', (dialog) => dialog.accept().catch(() => {}))
  page.setDefaultTimeout(15000)
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log('[console error]', msg.text())
  })

  await page.goto(`${BASE_URL}/admin/login`)
  await page.locator('#admin-username').fill('admin')
  await page.locator('#admin-password').fill('1234')
  await page.locator('form.admin-login__form button[type="submit"]').click()
  await page.waitForURL('**/admin/dashboard/**', { timeout: 20000 })

  await page.goto(`${BASE_URL}/admin/dashboard/settings/integrations`)
  await page.waitForTimeout(1500)
  await page.getByText('Ruter#', { exact: false }).first().click()
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${OUT}/transit-integrations-page.png`, fullPage: true })
  const legendButton = page.getByRole('button', { name: 'View transit icons' })
  console.log('legend button count:', await legendButton.count())
  await legendButton.first().click({ force: true })
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${OUT}/transit-icon-legend.png` })

  await browser.close()
}

main().catch((error) => {
  console.error('FATAL', error)
  process.exit(1)
})
