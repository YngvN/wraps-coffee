// Burst-captures the real kiosk route at 960x540 across several timestamps within stage 3's window,
// so a mid-transition frame can be discarded in favor of a settled one (per the consolidated report's
// §10 "adb screencap frequently lands mid-transition" trap — the same applies to a single fixed-delay
// Playwright screenshot).
import { chromium } from 'playwright'

const BASE_URL = process.env.QA_BASE_URL ?? 'http://localhost:4173'
const SCREEN_ID = 'screen-624ebb7c-9fb9-493c-86c5-ac2baa8d5210'
const OUT_DIR = '/private/tmp/claude-501/-Users-yngve-Desktop-GitHub-wraps-coffee/51c37ba2-141a-481a-82c6-66fcdeb509a6/scratchpad'

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 960, height: 540 } })
await page.goto(`${BASE_URL}/screens/${SCREEN_ID}?unattended=1`, { waitUntil: 'domcontentloaded' })

const timestamps = [6300, 7000, 7700, 8400]
let elapsed = 0
for (const target of timestamps) {
  await page.waitForTimeout(target - elapsed)
  elapsed = target
  await page.screenshot({ path: `${OUT_DIR}/kiosk-burst-${target}ms.png` })
  console.log(`captured kiosk-burst-${target}ms.png`)
}

await browser.close()
