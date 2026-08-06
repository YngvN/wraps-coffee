// Retest for the success-notice-visibility bugfix in DisplayManagerView.tsx (see
// qa-report-display-pairing-2026-08-06.md). Scratchpad-only, not part of the app.
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import path from 'node:path'

const BASE_URL = 'http://localhost:5173'
const SCREEN_DIR = '/private/tmp/claude-501/-Users-yngve-Desktop-GitHub-wraps-coffee/6cd4e7dc-bb22-4c07-bc58-4b078c02bd07/scratchpad/qa-backup/screenshots'
mkdirSync(SCREEN_DIR, { recursive: true })

const A2_ID = process.argv[2]
const A2_PIN = process.argv[3]
const LABEL = 'QA Test — Device A2 (bugfix retest)'

async function main() {
  const browser = await chromium.launch({ headless: false })
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
  page.on('dialog', (dialog) => dialog.accept().catch(() => {}))
  page.setDefaultTimeout(15000)

  await page.goto(`${BASE_URL}/admin/login`)
  await page.locator('#admin-username').fill('admin')
  await page.locator('#admin-password').fill('1234')
  await page.locator('form.admin-login__form button[type="submit"]').click()
  await page.waitForURL('**/admin/dashboard/**', { timeout: 20000 })
  await page.goto(`${BASE_URL}/admin/dashboard/screens?displayManager=1`)
  await page.waitForSelector('.display-manager-view', { timeout: 15000 })

  console.log('=== U3 retest: approve the only pending device, check success notice persists ===')
  const card = page.locator('.display-manager-view__pairing-card').filter({ hasText: LABEL })
  await card.waitFor({ state: 'visible', timeout: 15000 })
  await card.locator('input').fill(A2_PIN)
  await card.getByRole('button', { name: /approve/i }).click()
  await page.waitForTimeout(1200)

  const successVisible = await page.locator('.display-manager-view .alert--success').isVisible().catch(() => false)
  const successText = successVisible ? await page.locator('.display-manager-view .alert--success').innerText() : '(none)'
  console.log('Success notice visible after list emptied:', successVisible, '| text:', successText)
  const pairingSectionStillMounted = await page.locator('.display-manager-view__pairing-section').isVisible().catch(() => false)
  console.log('Pairing section still mounted (to host the notice):', pairingSectionStillMounted)
  const titleGone = (await page.locator('.display-manager-view__pairing-title').count()) === 0
  console.log('Section title correctly hidden now that the list is empty:', titleGone)

  await page.screenshot({ path: path.join(SCREEN_DIR, '06-u3-retest-notice-persists.png'), fullPage: true }).catch(() => {})

  // Clean up: remove the newly-approved machine.
  const machineCard = page.locator('.display-manager-view__machines .card, .display-manager-view__machines > *').filter({ hasText: LABEL })
  await machineCard.locator('.display-manager-view__remove-button').click()
  await page.waitForTimeout(800)
  console.log('Cleanup: machine card removed:', !(await machineCard.isVisible().catch(() => false)))

  await browser.close()
}

main().catch((error) => {
  console.error('FATAL', error)
  process.exit(1)
})
