// QA automation for qa-test-plan-display-pairing-2026-08-06.md's own U1-U5 scenarios.
// Scratchpad-only, not part of the app. Run with: npx tsx display-pairing-ui.mts
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import path from 'node:path'

const BASE_URL = 'http://localhost:5173'
const SCREEN_DIR = '/private/tmp/claude-501/-Users-yngve-Desktop-GitHub-wraps-coffee/6cd4e7dc-bb22-4c07-bc58-4b078c02bd07/scratchpad/qa-backup/screenshots'
mkdirSync(SCREEN_DIR, { recursive: true })

const A_ID = process.argv[2]
const A_PIN = process.argv[3]
if (!A_ID || !A_PIN) {
  console.error('Usage: tsx display-pairing-ui.mts <deviceA machineID> <deviceA pin>')
  process.exit(1)
}

let shotCounter = 0
async function shot(page: import('playwright').Page, name: string) {
  shotCounter += 1
  const file = path.join(SCREEN_DIR, `${String(shotCounter).padStart(2, '0')}-${name}.png`)
  await page.screenshot({ path: file, fullPage: true }).catch(() => {})
  console.log(`  screenshot: ${file}`)
}

async function main() {
  const browser = await chromium.launch({ headless: false })
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
  page.on('dialog', (dialog) => dialog.accept().catch(() => {}))
  page.setDefaultTimeout(15000)

  console.log('--- Login ---')
  await page.goto(`${BASE_URL}/admin/login`)
  await page.locator('#admin-username').fill('admin')
  await page.locator('#admin-password').fill('1234')
  await page.locator('form.admin-login__form button[type="submit"]').click()
  await page.waitForURL('**/admin/dashboard/**', { timeout: 20000 })

  console.log('--- Navigate to Display Manager (deep link) ---')
  await page.goto(`${BASE_URL}/admin/dashboard/screens?displayManager=1`)
  await page.waitForSelector('.display-manager-view', { timeout: 15000 })

  // U1: pairing-requests section renders with device A's label + PIN + "requested Xm ago"
  console.log('\n=== U1: Pairing requests section shows device A ===')
  await page.waitForSelector('.display-manager-view__pairing-section', { timeout: 15000 })
  const cardText = await page.locator('.display-manager-view__pairing-card').filter({ hasText: 'QA Test — Device A' }).innerText()
  console.log('Card text:', cardText.replace(/\n/g, ' | '))
  const pinShown = await page.locator('.display-manager-view__pairing-card').filter({ hasText: 'QA Test — Device A' }).locator('.display-manager-view__pairing-pin').innerText()
  console.log('PIN shown on card:', pinShown, '| expected:', A_PIN)
  await shot(page, 'u1-pairing-section')

  const card = page.locator('.display-manager-view__pairing-card').filter({ hasText: 'QA Test — Device A' })

  // U2: wrong PIN -> inline error, card stays
  console.log('\n=== U2: wrong PIN shows error ===')
  await card.locator('input').fill('000000')
  await card.getByRole('button', { name: /approve/i }).click()
  await page.waitForTimeout(800)
  const errorVisible = await page.locator('.display-manager-view__pairing-section .alert--error').isVisible().catch(() => false)
  console.log('Error alert visible:', errorVisible)
  const errorText = errorVisible ? await page.locator('.display-manager-view__pairing-section .alert--error').innerText() : '(none)'
  console.log('Error text:', errorText)
  const cardStillThere = await card.isVisible().catch(() => false)
  console.log('Device A card still present after wrong PIN:', cardStillThere)
  await shot(page, 'u2-wrong-pin-error')

  // U3: correct PIN -> success notice, card gone, new machine card with badge
  console.log('\n=== U3: correct PIN approves ===')
  await card.locator('input').fill(A_PIN)
  await card.getByRole('button', { name: /approve/i }).click()
  await page.waitForTimeout(1200)
  const successVisible = await page.locator('.display-manager-view__pairing-section .alert--success, .display-manager-view .alert--success').isVisible().catch(() => false)
  const successText = successVisible
    ? await page.locator('.display-manager-view__pairing-section .alert--success, .display-manager-view .alert--success').innerText()
    : '(none)'
  console.log('Success notice visible:', successVisible, '| text:', successText)
  const cardGone = !(await card.isVisible().catch(() => false))
  console.log('Device A pairing card gone:', cardGone)
  const machineBadge = page.locator('.display-manager-view__machines .display-manager-view__badge--mobile')
  const badgeCount = await machineBadge.count()
  console.log('Mobile badge count in machines grid:', badgeCount)
  await shot(page, 'u3-approved')

  // U4: Pair a mobile display modal
  console.log('\n=== U4: Pair a mobile display modal ===')
  await page.getByRole('button', { name: /pair a mobile display/i }).click()
  await page.waitForTimeout(800)
  const modalVisible = await page.locator('.modal').isVisible().catch(() => false)
  console.log('Modal visible:', modalVisible)
  const qrVisible = await page.locator('.display-manager-view__pair-qr svg').isVisible().catch(() => false)
  console.log('QR SVG visible:', qrVisible)
  const manualText = await page.locator('.display-manager-view__pair-manual').innerText().catch(() => '(none)')
  console.log('Manual entry text:', manualText)
  await shot(page, 'u4-pair-modal')
  await page.locator('.modal__close').click()
  await page.waitForTimeout(500)

  // U5: remove device A machine, then curl heartbeat should 409 (checked outside this script)
  console.log('\n=== U5: remove device A machine via Display Manager ===')
  const machineCard = page.locator('.display-manager-view__machines .card, .display-manager-view__machines > *').filter({ hasText: 'QA Test — Device A' })
  const removeButton = machineCard.locator('.display-manager-view__remove-button')
  await removeButton.click()
  await page.waitForTimeout(800)
  const machineGone = !(await machineCard.isVisible().catch(() => false))
  console.log('Device A machine card removed:', machineGone)
  await shot(page, 'u5-removed')

  await browser.close()
  console.log('\nDone.')
}

main().catch((error) => {
  console.error('FATAL', error)
  process.exit(1)
})
