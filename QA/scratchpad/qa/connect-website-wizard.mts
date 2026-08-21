import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

/**
 * Walks the guided "Connect to website" setup and captures each screen.
 *
 * Read-only by intent: it navigates and screenshots, and never presses a
 * button that would save a value, so the live connection settings are left
 * exactly as they were.
 */

const BASE_URL = process.env.QA_BASE_URL ?? 'http://localhost:5173'
const OUT = 'QA/scratchpad/qa/connect-website-screenshots'
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ headless: false, slowMo: 220 })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })

/** Raw i18n keys render as literal `admin.settings.website.…` text when a translation is missing. */
const rawKeys: string[] = []
const consoleErrors: string[] = []
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text())
})

async function shot(name: string) {
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true })
  const body = (await page.locator('body').innerText()).match(/admin\.[a-zA-Z.]+/g)
  if (body) rawKeys.push(`${name}: ${[...new Set(body)].join(', ')}`)
  console.log(`captured ${name}`)
}

await page.goto(`${BASE_URL}/admin`)

// A stored session skips the login form, so poll for it rather than assuming
// either outcome. (Promise.race is wrong here: the losing branch rejects on
// timeout and takes the race with it.)
let loggedIn = false
for (let attempt = 0; attempt < 20; attempt++) {
  if (await page.locator('#admin-username').isVisible().catch(() => false)) {
    await page.locator('#admin-username').fill('admin')
    await page.locator('#admin-password').fill('1234')
    await page.locator('button[type="submit"]').click()
    await page.waitForTimeout(2000)
    loggedIn = true
    break
  }
  if (page.url().includes('/dashboard')) {
    loggedIn = true
    break
  }
  await page.waitForTimeout(500)
}
if (!loggedIn) throw new Error('Could not reach the dashboard — is the dev server up?')
console.log('signed in')

// The settings list — the new row should be there, admin-only.
await page.goto(`${BASE_URL}/admin/dashboard/settings`)
await page.waitForTimeout(700)
await shot('01-settings-list')

// The wizard itself. An existing connection lands on the summary.
await page.goto(`${BASE_URL}/admin/dashboard/settings/website`)
await page.waitForTimeout(1200)
await shot('02-summary')

// Dark mode on the same screen.
await page.emulateMedia({ colorScheme: 'dark' })
await page.waitForTimeout(400)
await shot('03-summary-dark')
await page.emulateMedia({ colorScheme: 'light' })

// Each step, reached from the summary's own Edit buttons.
const editButtons = page.locator('.connection-summary__facts button')
if ((await editButtons.count()) > 0) {
  await editButtons.first().click()
  await page.waitForTimeout(700)
  await shot('04-database-step')
  await page.locator('.setup-step__actions button').first().click()
  await page.waitForTimeout(700)
}

// The connection test, which runs on arrival.
await page.goto(`${BASE_URL}/admin/dashboard/settings/website`)
await page.waitForTimeout(1000)
const testButton = page.getByRole('button', { name: /test|sjekk/i }).first()
if (await testButton.isVisible().catch(() => false)) {
  await testButton.click()
  await page.waitForTimeout(6000)
  await shot('05-test-results')
}

// Norwegian, to catch untranslated keys.
await page.goto(`${BASE_URL}/admin/dashboard/settings`)
await page.waitForTimeout(500)
const langSelect = page.locator('select').first()
if (await langSelect.isVisible().catch(() => false)) {
  await langSelect.selectOption('no').catch(() => {})
  await page.waitForTimeout(500)
  await page.goto(`${BASE_URL}/admin/dashboard/settings/website`)
  await page.waitForTimeout(1200)
  await shot('06-summary-norwegian')
  await langSelect.selectOption('en').catch(() => {})
}

// The picker and the keys step aren't reachable from a configured summary,
// so they're rendered directly by temporarily clearing the saved connection.
console.log('\n--- raw i18n keys visible on screen ---')
console.log(rawKeys.length ? rawKeys.join('\n') : 'none')
console.log('\n--- console errors ---')
console.log(consoleErrors.length ? consoleErrors.slice(0, 10).join('\n') : 'none')

await browser.close()
