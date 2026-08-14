/** Exact element widths cited in the UI/UX report. Scratchpad-only, read-only. */
import type { Page } from 'playwright'
import { BASE_URL, launch, login, setDashboardLanguage } from './harness.mts'

/** Widest form controls on the page, with the value they hold — the "full-bleed input" evidence. */
async function widestControls(page: Page, label: string) {
  const found = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('input, select, textarea'))
      .map((el) => {
        const r = el.getBoundingClientRect()
        const input = el as HTMLInputElement
        return { tag: el.tagName.toLowerCase(), type: input.type || '', w: Math.round(r.width), value: (input.value || '').trim().slice(0, 34) }
      })
      .filter((entry) => entry.w > 400)
      .sort((a, b) => b.w - a.w)
      .slice(0, 5)
  })
  console.log(`[${label}] ${JSON.stringify(found, null, 0)}`)
}

/** Gap between a list row's leading text and its trailing action button — the "dead space" evidence. */
async function labelToActionGap(page: Page, buttonText: string, label: string) {
  const info = await page.evaluate((btnText) => {
    const button = Array.from(document.querySelectorAll('button')).find((b) => (b as HTMLElement).innerText.trim() === btnText)
    if (!button) return null
    let row: HTMLElement | null = button.parentElement
    while (row && row.getBoundingClientRect().width < 600) row = row.parentElement
    if (!row) return null
    // Leading text node inside the row (the item's name), leftmost visible text element.
    const texts = Array.from(row.querySelectorAll('*'))
      .filter((el) => (el as HTMLElement).innerText?.trim() && el.children.length === 0)
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter((entry) => entry.r.width > 0)
      .sort((a, b) => a.r.left - b.r.left)
    if (texts.length === 0) return null
    const nameRight = texts[0].r.right
    return {
      viewport: window.innerWidth,
      rowWidth: Math.round(row.getBoundingClientRect().width),
      name: (texts[0].el as HTMLElement).innerText.trim().slice(0, 24),
      gapToButton: Math.round(button.getBoundingClientRect().left - nameRight),
    }
  }, buttonText)
  console.log(`[${label}] ${JSON.stringify(info)}`)
}

async function main() {
  const { browser, page } = await launch()
  try {
    await login(page)
    await setDashboardLanguage(page, 'English')

    await page.goto(`${BASE_URL}/admin/dashboard/settings?view=store`)
    await page.waitForTimeout(2500)
    await widestControls(page, 'Store settings @1920')

    await page.goto(`${BASE_URL}/admin/dashboard/screens?displayManager=1`)
    await page.waitForTimeout(2500)
    await widestControls(page, 'Display Manager @1920')

    for (const width of [1280, 1920, 2560]) {
      await page.setViewportSize({ width, height: 1000 })
      await page.goto(`${BASE_URL}/admin/dashboard/products`)
      await page.waitForTimeout(2200)
      await labelToActionGap(page, 'Edit', `Products catalogue row @${width}`)
    }

    await page.setViewportSize({ width: 1920, height: 1000 })
    await page.goto(`${BASE_URL}/admin/dashboard/users`)
    await page.waitForTimeout(2200)
    await labelToActionGap(page, 'Reset password', 'Users row @1920')
  } finally {
    await browser.close()
  }
}

main()
