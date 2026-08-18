/**
 * Dashboard UI/UX audit walk — QA/Reports/qa-report-dashboard-ui-ux-2026-08-14.md.
 * Scratchpad-only, not part of the app. Read-only: navigates and measures, never writes app data.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { Page } from 'playwright'
import { BASE_URL, REPO_ROOT, launch, login, setDashboardLanguage } from './harness.mts'

const OUT_DIR = path.join(REPO_ROOT, 'QA/dashboard-ui-ux-screenshots-2026-08-14')
const DATA_PATH = path.join(REPO_ROOT, 'QA/scratchpad/qa/ui-ux-walk-results.json')

let counter = 0
async function shoot(page: Page, name: string, fullPage = false): Promise<string> {
  mkdirSync(OUT_DIR, { recursive: true })
  counter += 1
  const file = `${String(counter).padStart(2, '0')}-${name}.png`
  await page.screenshot({ path: path.join(OUT_DIR, file), fullPage })
  return file
}

/** Per-view geometry + copy measurements, all read from the live DOM. */
async function measure(page: Page) {
  return page.evaluate(() => {
    const container = document.querySelector('.admin-dashboard__content') as HTMLElement | null
    if (!container) return null
    const cRect = container.getBoundingClientRect()
    const cStyle = getComputedStyle(container)
    const padLeft = parseFloat(cStyle.paddingLeft) || 0
    const padRight = parseFloat(cStyle.paddingRight) || 0
    const innerLeft = cRect.left + padLeft
    const innerRight = cRect.right - padRight
    const innerWidth = innerRight - innerLeft

    // Rightmost edge of any real, visible content block inside the view — how much of the
    // available width the view actually uses, vs. how much it was given.
    let contentRight = innerLeft
    let contentLeft = innerRight
    const stack: { el: Element; depth: number }[] = [{ el: container, depth: 0 }]
    while (stack.length > 0) {
      const node = stack.pop()!
      if (node.depth > 6) continue
      for (const child of Array.from(node.el.children)) {
        const r = child.getBoundingClientRect()
        const s = getComputedStyle(child)
        if (s.display === 'none' || s.visibility === 'hidden' || r.height < 12 || r.width < 12) continue
        if (r.right > contentRight) contentRight = r.right
        if (r.left < contentLeft) contentLeft = r.left
        stack.push({ el: child, depth: node.depth + 1 })
      }
    }

    const viewRoot = container.firstElementChild as HTMLElement | null
    const vStyle = viewRoot ? getComputedStyle(viewRoot) : null

    const buttonLabels = Array.from(document.querySelectorAll('button, a'))
      .map((el) => (el.textContent || '').trim())
      .filter((textContent) => /^(add|create|new|ny|nytt|legg til)\b/i.test(textContent) && textContent.length < 60)

    const bodyText = (document.body as HTMLElement).innerText || ''
    const termHits: Record<string, number> = {}
    const terms = [
      'kiosk display', 'kiosk displays', 'kiosk screen', 'kiosk screens', 'kiosk machine',
      'screen display', 'display manager', 'display name', 'displays', 'screens', 'TV',
    ]
    for (const term of terms) {
      const matches = bodyText.match(new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), term === 'TV' ? 'g' : 'gi'))
      if (matches) termHits[term] = matches.length
    }

    return {
      viewportWidth: window.innerWidth,
      containerInnerWidth: Math.round(innerWidth),
      contentUsedWidth: Math.round(Math.max(0, contentRight - contentLeft)),
      contentUsedPct: Math.round((Math.max(0, contentRight - contentLeft) / innerWidth) * 100),
      containerMaxWidth: cStyle.maxWidth,
      viewRootClass: viewRoot?.className ?? null,
      viewRootMaxWidth: vStyle?.maxWidth ?? null,
      viewRootWidth: viewRoot ? Math.round(viewRoot.getBoundingClientRect().width) : null,
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      docScrollWidth: document.documentElement.scrollWidth,
      docClientWidth: document.documentElement.clientWidth,
      buttonLabels: Array.from(new Set(buttonLabels)),
      termHits,
      headings: Array.from(document.querySelectorAll('h1, h2'))
        .map((h) => (h.textContent || '').trim())
        .filter(Boolean)
        .slice(0, 8),
    }
  })
}

interface ViewRecord {
  id: string
  label: string
  url: string
  screenshot: string
  measurement: Awaited<ReturnType<typeof measure>>
}

const records: ViewRecord[] = []

async function visit(page: Page, id: string, label: string, qs: string) {
  const url = `${BASE_URL}/admin/dashboard/${qs}`
  await page.goto(url)
  await page.waitForTimeout(1400)
  const measurement = await measure(page)
  const screenshot = await shoot(page, id)
  records.push({ id, label, url, screenshot, measurement })
  console.log(`[view] ${id} — used ${measurement?.contentUsedPct}% of ${measurement?.containerInnerWidth}px, overflow=${measurement?.horizontalOverflow}`)
}

const TOP_LEVEL: [string, string, string][] = [
  ['overview', 'Overview', 'overview'],
  ['messages', 'Messages', 'messages'],
  ['products', 'Products', 'products'],
  ['events', 'Events', 'events'],
  ['orders', 'Orders', 'orders'],
  ['screens', 'Screens', 'screens'],
  ['messageboard', 'Message board', 'messageboard'],
  ['media', 'Images / Media library', 'media'],
  ['users', 'Users', 'users'],
  ['settings', 'Settings', 'settings'],
]

const SUB_VIEWS: [string, string, string][] = [
  ['settings-store', 'Settings → Store settings', 'settings?view=store'],
  ['settings-integrations', 'Settings → Integrations', 'settings?view=integrations'],
  ['settings-advanced', 'Settings → Advanced', 'settings?view=advanced'],
  ['settings-backup', 'Settings → Backup', 'settings?view=backup'],
  ['settings-developers', 'Settings → For developers', 'settings?view=developers'],
  ['screens-displaymanager', 'Screens → Display Manager', 'screens?displayManager=1'],
  ['screens-new', 'Screens → new screen form', 'screens?new=1'],
  ['products-all', 'Products → all products', 'products?catalogueId=food-menu&allProducts=1'],
]

const SCREEN_ID = 'screen-8ec76ce7-2a6d-4677-ae66-f5eb5a74e91a'
const SCREEN_TABS: [string, string, string][] = [
  ['screen-tab-global', 'Screen → Text size (global)', `screens?screenId=${SCREEN_ID}&tab=global`],
  ['screen-tab-background', 'Screen → Background', `screens?screenId=${SCREEN_ID}&tab=background`],
  ['screen-tab-stages', 'Screen → Stages', `screens?screenId=${SCREEN_ID}&tab=stages`],
]

async function captureFlyout(page: Page, railItem: string, id: string) {
  await page.goto(`${BASE_URL}/admin/dashboard/overview`)
  await page.waitForTimeout(1000)
  const link = page.locator(`.admin-sidebar-nav--desktop a[href$="/${railItem}"]`).first()
  await link.hover()
  await page.waitForTimeout(900)
  const rows = await page.locator('.admin-sidebar-nav__flyout--tier2 .admin-sidebar-nav__flyout-row').allTextContents()
  const screenshot = await shoot(page, id)
  console.log(`[flyout] ${railItem}: ${rows.length} rows — ${JSON.stringify(rows)}`)
  return { railItem, rows, screenshot }
}

async function main() {
  const { browser, page } = await launch()
  const flyouts: unknown[] = []
  try {
    await login(page)
    await setDashboardLanguage(page, 'English')

    for (const [id, label, qs] of TOP_LEVEL) await visit(page, id, label, qs)
    for (const [id, label, qs] of SUB_VIEWS) await visit(page, id, label, qs)
    for (const [id, label, qs] of SCREEN_TABS) await visit(page, id, label, qs)

    flyouts.push(await captureFlyout(page, 'products', 'flyout-products'))
    flyouts.push(await captureFlyout(page, 'screens', 'flyout-screens'))
    flyouts.push(await captureFlyout(page, 'settings', 'flyout-settings'))

    // Tier-3: hover a screen row inside the Screens flyout.
    await page.goto(`${BASE_URL}/admin/dashboard/overview`)
    await page.waitForTimeout(900)
    await page.locator('.admin-sidebar-nav--desktop a[href$="/screens"]').first().hover()
    await page.waitForTimeout(800)
    await page.locator('.admin-sidebar-nav__flyout--tier2 .admin-sidebar-nav__flyout-row--expandable').first().hover()
    await page.waitForTimeout(900)
    const tier3 = await page.locator('.admin-sidebar-nav__flyout--tier3 .admin-sidebar-nav__flyout-row').allTextContents()
    const tier3Shot = await shoot(page, 'flyout-screens-tier3')
    console.log(`[flyout] tier3: ${JSON.stringify(tier3)}`)
    flyouts.push({ railItem: 'screens-tier3', rows: tier3, screenshot: tier3Shot })

    // Narrow-viewport pass on a representative dense view.
    await page.setViewportSize({ width: 1280, height: 900 })
    await visit(page, 'products-1280', 'Products @1280px', 'products')
    await page.setViewportSize({ width: 2560, height: 1440 })
    await visit(page, 'products-2560', 'Products @2560px', 'products')
    await page.setViewportSize({ width: 1920, height: 1080 })
  } finally {
    writeFileSync(DATA_PATH, JSON.stringify({ records, flyouts, capturedAt: new Date().toISOString() }, null, 2))
    console.log(`\nWrote ${records.length} view records to ${DATA_PATH}`)
    await browser.close()
  }
}

main()
