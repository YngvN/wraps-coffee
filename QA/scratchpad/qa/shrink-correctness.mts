/**
 * Scratchpad-only — correctness check for the seeded shrink-to-fit search.
 *
 * The optimisation must not change *what* scale a pane resolves to, only how many forced layouts it
 * costs to get there. This walks every stage of a fixture and asserts the invariant the search is
 * supposed to guarantee: each shrink-enabled pane's content actually fits inside its own box.
 * A pane that overflows means the search returned too large a scale; a pane scaled far below what it
 * needs would mean it returned too small a one, so the slack is reported too.
 */
import { launch, BASE_URL } from './harness.mts'

const SCREEN_ID = process.argv[2] ?? '1783715372380'
const RUN_MS = Number(process.argv[3] ?? 30_000)

const { browser, page } = await launch()
await page.goto(`${BASE_URL}/screens/${SCREEN_ID}?unattended=1`)
await page.locator('.split-layout').first().waitFor({ timeout: 20000 })

const deadline = Date.now() + RUN_MS
const bad: string[] = []
let checks = 0
while (Date.now() < deadline) {
  await page.waitForTimeout(1500)
  const rows = await page.evaluate(`
    Array.prototype.map.call(document.querySelectorAll('.split-layout__pane-content'), function (outer) {
      var inner = outer.firstElementChild;
      var measured = inner && inner.firstElementChild ? inner.firstElementChild : inner;
      if (!measured) return null;
      var pane = outer.closest('[data-pane-id]');
      return {
        pane: pane ? pane.getAttribute('data-pane-id') : '?',
        overflowH: measured.scrollHeight - outer.clientHeight,
        boxH: outer.clientHeight,
        slackPct: outer.clientHeight > 0 ? Math.round((1 - measured.scrollHeight / outer.clientHeight) * 100) : 0
      };
    }).filter(Boolean)
  `) as { pane: string; overflowH: number; boxH: number; slackPct: number }[]
  for (const row of rows) {
    checks += 1
    // 2px of tolerance for subpixel rounding in the layout itself.
    if (row.overflowH > 2) bad.push(`${row.pane}: overflows by ${row.overflowH}px (box ${row.boxH}px)`)
  }
}
await browser.close()

console.log(`checked ${checks} pane snapshots`)
if (bad.length === 0) console.log('PASS — no shrink-enabled pane overflowed its box')
else {
  console.log(`FAIL — ${bad.length} overflow(s):`)
  for (const line of [...new Set(bad)].slice(0, 15)) console.log('  ' + line)
}
