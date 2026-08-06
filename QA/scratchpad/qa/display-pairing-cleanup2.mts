// Fixed cleanup: machine labels render as an <Input> value, not a text node, so
// `.filter({ hasText })` isn't reliable for finding them — iterate cards and read
// each one's own label input value directly instead.
import { chromium } from 'playwright'

const BASE_URL = 'http://localhost:5173'

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

  let removedCount = 0
  for (let guard = 0; guard < 15; guard++) {
    const cards = page.locator('.display-manager-view__machines > *')
    const count = await cards.count()
    let removedThisPass = false
    for (let i = 0; i < count; i++) {
      const card = cards.nth(i)
      const label = await card.locator('input').first().inputValue().catch(() => '')
      if (label.startsWith('QA Test')) {
        console.log('Removing:', label)
        await card.locator('.display-manager-view__remove-button').click()
        await page.waitForTimeout(600)
        removedCount += 1
        removedThisPass = true
        break // DOM shifted, re-query from scratch
      }
    }
    if (!removedThisPass) break
  }
  console.log(`Removed ${removedCount} test machine card(s) total.`)

  // Final sweep: log every remaining card's label so it's obvious nothing test-related is left.
  const finalCards = page.locator('.display-manager-view__machines > *')
  const finalCount = await finalCards.count()
  console.log(`\n${finalCount} machine card(s) remain:`)
  for (let i = 0; i < finalCount; i++) {
    const label = await finalCards.nth(i).locator('input').first().inputValue().catch(() => '(unreadable)')
    console.log(' -', label)
  }

  await browser.close()
}

main().catch((error) => {
  console.error('FATAL', error)
  process.exit(1)
})
