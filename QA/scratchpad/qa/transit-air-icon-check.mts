import { chromium } from 'playwright'

const BASE_URL = 'http://localhost:5173'

async function main() {
  const browser = await chromium.launch({ headless: false })
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } })
  page.setDefaultTimeout(15000)

  await page.goto(`${BASE_URL}/admin/login`)
  await page.locator('#admin-username').fill('admin')
  await page.locator('#admin-password').fill('1234')
  await page.locator('form.admin-login__form button[type="submit"]').click()
  await page.waitForURL('**/admin/dashboard/**', { timeout: 20000 })

  await page.goto(`${BASE_URL}/admin/dashboard/settings/integrations`)
  await page.waitForTimeout(1500)
  await page.getByText('Ruter#', { exact: false }).first().click()
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: 'View transit icons' }).first().click({ force: true })
  await page.waitForTimeout(500)

  const items = await page.locator('.integrations-view__mode-icon-item').evaluateAll((els) =>
    els.map((el) => {
      const svg = el.querySelector('svg')
      const style = svg ? getComputedStyle(svg) : null
      return {
        label: el.textContent,
        viewBox: svg?.getAttribute('viewBox'),
        fill: style?.fill,
        stroke: style?.stroke,
      }
    }),
  )
  console.log(JSON.stringify(items, null, 2))

  await browser.close()
}

main().catch((error) => {
  console.error('FATAL', error)
  process.exit(1)
})
