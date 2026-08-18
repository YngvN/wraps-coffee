/**
 * Scratchpad-only. Sets a display machine's "Render resolution" through the real Display Manager UI
 * (not by writing the data file), so the new picker, the synced write, and the heartbeat plumbing are
 * all exercised the way an admin would exercise them.
 *
 * Usage: QA_BASE_URL=http://localhost:4173 npx tsx QA/scratchpad/qa/set-render-width.mts <machineID> <tier>
 */
import { chromium } from 'playwright'

const BASE_URL = process.env.QA_BASE_URL ?? 'http://localhost:4173'
const machineID = process.argv[2]
const tier = process.argv[3] ?? '1920'
if (!machineID) throw new Error('usage: set-render-width.mts <machineID> <tier>')

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
page.setDefaultTimeout(20000)

await page.goto(`${BASE_URL}/admin/login`)
await page.locator('#admin-username').fill('admin')
await page.locator('#admin-password').fill('1234')
await page.locator('form.admin-login__form button[type="submit"]').click()
await page.waitForURL('**/admin/dashboard/**', { timeout: 20000 })

await page.goto(`${BASE_URL}/admin/dashboard/displays`)
const select = page.locator(`#machine-render-width-${machineID}`)
await select.waitFor({ timeout: 20000 })
console.log('before:', await select.inputValue())
await select.selectOption(tier)
// Writes go through useLocalStorage → debounced publish (see harness.mts's waitForSyncFlush).
await page.waitForTimeout(1200)
console.log('after: ', await select.inputValue())

await browser.close()
