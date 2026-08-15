/**
 * Scratchpad-only audit — not part of the app. Watches the "EXTREME anim test" screen through a full
 * cycle of its own stage rotation on the **read-only kiosk route** (`/screens/:id?unattended=1`) —
 * the same URL the TV companion's WebView loads, and the only surface the geometry-driven flat pane
 * layer actually takes over — and reports, per transition:
 *
 *   snap  = the worst pane's *fraction* of its whole move completed in the first 80ms after the
 *           geometry commit. ~100% means it jumped the entire distance in one frame; a low number
 *           means it eased. A fraction rather than a pixel count so the metric survives a change of
 *           animation duration and stays comparable between two architectures whose animations aren't
 *           the same length. `(NNNpx)` is how far that pane travelled in total, for context.
 *           Measured on *visible* rects — the flat path animates `clip-path` for entering panes, and
 *           `getBoundingClientRect` ignores clipping (see `transitionSamplerSource`).
 *   brdr  = the worst |border line − the pane edge it should be sitting on| through the transition.
 *           Non-zero means the line is drifting out of sync with the geometry it frames.
 *   ident = how many panes present on *both* sides of the transition kept the same DOM element.
 *           Anything short of all of them is the remount bug: React tore those panes down and rebuilt
 *           them, taking `<video>` playback, scroll offsets and crossfade state with them.
 *   frames/worst/>16.7/>33 = the in-page `requestAnimationFrame` frame-cost sampler, segmented per
 *           transition. `snap` says whether the geometry animated; these say what it cost.
 *
 * Because it drives nothing and only observes, the identical script measures both architectures —
 * flip `ENABLE_FLAT_PANE_LAYOUT` and re-run.
 */
import { launch, BASE_URL } from './harness.mts'
import { frameSamplerSource, transitionSamplerSource, type FrameWindow, type TransitionSample } from './frameSampler.mts'

const SCREEN_ID = process.argv[2] ?? 'screen-extreme-anim-test'
/** One full rotation of the fixture (9 stages x 8s) plus a margin, in ms. */
const RUN_MS = Number(process.argv[3] ?? 88_000)

async function main() {
  const { browser, page } = await launch()
  await page.addInitScript(frameSamplerSource())
  await page.addInitScript(transitionSamplerSource())
  await page.goto(`${BASE_URL}/screens/${SCREEN_ID}?unattended=1`)
  await page.locator('.split-layout').first().waitFor({ timeout: 20000 })

  const flat = await page.evaluate(() => document.querySelectorAll('.layout-tree__split').length === 0)
  console.log(`route=kiosk  path=${flat ? 'FLAT (absolutely-positioned panes)' : 'NESTED (grid recursion)'}  watching ${RUN_MS / 1000}s...\n`)

  const deadline = Date.now() + RUN_MS
  let reported = 0
  while (Date.now() < deadline) {
    await page.waitForTimeout(1000)
    const [transitions, frames] = await Promise.all([
      page.evaluate(() => (window as unknown as { __qaTransitions?: TransitionSample[] }).__qaTransitions ?? []),
      page.evaluate(() => (window as unknown as { __qaFrameWindows?: FrameWindow[] }).__qaFrameWindows ?? []),
    ])
    // A transition is only printed once its frame window has closed too, so both halves of the row
    // are final rather than the frame half lagging a transition behind.
    while (reported < Math.min(transitions.length, frames.length)) {
      console.log('  ' + row(transitions[reported], frames[reported]))
      reported += 1
    }
  }

  const [transitions, frames] = await Promise.all([
    page.evaluate(() => (window as unknown as { __qaTransitions?: TransitionSample[] }).__qaTransitions ?? []),
    page.evaluate(() => (window as unknown as { __qaFrameWindows?: FrameWindow[] }).__qaFrameWindows ?? []),
  ])
  console.log('\n=== SUMMARY ===')
  transitions.forEach((transition, i) => console.log(row(transition, frames[i])))
  await browser.close()
}

function row(t: TransitionSample, f: FrameWindow | undefined): string {
  const shared = t.survived + t.remounted
  const identity = shared === 0 ? 'n/a (no shared panes)' : `${t.survived}/${shared} kept`
  const frameCell = f
    ? `f=${String(f.frames).padStart(3)} worst=${String(f.worstMs).padStart(6)}ms >16.7=${String(f.over16_7).padStart(3)} >33=${String(f.over33).padStart(3)}`
    : 'f=  (no frame window)'
  return (
    `${t.fromStage} -> ${t.toStage}   snap=${String(t.snapPercent).padStart(3)}% of ${String(t.totalPx).padStart(4)}px (${t.snapPane.replace('pane-x-', '').replace('pane-r-', '').padEnd(8)})   ` +
    `brdr=${t.borderErrorPx.toFixed(1).padStart(6)}px   ${frameCell}   ident=${identity}`
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
