import { chromium } from 'playwright'

const shotDir = '/private/tmp/claude-501/-Users-yngve-Desktop-GitHub-wraps-coffee/8471e459-a7c7-40b3-847b-f57c6052c219/scratchpad/shots'
await import('node:fs').then((fs) => fs.mkdirSync(shotDir, { recursive: true }))

const browser = await chromium.launch({ headless: false })
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } })
const errors = []
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text())
})
page.on('pageerror', (err) => errors.push('pageerror: ' + err.message))

async function shot(name) {
  await page.screenshot({ path: `${shotDir}/${name}.png` })
  console.log('screenshot:', name)
}

try {
  await page.goto('http://localhost:5173/admin/login')
  await page.waitForSelector('text=Username', { timeout: 15000 })
  await shot('01-login')

  // Fill login form — default seed admin/1234
  await page.getByLabel('Username').fill('admin')
  await page.getByLabel('Password').fill('1234')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL(/dashboard/, { timeout: 15000 })
  console.log('logged in')

  await page.goto('http://localhost:5173/admin/dashboard/screens')
  await page.waitForSelector('.screen-card', { timeout: 15000 })
  await shot('02-screens-list')

  const cardCount = await page.$$eval('.screen-card', (els) => els.length)
  console.log('screen cards found:', cardCount)

  // Inspect the first card: is it a live SplitLayout or a static <img>?
  const firstCardInfo = await page.$eval('.screen-card', (el) => {
    const img = el.querySelector('.screen-card__preview-image')
    const splitLayout = el.querySelector('.split-layout')
    return { hasImg: Boolean(img), imgSrc: img?.getAttribute('src') ?? null, hasSplitLayout: Boolean(splitLayout) }
  })
  console.log('first card render mode:', JSON.stringify(firstCardInfo))

  // Open the first screen's editor — the split Edit button opens a small
  // dropdown ("Edit" vs "Fullscreen editor"); click it, then the "Edit" item.
  await page.locator('.screen-card').first().getByLabel('Edit', { exact: true }).click()
  await page.getByRole('menuitem', { name: 'Edit', exact: true }).click()
  await page.waitForSelector('.screen-form', { timeout: 15000 })
  await shot('03-screen-form-open')

  // Confirm the Layout tab / preview still shows a real live SplitLayout
  const formHasLiveLayout = await page.$eval('.screen-form', (el) => Boolean(el.querySelector('.split-layout'))).catch(() => false)
  console.log('ScreenForm has live .split-layout somewhere on main tab:', formHasLiveLayout)

  // Change the screen name slightly to force a real diff, then Save
  const nameInput = await page.$('#screen-name')
  const originalName = await nameInput.inputValue()
  await nameInput.fill(originalName + ' (verify)')
  await shot('04-before-save')

  const saveClickTime = Date.now()
  await page.click('.screen-form button[type="submit"]')
  // Save should close the modal near-instantly (not block on capture)
  await page.waitForSelector('.screen-form', { state: 'detached', timeout: 5000 }).catch(() => {})
  const saveDurationMs = Date.now() - saveClickTime
  console.log('save-to-modal-close duration ms:', saveDurationMs)

  await shot('05-after-save-immediate')

  // Wait for background capture+upload to land (poll the card for an <img>)
  let capturedAfterMs = null
  const pollStart = Date.now()
  for (let i = 0; i < 30; i++) {
    const info = await page.$eval('.screen-card', (el) => {
      const img = el.querySelector('.screen-card__preview-image')
      return img?.getAttribute('src') ?? null
    })
    if (info) {
      capturedAfterMs = Date.now() - pollStart
      console.log('preview image appeared after ms:', capturedAfterMs, 'src:', info)
      break
    }
    await page.waitForTimeout(1000)
  }
  if (!capturedAfterMs) console.log('preview image NEVER appeared within 30s')

  await shot('06-after-capture')

  console.log('CONSOLE_ERRORS:', JSON.stringify(errors, null, 2))
} catch (err) {
  console.log('SCRIPT_ERROR:', err.message)
  await shot('99-error')
  console.log('CONSOLE_ERRORS_ON_ERROR:', JSON.stringify(errors, null, 2))
} finally {
  await browser.close()
}
