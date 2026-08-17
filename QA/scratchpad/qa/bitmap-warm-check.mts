/**
 * Scratchpad-only — verifies the slide-bitmap cache actually engages, which no frame measurement can.
 *
 * There are three ways this feature fails while looking perfectly healthy, and they are indistinguishable
 * from each other (and from success) by `debtByPhase`:
 *
 *  1. `warmSlideBitmaps` captures nothing — every pane renders live, exactly as before the feature.
 *  2. It captures, but the keys it writes never match what a pane looks up, so every read misses. This
 *     exact class of bug has bitten this investigation three times (report facts 16, 21, 23), which is
 *     why the fingerprint is published on the element and read back rather than derived twice.
 *  3. It captures and hits, but the layer never renders because the showing window is wrong.
 *
 * So this reports, separately: how many bitmaps the store holds, what it holds them under, and whether
 * a `.slide-bitmap-layer` was ever actually in the DOM during a transition.
 *
 * Usage:
 *   QA_BASE_URL=http://localhost:4173 npx tsx QA/scratchpad/qa/bitmap-warm-check.mts <screenId> [runMs]
 */
import { chromium } from 'playwright'
import { BASE_URL } from './harness.mts'

const SCREEN_ID = process.argv[2] ?? 'screen-624ebb7c-9fb9-493c-86c5-ac2baa8d5210'
const RUN_MS = Number(process.argv[3] ?? 90_000)

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 960, height: 540 } })
page.on('console', (message) => {
  const text = message.text()
  if (text.includes('warmSlideBitmaps') || text.includes('warmShrinkScales')) console.log(`[page] ${text}`)
})
await page.goto(`${BASE_URL}/screens/${SCREEN_ID}?unattended=1`, { waitUntil: 'domcontentloaded' })

let layerSeen = 0
/** Distinct (paneId, whether an <img> actually resolved) pairs — a layer that mounts but whose image never decodes is failure 3 wearing success's clothes. */
const layerStates = new Map<string, { paneId: string | null; complete: boolean; natural: string }>()
const deadline = Date.now() + RUN_MS

while (Date.now() < deadline) {
  const sample = await page.evaluate(() => {
    const layers = Array.from(document.querySelectorAll('.slide-bitmap-layer')).map((layer) => {
      const img = layer.querySelector('img') as HTMLImageElement | null
      return {
        paneId: layer.closest('[data-pane-id]')?.getAttribute('data-pane-id') ?? null,
        complete: Boolean(img?.complete),
        natural: img ? `${img.naturalWidth}x${img.naturalHeight}` : 'none',
      }
    })
    const store = (window as unknown as { __qaSlideBitmaps?: () => { size: number; keys: string[] } }).__qaSlideBitmaps
    return { layers, store: store ? store() : null }
  })
  for (const layer of sample.layers) {
    layerSeen++
    layerStates.set(`${layer.paneId}|${layer.complete}|${layer.natural}`, layer)
  }
  if (Date.now() > deadline - 1000) {
    console.log(`\nstore size: ${sample.store?.size ?? 'probe absent — this build has no bitmap store'}`)
    for (const key of sample.store?.keys ?? []) console.log(`  ${key}`)
  }
}

await browser.close()

console.log(`\nlayer mounted during a transition: ${layerSeen > 0 ? 'YES' : 'NO'} (${layerSeen} samples, ${layerStates.size} distinct states)`)
for (const state of layerStates.values()) console.log(`  pane ${state.paneId} complete=${state.complete} natural=${state.natural}`)
const broken = [...layerStates.values()].filter((state) => !state.complete || state.natural === '0x0')
console.log(`every mounted layer had a decoded image: ${broken.length === 0 ? 'YES' : `NO — ${broken.length} states had an unresolved image`}`)
