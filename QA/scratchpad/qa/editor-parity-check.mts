// Ad hoc verification: does ScreenDisplay.tsx's fullscreen editor, with editorTargetViewport set,
// visually match the real kiosk (960x540 @2x)? Captures three screenshots for comparison, all pinned
// to stage 3 (the pane-1a58563b catalogue stage — the one with an absolute-px column-width floor that
// actually differs by viewport, unlike stage 1's transit/weather which turned out aspect-driven):
//   1. editor-unlocked-stage3.png   — the editor with the lock OFF, at a large desktop window (the old, broken state)
//   2. editor-locked-stage3.png     — the editor with the lock ON, at the same large window (should letterbox to 960:540 and match the TV)
//   3. kiosk-controlled-stage3.png  — the real kiosk route, Playwright viewport forced to 960x540 (a clean, precise reference)
import { chromium, type Page } from 'playwright'

const BASE_URL = process.env.QA_BASE_URL ?? 'http://localhost:4173'
const SCREEN_ID = 'screen-624ebb7c-9fb9-493c-86c5-ac2baa8d5210' // "Ny test"
const OUT_DIR = '/private/tmp/claude-501/-Users-yngve-Desktop-GitHub-wraps-coffee/51c37ba2-141a-481a-82c6-66fcdeb509a6/scratchpad'

async function pauseAndScrubToStage3(page: Page) {
  const controls = page.locator('.stage-playback-controls button')
  // index 1 = play/pause toggle — pause first so the 3s-per-stage auto-rotation can't race the two
  // "next stage" clicks below.
  const playing = await page.locator('.stage-playback-controls button').nth(1).getAttribute('aria-label')
  if (playing && !/play/i.test(playing)) await controls.nth(1).click() // currently playing -> pause
  await page.waitForTimeout(200)
  await controls.nth(2).click() // next: stage 1 -> 2
  await page.waitForTimeout(400)
  await controls.nth(2).click() // next: stage 2 -> 3
  await page.waitForTimeout(1200) // let the stage transition animation settle
}

const browser = await chromium.launch({ headless: false })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
page.setDefaultTimeout(15000)

// --- login ---
await page.goto(`${BASE_URL}/admin/login`)
await page.locator('#admin-username').fill('admin')
await page.locator('#admin-password').fill('1234')
await page.locator('form.admin-login__form button[type="submit"]').click()
await page.waitForURL('**/admin/dashboard/**', { timeout: 20000 })
console.log('logged in')

// --- open Ny test's screen form, capture current lock state, ensure lock is ON with the fleet preset ---
await page.goto(`${BASE_URL}/admin/dashboard/screens?screenId=${SCREEN_ID}`)
await page.waitForTimeout(1000)
const lockCheckbox = page.locator('#screen-form-editor-viewport-lock')
await lockCheckbox.waitFor({ timeout: 10000 })
const wasChecked = await lockCheckbox.isChecked()
console.log('lock checkbox was checked before:', wasChecked)

// --- Capture 1: editor UNLOCKED at a large window (old broken behavior) ---
if (wasChecked) {
  await lockCheckbox.uncheck({ force: true })
  await page.locator('.modal button[type="submit"], .screen-form button[type="submit"]').first().click()
  await page.waitForTimeout(1200)
}
await page.goto(`${BASE_URL}/screens/editor/${SCREEN_ID}`)
await page.waitForTimeout(2000)
await pauseAndScrubToStage3(page)
await page.screenshot({ path: `${OUT_DIR}/editor-unlocked-stage3.png` })
console.log('captured editor-unlocked-stage3.png')

// --- Capture 2: editor LOCKED (fleet preset, 960x540 @2x) at the same large window ---
await page.goto(`${BASE_URL}/admin/dashboard/screens?screenId=${SCREEN_ID}`)
await page.waitForTimeout(1000)
await lockCheckbox.waitFor({ timeout: 10000 })
if (!(await lockCheckbox.isChecked())) await lockCheckbox.check({ force: true })
await page.locator('.modal button[type="submit"], .screen-form button[type="submit"]').first().click()
await page.waitForTimeout(1200)
await page.goto(`${BASE_URL}/screens/editor/${SCREEN_ID}`)
await page.waitForTimeout(2000)
await pauseAndScrubToStage3(page)
await page.screenshot({ path: `${OUT_DIR}/editor-locked-stage3.png` })
console.log('captured editor-locked-stage3.png')

// --- Capture 3: real kiosk route, Playwright viewport forced to the TV's own 960x540 (a clean, precise reference).
// No stage-scrubber on this read-only route, so time it instead: slideDurationSeconds=3, so stage 3
// starts ~6s after load — wait 7s to land safely mid-stage-3, comfortably before the ~9s mark where it
// would advance to stage 4.
const kioskPage = await browser.newPage({ viewport: { width: 960, height: 540 } })
await kioskPage.goto(`${BASE_URL}/screens/${SCREEN_ID}?unattended=1`, { waitUntil: 'domcontentloaded' })
await kioskPage.waitForTimeout(7000)
await kioskPage.screenshot({ path: `${OUT_DIR}/kiosk-controlled-stage3.png` })
console.log('captured kiosk-controlled-stage3.png')

await browser.close()
console.log('done')

// --- Bonus check: does the lock actually letterbox at a non-16:9 window (proving the scale-lock, not
// coincidence, is what's aligning things)? ---
