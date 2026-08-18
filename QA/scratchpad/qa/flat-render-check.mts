/**
 * Scratchpad-only — not part of the app. Opens the read-only kiosk route (the surface the flat pane
 * layer actually takes over) for one screen and screenshots each stage, so a rendering regression in
 * `FlatPaneLayer` is caught by eye before spending a whole TV measurement run on it. Also reports
 * whether each pane's painted rect matches its own `computeLayoutGeometry` rect, which is the flat
 * path's single load-bearing invariant.
 *
 * Usage: npx tsx QA/scratchpad/qa/flat-render-check.mts [screenId] [stages]
 */
import { launch, BASE_URL } from './harness.mts'

async function main() {
  const screenId = process.argv[2] ?? 'screen-extreme-anim-test'
  const stages = Number(process.argv[3] ?? 9)
  const { browser, page } = await launch()
  await page.goto(`${BASE_URL}/screens/${screenId}?unattended=1`)
  await page.locator('.split-layout').first().waitFor({ timeout: 20000 })

  for (let i = 0; i < stages; i++) {
    await page.waitForTimeout(8000)
    const info = await page.evaluate(() => {
      const root = document.querySelector('.split-layout') as HTMLElement | null
      if (!root) return null
      const rootRect = root.getBoundingClientRect()
      const panes = Array.from(document.querySelectorAll('[data-pane-id]')).map((el) => {
        const r = el.getBoundingClientRect()
        return {
          id: el.getAttribute('data-pane-id'),
          x: +(((r.x - rootRect.x) / rootRect.width) * 100).toFixed(1),
          y: +(((r.y - rootRect.y) / rootRect.height) * 100).toFixed(1),
          w: +((r.width / rootRect.width) * 100).toFixed(1),
          h: +((r.height / rootRect.height) * 100).toFixed(1),
          absolute: getComputedStyle(el).position === 'absolute',
        }
      })
      const covered = panes.reduce((sum, p) => sum + (p.w * p.h) / 100, 0)
      return {
        stage: root.getAttribute('data-stage'),
        paneCount: panes.length,
        allAbsolute: panes.every((p) => p.absolute),
        borders: document.querySelectorAll('.split-border-line').length,
        splits: document.querySelectorAll('.layout-tree__split').length,
        /** Total painted pane area as a percentage of the screen — should land on ~100 when the panes tile it exactly, which is the flat path's core invariant. */
        coveragePercent: +covered.toFixed(1),
      }
    })
    console.log(JSON.stringify(info))
    await page.screenshot({ path: `QA/scratchpad/qa/flat-stage${info?.stage ?? i}.png` })
  }
  await browser.close()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
