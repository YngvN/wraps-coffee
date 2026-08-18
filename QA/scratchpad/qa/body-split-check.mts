/**
 * Scratchpad-only — verifies the chrome/body split (`LayoutPane.tsx`'s `BODY_ONLY_REFLOW`) actually
 * engages, which frame numbers and screenshots both fail to prove.
 *
 * The behaviour under test is a *timing* one: while a pane keeps the same content but changes shape,
 * its `[data-slide-body]` should fade and leave layout while its chrome stays painted. On the TV that
 * state lasts under a second and an `adb` screencap lands on it only by luck — and a frame showing a
 * fully-rendered pane is equally consistent with "the split never engaged", which is exactly the class
 * of silent no-op the consolidated report's §10 keeps warning about.
 *
 * So this samples the DOM directly, at speed, and reports what states were actually observed:
 * whether `--body-hidden` / `--body-skipped` ever appeared, whether the chrome kept a non-zero opacity
 * while they did, and the body's own computed opacity/`content-visibility` at that moment.
 *
 * **Known limitation — read before believing a failure.** The final "body fully gone before the box
 * moves" assertion does not know whether the pane it is looking at actually *resized* in that window.
 * A pane whose box is unchanged between two stages is correctly `stageStatic` — it stays fully visible
 * with no fade, by design — and this check reports it as a failure anyway. Confirmed on `Ny test`,
 * where three such panes flagged while the transitions were visually correct. Treat a failure here as
 * "look at this pane", not as a defect; proving it properly needs each pane's own old/new rect from
 * `computeLayoutGeometry`, which this does not currently read.
 *
 * Usage:
 *   QA_BASE_URL=http://localhost:4173 npx tsx QA/scratchpad/qa/body-split-check.mts <screenId> [runMs]
 */
import { chromium } from 'playwright'
import { BASE_URL } from './harness.mts'

const SCREEN_ID = process.argv[2] ?? 'screen-624ebb7c-9fb9-493c-86c5-ac2baa8d5210'
const RUN_MS = Number(process.argv[3] ?? 60_000)

interface Observation {
  phase: string | null
  paneId: string | null
  bodyHidden: boolean
  bodySkipped: boolean
  bodyOpacity: string
  bodyContentVisibility: string
  /** A chrome element's own opacity at the same instant — the thing that must *not* have gone to 0. */
  slotOpacity: string
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 960, height: 540 } })
await page.goto(`${BASE_URL}/screens/${SCREEN_ID}?unattended=1`, { waitUntil: 'domcontentloaded' })

const seen = new Map<string, Observation>()
const deadline = Date.now() + RUN_MS

while (Date.now() < deadline) {
  const rows = await page.evaluate(() => {
    const layout = document.querySelector('.split-layout')
    const phase = layout?.getAttribute('data-content-phase') ?? null
    return Array.from(document.querySelectorAll('[data-slide-body]')).map((body) => {
      const slot = body.closest('.split-layout__pane-content') as HTMLElement | null
      const bodyStyle = getComputedStyle(body as HTMLElement)
      return {
        phase,
        paneId: body.closest('[data-pane-id]')?.getAttribute('data-pane-id') ?? null,
        bodyHidden: Boolean(slot?.classList.contains('split-layout__pane-content--body-hidden')),
        bodySkipped: Boolean(slot?.classList.contains('split-layout__pane-content--body-skipped')),
        bodyOpacity: bodyStyle.opacity,
        bodyContentVisibility: bodyStyle.contentVisibility,
        slotOpacity: slot ? getComputedStyle(slot).opacity : 'n/a',
      }
    })
  })
  for (const row of rows) {
    // Keyed on the distinct *state*, not the sample — a run produces thousands of samples across a
    // handful of genuinely different states, and only the set of states is the answer.
    const key = `${row.paneId}|${row.phase}|${row.bodyHidden}|${row.bodySkipped}|${row.bodyContentVisibility}`
    if (!seen.has(key)) seen.set(key, row)
  }
}

await browser.close()

const observations = [...seen.values()]
console.log(JSON.stringify(observations, null, 2))

const engaged = observations.filter((row) => row.bodyHidden)
const skipped = observations.filter((row) => row.bodySkipped)
console.log(`\nbodies found: ${new Set(observations.map((row) => row.paneId)).size}`)
console.log(`--body-hidden observed:  ${engaged.length > 0 ? 'YES' : 'NO'} (${engaged.length} distinct states)`)
console.log(`--body-skipped observed: ${skipped.length > 0 ? 'YES' : 'NO'} (${skipped.length} distinct states)`)

// **The assertion this check originally lacked, and the reason it passed a build where the fade never
// ran at all.** Both bodies are Framer Motion elements, and Framer writes `opacity` as an inline
// style, which outranks a class selector — so `--body-hidden` can be present, correct and completely
// inert. Presence of the class proves nothing; only the computed opacity does.
const fadedOut = engaged.filter((row) => Number(row.bodyOpacity) < 0.01)
console.log(`body actually reached opacity 0: ${fadedOut.length > 0 ? 'YES' : 'NO — the class is present but inert'} (${fadedOut.length}/${engaged.length} states)`)
const notFaded = engaged.filter((row) => Number(row.bodyOpacity) > 0.99)
if (notFaded.length > 0) console.log(`  WARNING: ${notFaded.length} --body-hidden states still had opacity 1`)

// The other half of the point: the slot (chrome included) must still be painted while the body is not.
const chromeLost = engaged.filter((row) => row.slotOpacity === '0')
console.log(`chrome still painted while body hidden: ${chromeLost.length === 0 ? 'YES' : `NO — ${chromeLost.length} states had slot opacity 0`}`)

// Content-visibility is what actually removes the layout cost (fact 19); the fade alone is cosmetic.
const skippedForReal = skipped.filter((row) => row.bodyContentVisibility === 'hidden')
console.log(`body actually left layout: ${skippedForReal.length > 0 ? 'YES' : 'NO — the class is present but inert'} (${skippedForReal.length}/${skipped.length} states)`)

// **The requirement, stated precisely.** The body must be *gone before the box starts moving* and must
// not come back until it has stopped. The box glides during `'holding'`, so the test is simply: was
// the body ever visible during `'holding'`? A fade that is merely *running* then is already wrong —
// the viewer would see the list re-flowing into the new shape, which is the whole thing this avoids.
// `'exiting'` is where the fade is supposed to be visibly happening, so it is deliberately excluded.
//
// Effective visibility, not the body's own opacity: a pane taking the *whole-slot* path (content
// changed, or a kind that declares no body) fades the slot itself, so its body legitimately reports
// `opacity: 1` while being completely invisible inside a transparent parent. Multiplying the two is
// what distinguishes "invisible by the other mechanism" from "genuinely still on screen" — comparing
// the body alone reported three false failures on panes that were behaving correctly.
const visibleDuringHold = observations.filter(
  (row) => row.phase === 'holding' && Number(row.bodyOpacity) * (row.slotOpacity === 'n/a' ? 1 : Number(row.slotOpacity)) > 0.01,
)
console.log(
  `\nbody fully gone before the box moves: ${visibleDuringHold.length === 0 ? 'YES' : `NO — ${visibleDuringHold.length} 'holding' states had a visible body`}`,
)
for (const row of visibleDuringHold) console.log(`  pane ${row.paneId} opacity ${row.bodyOpacity} (hidden=${row.bodyHidden})`)
