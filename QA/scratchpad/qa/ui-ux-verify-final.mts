/** Verifies the remaining-findings pass (A1/A5/A6/B6/B8, C1-C5, D1/D2). Scratchpad-only, read-only. */
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import type { Page } from 'playwright'
import { BASE_URL, REPO_ROOT, launch, login, setDashboardLanguage } from './harness.mts'

const OUT = path.join(REPO_ROOT, 'QA/dashboard-ui-ux-screenshots-2026-08-15-final')
let n = 0
async function shot(page: Page, name: string) {
  mkdirSync(OUT, { recursive: true })
  n += 1
  await page.screenshot({ path: path.join(OUT, `${String(n).padStart(2, '0')}-${name}.png`) })
}

async function heading(page: Page) {
  return page.evaluate(() => (document.querySelector('h1') as HTMLElement)?.innerText.trim() ?? null)
}

async function main() {
  const { browser, page } = await launch()
  try {
    await login(page)
    await setDashboardLanguage(page, 'English')

    // --- D1: every Settings sub-view is its own real, refreshable URL ---
    const routes = [
      ['settings', 'Settings'],
      ['settings/store', 'Store settings'],
      ['settings/store/contact', 'Contact info'],
      ['settings/store/appearance', 'Appearance'],
      ['settings/integrations', 'Integrations'],
      ['settings/advanced', 'Advanced'],
      ['settings/backup', 'Backup'],
      ['settings/developers', 'For developers'],
      ['settings/testing', 'Testing'],
      ['displays', 'Displays'],
    ] as const
    for (const [route, expected] of routes) {
      await page.goto(`${BASE_URL}/admin/dashboard/${route}`)
      await page.waitForTimeout(1500)
      const got = await heading(page)
      const url = await page.evaluate(() => location.pathname)
      const ok = got === expected && url === `/admin/dashboard/${route}`
      console.log(`[D1] /${route.padEnd(24)} h1=${JSON.stringify(got).padEnd(20)} url=${url} ${ok ? 'OK' : '<-- MISMATCH'}`)
    }

    // --- D1: legacy ?view= links still land correctly ---
    for (const legacy of ['store', 'integrations', 'backup']) {
      await page.goto(`${BASE_URL}/admin/dashboard/settings?view=${legacy}`)
      await page.waitForTimeout(1500)
      console.log(`[D1 legacy ?view=${legacy}] -> ${await page.evaluate(() => location.pathname)} h1=${JSON.stringify(await heading(page))}`)
    }

    // --- Browser Back closes a sub-view natively ---
    await page.goto(`${BASE_URL}/admin/dashboard/settings`)
    await page.waitForTimeout(1200)
    await page.locator('.nav-row-list__row', { hasText: 'Store settings' }).first().click()
    await page.waitForTimeout(1200)
    const afterClick = await page.evaluate(() => location.pathname)
    await page.goBack()
    await page.waitForTimeout(1200)
    console.log(`[D1 back] clicked-> ${afterClick} | after back -> ${await page.evaluate(() => location.pathname)}`)

    // --- D2 + A1: nav rail contents and grouping ---
    await page.goto(`${BASE_URL}/admin/dashboard/overview`)
    await page.waitForTimeout(1200)
    await page.locator('.admin-sidebar-nav--desktop a[href$="/screens"]').first().hover()
    await page.waitForTimeout(900)
    const nav = await page.evaluate(() => ({
      tools: Array.from(document.querySelectorAll('.admin-sidebar-nav__list--tools .admin-sidebar-nav__link')).map((el) => (el as HTMLElement).innerText.trim()),
      destinations: Array.from(document.querySelectorAll('.admin-sidebar-nav__list:not(.admin-sidebar-nav__list--tools) .admin-sidebar-nav__link')).map((el) => (el as HTMLElement).innerText.trim()),
      flyoutBody: Array.from(document.querySelectorAll('.admin-sidebar-nav__flyout--tier2 .admin-sidebar-nav__flyout-row')).map((el) => (el as HTMLElement).innerText.trim()),
      flyoutFooter: Array.from(document.querySelectorAll('.admin-sidebar-nav__flyout-footer .admin-sidebar-nav__flyout-row')).map((el) => (el as HTMLElement).innerText.trim()),
    }))
    console.log('[A1 tools group]  ', JSON.stringify(nav.tools))
    console.log('[D2 destinations] ', JSON.stringify(nav.destinations))
    console.log('[A5 flyout footer]', JSON.stringify(nav.flyoutFooter))
    await shot(page, 'nav-flyout-screens')

    // --- C1: create verbs ---
    for (const [route, sel] of [['products', 'Create catalogue'], ['users', 'Create user'], ['events', 'Create event']] as const) {
      await page.goto(`${BASE_URL}/admin/dashboard/${route}`)
      await page.waitForTimeout(1400)
      const found = await page.evaluate((label) => Array.from(document.querySelectorAll('button')).some((b) => (b as HTMLElement).innerText.trim() === label), sel)
      console.log(`[C1] ${route}: "${sel}" present = ${found}`)
    }

    // --- B6: message board create actions ---
    await page.goto(`${BASE_URL}/admin/dashboard/messageboard`)
    await page.waitForTimeout(1600)
    const mb = await page.evaluate(() => ({
      headerBtn: (document.querySelector('.message-board-view__header .btn') as HTMLElement)?.innerText.trim() ?? null,
      ghost: (document.querySelector('.message-board-view__add-board') as HTMLElement)?.innerText.trim() ?? null,
    }))
    console.log('[B6 message board]', JSON.stringify(mb))
    await shot(page, 'messageboard')

    await page.goto(`${BASE_URL}/admin/dashboard/displays`)
    await page.waitForTimeout(1600)
    await shot(page, 'displays')
    await page.goto(`${BASE_URL}/admin/dashboard/settings`)
    await page.waitForTimeout(1400)
    await shot(page, 'settings')
  } finally {
    await browser.close()
  }
}

main()
