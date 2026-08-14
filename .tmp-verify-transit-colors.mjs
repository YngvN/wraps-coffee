import { chromium } from 'playwright'

const SCRATCH = '/private/tmp/claude-501/-Users-yngve-Desktop-GitHub-wraps-coffee/c4fee091-389e-41fa-92fb-226d34e9cac5/scratchpad'

const browser = await chromium.launch({ headless: false })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
page.on('console', (msg) => {
  if (msg.type() === 'error') console.log('CONSOLE ERROR:', msg.text())
})

await page.goto('http://localhost:5173/')
await page.waitForTimeout(500)
await page.getByLabel('Username').fill('admin')
await page.getByLabel('Password').fill('1234')
await page.getByRole('button', { name: 'Sign in' }).click()
await page.waitForTimeout(1500)

await page.goto('http://localhost:5173/admin/dashboard/screens')
await page.waitForTimeout(1500)

await page.mouse.click(489, 621)
await page.waitForTimeout(400)

const [popup] = await Promise.all([
  page.context().waitForEvent('page'),
  page.getByRole('menuitem', { name: 'Fullscreen editor' }).click(),
])
await popup.waitForLoadState('domcontentloaded')
await popup.waitForTimeout(1000)
if (popup.url().includes('/admin/login')) {
  await popup.getByLabel('Username').fill('admin')
  await popup.getByLabel('Password').fill('1234')
  await popup.getByRole('button', { name: 'Sign in' }).click()
  await popup.waitForTimeout(2000)
}

// Click the transit pane, then "Edit appearance"
await popup.mouse.click(300, 200)
await popup.waitForTimeout(500)
await popup.getByRole('button', { name: 'Edit appearance' }).click()
await popup.waitForTimeout(800)
await popup.screenshot({ path: `${SCRATCH}/10-fullscreen-pane-editor.png` })

await browser.close()
