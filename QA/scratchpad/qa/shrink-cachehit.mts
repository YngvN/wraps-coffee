/** Scratchpad-only — does the size-keyed scale cache actually hit during a stage transition? */
import { launch, BASE_URL } from './harness.mts'
interface E { pane: string; phase: string; forcedLayouts: number; cacheHit: boolean; sizeKey: string; ms: number }
const { browser, page } = await launch()
await page.goto(`${BASE_URL}/screens/${process.argv[2] ?? '1783715372380'}?unattended=1`)
await page.locator('.split-layout').first().waitFor({ timeout: 20000 })
await page.waitForTimeout(Number(process.argv[3] ?? 45_000))
const ev = (await page.evaluate(() => (window as unknown as { __qaShrink?: E[] }).__qaShrink ?? [])) as E[]
await browser.close()
const byPhase: Record<string, { n: number; hits: number; forced: number; ms: number }> = {}
for (const e of ev) {
  const r = (byPhase[e.phase] ??= { n: 0, hits: 0, forced: 0, ms: 0 })
  r.n++; if (e.cacheHit) r.hits++; r.forced += e.forcedLayouts; r.ms += e.ms
}
console.log(`events=${ev.length}`)
for (const [p, r] of Object.entries(byPhase)) {
  console.log(`  ${p.padEnd(9)} passes=${String(r.n).padStart(4)}  cacheHits=${String(r.hits).padStart(4)} (${Math.round((r.hits / r.n) * 100)}%)  forced=${String(r.forced).padStart(5)}  ${String(Math.round(r.ms)).padStart(5)}ms`)
}
const keys: Record<string, number> = {}
for (const e of ev) keys[e.sizeKey] = (keys[e.sizeKey] ?? 0) + 1
console.log(`distinct size keys seen: ${Object.keys(keys).length}`)
console.log(Object.entries(keys).sort((a,b)=>b[1]-a[1]).slice(0,12).map(([k,v])=>`${k}:${v}`).join('  '))
