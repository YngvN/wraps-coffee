// Verifies the transit-pane icon-in-badge restyle: the mode icon renders
// inside the same colored badge as the line number (not beside it), fully
// opaque, and the badge's own background/color come from real Entur line
// data when available. Scratchpad-only, not part of the app.
import { chromium } from 'playwright'

const BASE_URL = 'http://localhost:5173'
const SCREEN_ID = 'screen-624ebb7c-9fb9-493c-86c5-ac2baa8d5210' // "Ny test"
const OUT = '/private/tmp/claude-501/-Users-yngve-Desktop-GitHub-wraps-coffee/fe5bfe62-5ce6-4836-88f3-55e0435d6e2a/scratchpad'

async function main() {
  const browser = await chromium.launch({ headless: false })
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
  page.on('dialog', (dialog) => dialog.accept().catch(() => {}))
  page.setDefaultTimeout(15000)
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log('[console error]', msg.text())
  })

  let departuresPayload: any = null
  page.on('response', async (response) => {
    if (response.url().includes('/integrations/departures')) {
      try {
        departuresPayload = await response.json()
      } catch {}
    }
  })

  await page.goto(`${BASE_URL}/admin/login`)
  await page.locator('#admin-username').fill('admin')
  await page.locator('#admin-password').fill('1234')
  await page.locator('form.admin-login__form button[type="submit"]').click()
  await page.waitForURL('**/admin/dashboard/**', { timeout: 20000 })

  // 1. Fullscreen in-place editor.
  await page.goto(`${BASE_URL}/screens/editor/${SCREEN_ID}`)
  await page.waitForSelector('.transit-slide', { timeout: 20000 })
  await page.waitForTimeout(3000)
  await page.screenshot({ path: `${OUT}/transit-editor-full.png` })

  const firstBadge = page.locator('.transit-slide__line').first()
  await firstBadge.waitFor({ state: 'visible' })
  await firstBadge.screenshot({ path: `${OUT}/transit-badge-closeup.png` })

  const badgeInfo = await firstBadge.evaluate((el) => {
    const icon = el.querySelector('.transit-slide__line-icon')
    const iconWrap = el.querySelector('.transit-slide__line-icon-wrap')
    const style = getComputedStyle(el)
    const iconStyle = icon ? getComputedStyle(icon) : null
    return {
      badgeHTML: el.outerHTML.slice(0, 500),
      iconIsInsideBadge: !!iconWrap && el.contains(iconWrap),
      badgeBackground: style.backgroundColor,
      badgeColor: style.color,
      iconFill: iconStyle?.fill,
      iconStroke: iconStyle?.stroke,
    }
  })
  console.log('BADGE INFO (fullscreen editor):', JSON.stringify(badgeInfo, null, 2))

  // 2. Live kiosk display route.
  await page.goto(`${BASE_URL}/screens/${SCREEN_ID}`)
  await page.waitForSelector('.transit-slide', { timeout: 20000 })
  await page.waitForTimeout(3000)
  await page.screenshot({ path: `${OUT}/transit-kiosk-full.png` })

  console.log('DEPARTURES PAYLOAD SAMPLE:', JSON.stringify(departuresPayload?.departures?.slice(0, 5), null, 2))

  // 3. Admin ScreenForm editor.
  await page.goto(`${BASE_URL}/admin/dashboard/screens?screenId=${SCREEN_ID}&tab=layout`)
  await page.waitForTimeout(2000)
  await page.screenshot({ path: `${OUT}/transit-screenform.png`, fullPage: true })

  await browser.close()
}

main().catch((error) => {
  console.error('FATAL', error)
  process.exit(1)
})
