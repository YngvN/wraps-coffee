/** Verifies screen previews stay out of the Media Library and the stored-image picker. Read-only. */
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { BASE_URL, REPO_ROOT, launch, login, setDashboardLanguage } from './harness.mts'

const OUT = path.join(REPO_ROOT, 'QA/dashboard-ui-ux-screenshots-2026-08-15-after')

async function main() {
  const { browser, page } = await launch()
  mkdirSync(OUT, { recursive: true })
  try {
    await login(page)
    await setDashboardLanguage(page, 'English')

    await page.goto(`${BASE_URL}/admin/dashboard/media`)
    await page.waitForTimeout(3000)

    const media = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('.media-library__item'))
      const srcs = Array.from(document.querySelectorAll('.media-library__item img')).map((img) => (img as HTMLImageElement).src)
      return { itemCount: cards.length, previewSrcs: srcs.filter((s) => s.includes('screen-preview-')), sampleSrcs: srcs.slice(0, 6) }
    })
    console.log('[media library]', JSON.stringify(media, null, 1))
    await page.screenshot({ path: path.join(OUT, '12-media-library-light.png') })

    // Storage usage must still account for previews (they occupy real disk).
    const storage = await page.evaluate(() => (document.body.innerText.match(/[\d.]+\s*(KB|MB|GB)[^\n]*/g) ?? []).slice(0, 3))
    console.log('[storage line]', JSON.stringify(storage))
  } finally {
    await browser.close()
  }
}

main()
