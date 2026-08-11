import { chromium } from 'playwright'

const shotDir = '/private/tmp/claude-501/-Users-yngve-Desktop-GitHub-wraps-coffee/8471e459-a7c7-40b3-847b-f57c6052c219/scratchpad/shots'

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
  await page.getByLabel('Username').fill('admin')
  await page.getByLabel('Password').fill('1234')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL(/dashboard/, { timeout: 15000 })

  await page.goto('http://localhost:5173/admin/dashboard/screens')
  await page.waitForSelector('.screen-card', { timeout: 15000 })

  // ---- Test A: multi-stage screen (Screen 3, 3 steps) — save it, confirm 3 distinct per-stage screenshots ----
  const screen3Card = page.locator('.screen-card', { has: page.locator('text=Screen 3') })
  await screen3Card.getByLabel('Edit', { exact: true }).click()
  await page.getByRole('menuitem', { name: 'Edit', exact: true }).click()
  await page.waitForSelector('.screen-form', { timeout: 15000 })
  const nameInput = await page.$('#screen-name')
  const originalName = await nameInput.inputValue()
  await nameInput.fill(originalName + ' (verify)')
  await page.click('.screen-form button[type="submit"]')
  await page.waitForSelector('.screen-form', { state: 'detached', timeout: 5000 })

  // Poll for previewImages to land on Screen 3's card
  let stage1Src = null
  for (let i = 0; i < 30; i++) {
    stage1Src = await screen3Card.locator('.screen-card__preview-image').getAttribute('src').catch(() => null)
    if (stage1Src) break
    await page.waitForTimeout(1000)
  }
  console.log('Screen 3 stage 1 preview:', stage1Src)
  await shot('10-multistage-stage1')

  if (stage1Src) {
    // Click "next stage" and confirm the image src changes
    await screen3Card.locator('.screen-card__stage-button').nth(1).click()
    await page.waitForTimeout(300)
    const stage2Src = await screen3Card.locator('.screen-card__preview-image').getAttribute('src').catch(() => null)
    console.log('Screen 3 stage 2 preview:', stage2Src)
    console.log('stage images differ:', stage1Src !== stage2Src)
    await shot('11-multistage-stage2')
  }

  // ---- Test B: fullscreen editor publish path ----
  await page.goto('http://localhost:5173/admin/dashboard/screens')
  await page.waitForSelector('.screen-card', { timeout: 15000 })
  const testScreenCard = page.locator('.screen-card', { has: page.locator('text=Test screen') })
  await testScreenCard.getByLabel('Edit', { exact: true }).click()
  await page.getByRole('menuitem', { name: 'Fullscreen editor' }).click()
  await page.waitForURL(/\/screens\/editor\//, { timeout: 15000 })
  await page.waitForSelector('.split-layout', { timeout: 15000 })
  await shot('12-fullscreen-editor-open')

  // Confirm live editing toggle exists; turn it off if on, to force draft+publish flow
  const liveEditingCheckbox = page.locator('input[type="checkbox"]').first()
  console.log('fullscreen editor has live .split-layout:', await page.$eval('.split-layout', () => true).catch(() => false))

  await shot('13-fullscreen-editor-final')

  console.log('CONSOLE_ERRORS:', JSON.stringify(errors.filter((e) => !e.includes('cssRules') && !e.includes('reading CSS rules')), null, 2))
} catch (err) {
  console.log('SCRIPT_ERROR:', err.message)
  await shot('98-error2')
} finally {
  await browser.close()
}
