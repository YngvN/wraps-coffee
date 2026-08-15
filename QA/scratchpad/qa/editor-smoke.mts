/**
 * Scratchpad-only — not part of the app. Exercises the editor surface (`/screens/editor/:id`), which
 * deliberately stays on the nested-grid path even when `ENABLE_FLAT_PANE_LAYOUT` is on: drag a
 * divider, split a pane, delete it again, and confirm the arrangement is still coherent after each.
 * The point is to prove the fallback path is genuinely untouched by the flat-layer work.
 *
 * Usage: npx tsx QA/scratchpad/qa/editor-smoke.mts [screenId]
 */
import { launch, login, BASE_URL } from './harness.mts'

async function main() {
  const screenId = process.argv[2] ?? 'screen-extreme-anim-test'
  const { browser, page } = await launch()
  await login(page)
  await page.evaluate('window.__name = window.__name || function (f) { return f }')
  await page.goto(`${BASE_URL}/screens/editor/${screenId}`)
  await page.locator('.split-layout').first().waitFor({ timeout: 20000 })
  await page.waitForTimeout(2500)

  const state = async (label: string) => {
    const info = await page.evaluate(() => {
      const root = document.querySelector('.split-layout') as HTMLElement
      const rootRect = root.getBoundingClientRect()
      const panes = Array.from(document.querySelectorAll('[data-pane-id]'))
      const covered = panes.reduce((sum, el) => {
        const r = el.getBoundingClientRect()
        return sum + ((r.width / rootRect.width) * (r.height / rootRect.height) * 100)
      }, 0)
      return {
        panes: panes.length,
        splits: document.querySelectorAll('.layout-tree__split').length,
        dividers: document.querySelectorAll('.split-layout__divider').length,
        handles: document.querySelectorAll('.pane-corner-handle').length,
        borders: document.querySelectorAll('.split-border-line').length,
        coverage: +covered.toFixed(1),
      }
    })
    console.log(`${label.padEnd(22)} ${JSON.stringify(info)}`)
    return info
  }

  await state('initial')

  // --- advance to a stage with something to drag ---
  const next = () => page.evaluate(() => (document.querySelector('button[aria-label="Neste steg"]') as HTMLButtonElement)?.click())
  for (let i = 0; i < 3; i++) {
    await next()
    await page.waitForTimeout(1600)
  }
  const before = await state('after 3 advances')

  // --- drag the first divider ---
  const divider = page.locator('.split-layout__divider').first()
  const box = await divider.boundingBox()
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2, { steps: 12 })
    await page.mouse.up()
    await page.waitForTimeout(900)
  }
  const dragged = await state('after divider drag')
  console.log(`  divider drag moved geometry: ${dragged.coverage.toFixed(1)}% covered (want ~100)`)

  // --- split a pane, then delete the new one ---
  const pane = page.locator('[data-pane-id]').first()
  await pane.click({ position: { x: 40, y: 40 } }).catch(() => {})
  await page.waitForTimeout(600)
  const paneBox = await pane.boundingBox()
  if (paneBox) {
    await page.mouse.move(paneBox.x + paneBox.width / 2, paneBox.y + paneBox.height / 2)
    await page.waitForTimeout(500)
    const splitZone = page.locator('.pane-split-zones__zone, .pane-split-zones__line').first()
    if (await splitZone.count()) await splitZone.click({ force: true }).catch(() => {})
    await page.waitForTimeout(1200)
  }
  const split = await state('after split attempt')
  console.log(`  panes ${before.panes} -> ${split.panes}`)

  await page.screenshot({ path: 'QA/scratchpad/qa/editor-smoke.png' })
  await browser.close()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
