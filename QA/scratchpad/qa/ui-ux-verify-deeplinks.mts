/** Verifies the Settings `?view=` deep links + flyout-click equivalents. Scratchpad-only, read-only. */
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import type { Page } from 'playwright'
import { BASE_URL, REPO_ROOT, launch, login, setDashboardLanguage } from './harness.mts'

const OUT_DIR = path.join(REPO_ROOT, 'QA/dashboard-ui-ux-screenshots-2026-08-14')

async function state(page: Page) {
  return page.evaluate(() => ({
    url: location.pathname + location.search,
    headings: Array.from(document.querySelectorAll('h1, h2')).map((h) => (h.textContent || '').trim()).slice(0, 4),
    firstCards: Array.from(document.querySelectorAll('.card h2, .card h3')).map((h) => (h.textContent || '').trim()).slice(0, 5),
  }))
}

async function main() {
  const { browser, page } = await launch()
  mkdirSync(OUT_DIR, { recursive: true })
  try {
    await login(page)
    await setDashboardLanguage(page, 'English')

    for (const view of ['store', 'integrations', 'advanced', 'backup', 'developers']) {
      await page.goto(`${BASE_URL}/admin/dashboard/settings?view=${view}`)
      await page.waitForTimeout(4000)
      console.log(`[direct ?view=${view}]`, JSON.stringify(await state(page)))
    }

    // Same destinations reached by actually clicking the flyout rows instead.
    for (const rowLabel of ['Store settings', 'Integrations', 'Advanced', 'Backup', 'For developers']) {
      await page.goto(`${BASE_URL}/admin/dashboard/overview`)
      await page.waitForTimeout(800)
      await page.locator('.admin-sidebar-nav--desktop a[href$="/settings"]').first().hover()
      await page.waitForTimeout(700)
      await page.locator('.admin-sidebar-nav__flyout--tier2 .admin-sidebar-nav__flyout-row', { hasText: rowLabel }).first().click()
      await page.waitForTimeout(2500)
      console.log(`[flyout click "${rowLabel}"]`, JSON.stringify(await state(page)))
      if (rowLabel === 'Store settings') {
        await page.screenshot({ path: path.join(OUT_DIR, '28-settings-store-via-flyout.png') })
      }
    }

    // Screens deep links, for comparison — same query-param convention.
    await page.goto(`${BASE_URL}/admin/dashboard/screens?displayManager=1`)
    await page.waitForTimeout(3000)
    console.log('[direct ?displayManager=1]', JSON.stringify(await state(page)))
  } finally {
    await browser.close()
  }
}

main()
