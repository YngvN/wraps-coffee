// Scratchpad-only — desktop baseline for the P2/P1 capability probe. Prints what `capabilityProbe.mts`
// reports in ordinary desktop Chromium, so the TV's numbers have something to be read against.
import { chromium } from 'playwright'
import { capabilityProbeSource } from './capabilityProbe.mts'
const browser = await chromium.launch()
const page = await browser.newPage()
await page.addInitScript(capabilityProbeSource('http://127.0.0.1:1/unused'))
await page.goto('http://localhost:4173/')
console.log(JSON.stringify(await page.evaluate(() => (window as unknown as { __qaCapability: unknown }).__qaCapability), null, 2))
await browser.close()
