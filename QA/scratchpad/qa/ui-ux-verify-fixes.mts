/** Verifies the 2026-08-15 visual/layout fix pass. Scratchpad-only, read-only. */
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import type { Page } from 'playwright'
import { BASE_URL, REPO_ROOT, launch, login, setDashboardLanguage } from './harness.mts'

const OUT = path.join(REPO_ROOT, 'QA/dashboard-ui-ux-screenshots-2026-08-15-after')

let n = 0
async function shot(page: Page, name: string) {
  mkdirSync(OUT, { recursive: true })
  n += 1
  await page.screenshot({ path: path.join(OUT, `${String(n).padStart(2, '0')}-${name}.png`) })
}

async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.evaluate((value) => {
    localStorage.setItem('theme', value)
    document.documentElement.setAttribute('data-theme', value)
  }, theme)
  await page.waitForTimeout(400)
}

/** Gap between a list row's leading name and its first action button. */
async function rowGap(page: Page, buttonText: string) {
  return page.evaluate((btnText) => {
    const button = Array.from(document.querySelectorAll('button')).find((b) => (b as HTMLElement).innerText.trim() === btnText)
    if (!button) return null
    let row: HTMLElement | null = button.parentElement
    while (row && row.getBoundingClientRect().width < 600) row = row.parentElement
    if (!row) return null
    const texts = Array.from(row.querySelectorAll('*'))
      .filter((el) => (el as HTMLElement).innerText?.trim() && el.children.length === 0)
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter((e) => e.r.width > 0)
      .sort((a, b) => a.r.left - b.r.left)
    if (!texts.length) return null
    return {
      viewport: window.innerWidth,
      name: (texts[0].el as HTMLElement).innerText.trim().slice(0, 20),
      gapToButton: Math.round(button.getBoundingClientRect().left - texts[0].r.right),
    }
  }, buttonText)
}

async function main() {
  const { browser, page } = await launch()
  try {
    await login(page)
    await setDashboardLanguage(page, 'English')

    // --- B3: row gap must stop growing with the viewport ---
    for (const width of [1280, 1920, 2560]) {
      await page.setViewportSize({ width, height: 1000 })
      await page.goto(`${BASE_URL}/admin/dashboard/products`)
      await page.waitForTimeout(1800)
      console.log(`[B3 products @${width}]`, JSON.stringify(await rowGap(page, 'Edit')))
    }

    // --- B2: widest form controls ---
    await page.setViewportSize({ width: 1920, height: 1080 })
    await page.goto(`${BASE_URL}/admin/dashboard/settings?view=store`)
    await page.waitForTimeout(2200)
    const widest = await page.evaluate(() =>
      Array.from(document.querySelectorAll('input, select'))
        .map((el) => ({ w: Math.round(el.getBoundingClientRect().width), v: (el as HTMLInputElement).value.slice(0, 20) }))
        .filter((e) => e.w > 100)
        .sort((a, b) => b.w - a.w)
        .slice(0, 3),
    )
    console.log('[B2 store settings widest controls]', JSON.stringify(widest))
    await shot(page, 'store-settings-light')

    // --- B5: no blank-name row ---
    await page.goto(`${BASE_URL}/admin/dashboard/products`)
    await page.waitForTimeout(1800)
    const names = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.products-view__item-name')).map((el) => (el as HTMLElement).innerText.trim()),
    )
    console.log('[B5 catalogue names]', JSON.stringify(names), 'blank count =', names.filter((x) => !x).length)
    await shot(page, 'products-light')

    // --- Settings grouped nav list ---
    await page.goto(`${BASE_URL}/admin/dashboard/settings`)
    await page.waitForTimeout(2000)
    const rows = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.nav-row-list__row')).map((el) => (el as HTMLElement).innerText.trim()),
    )
    console.log('[settings nav rows]', JSON.stringify(rows))
    await shot(page, 'settings-light')

    // Each row must still open its sub-view.
    for (const label of ['Store settings', 'Integrations', 'For developers', 'Advanced', 'Backup', 'Testing']) {
      await page.goto(`${BASE_URL}/admin/dashboard/settings`)
      await page.waitForTimeout(1200)
      await page.locator('.nav-row-list__row', { hasText: label }).first().click()
      await page.waitForTimeout(1200)
      const heading = await page.evaluate(() => (document.querySelector('h1') as HTMLElement)?.innerText.trim())
      console.log(`[settings row "${label}"] -> h1 = ${JSON.stringify(heading)}`)
    }

    // --- Screens toolbar grouping: all three actions in one cluster ---
    await page.goto(`${BASE_URL}/admin/dashboard/screens`)
    await page.waitForTimeout(2200)
    const toolbar = await page.evaluate(() => {
      const bar = document.querySelector('.screens-view__toolbar')
      if (!bar) return null
      const kids = Array.from(bar.children).map((c) => ({
        text: (c as HTMLElement).innerText.trim().replace(/\s+/g, ' ').slice(0, 30),
        left: Math.round(c.getBoundingClientRect().left),
        right: Math.round(c.getBoundingClientRect().right),
      }))
      const headerActions = document.querySelector('.screens-view__header-actions')
      return { kids, spread: kids.length ? Math.round(kids[kids.length - 1].right - kids[0].left) : 0, staleHeaderActions: Boolean(headerActions) }
    })
    console.log('[screens toolbar]', JSON.stringify(toolbar))
    await shot(page, 'screens-light')

    // --- Dark mode across the restyled surfaces ---
    await setTheme(page, 'dark')
    for (const [route, name] of [
      ['overview', 'overview-dark'],
      ['products', 'products-dark'],
      ['settings', 'settings-dark'],
      ['screens', 'screens-dark'],
      ['users', 'users-dark'],
    ] as const) {
      await page.goto(`${BASE_URL}/admin/dashboard/${route}`)
      await page.waitForTimeout(1800)
      await shot(page, name)
    }
    await setTheme(page, 'light')
    for (const [route, name] of [
      ['overview', 'overview-light'],
      ['users', 'users-light'],
    ] as const) {
      await page.goto(`${BASE_URL}/admin/dashboard/${route}`)
      await page.waitForTimeout(1800)
      await shot(page, name)
    }
  } finally {
    await browser.close()
  }
}

main()
