/**
 * Scratchpad-only fixture builder — not part of the app. Creates (or replaces) the
 * "EXTREME 5x5 resize" screen: two stages that are the *same* 25 panes in the *same* 5x5 shape, with
 * every one of the grid's own ratios shifted between them.
 *
 * It exists to measure the one case "EXTREME anim test" structurally cannot. Every one of that
 * fixture's dense transitions swaps its whole pane set (its 3x3 and 5x5 stages share no `PaneId` with
 * anything either side of them), so all 25 panes classify as *entering* — a `clip-path`-only
 * animation. The genuinely expensive class is a pane that **persists and resizes**, which pays for a
 * `clip-path` *and* a `transform` at once, times every pane on screen. That is the real worst case
 * for the geometry-driven flat layer, and this is the smallest fixture that produces it.
 *
 * Writes through the app's own WebSocket sync, exactly like `make-extreme-screen.mts`.
 */
import { readFileSync } from 'node:fs'
import { launch, login, BASE_URL } from './harness.mts'

const SCREEN_ID = 'screen-extreme-resize-test'
const TS = { heading: 11, itemTitle: 5.5, description: 4, price: 5, itemPrice: 5 }

type Node = { type: 'leaf'; id: string } | { type: 'split'; direction: 'row' | 'column'; ratio: number; first: Node; second: Node }
const leaf = (id: string): Node => ({ type: 'leaf', id })
const split = (direction: 'row' | 'column', ratio: number, first: Node, second: Node): Node => ({ type: 'split', direction, ratio, first, second })

const id = (col: number, row: number) => `pane-r-${col}${row}`

/**
 * A 5x5 grid as the right-leaning binary chain `LayoutNode` requires, with each split's own ratio
 * nudged by `skew` — the same 25 leaves in the same nesting at both stages, so every pane persists
 * and every one of them changes size. `skew: 0` is the even grid; a non-zero skew widens the earlier
 * tracks and narrows the later ones, moving every divider at once.
 */
function skewedGrid(skew: number): Node {
  const chain = (direction: 'row' | 'column', nodes: Node[]): Node => {
    if (nodes.length === 1) return nodes[0]
    const even = 100 / nodes.length
    return split(direction, even + skew * (nodes.length - 1), nodes[0], chain(direction, nodes.slice(1)))
  }
  const columns = Array.from({ length: 5 }, (_, col) => chain('column', Array.from({ length: 5 }, (_, row) => leaf(id(col, row)))))
  return chain('row', columns)
}

/** Deliberately the cheap kinds only — 25 simultaneous catalogue/video panes would be measuring the integrations rather than the layout, and this fixture is about geometry cost alone. */
const KINDS = [
  { kind: 'time' as const },
  { kind: 'announcement' as const, title: 'Resize', description: 'Same panes, different ratios.' },
  { kind: 'qrcode' as const, url: 'https://wraps.coffee' },
  { kind: 'weather' as const },
]

const paneSlots: Record<string, unknown> = {}
let n = 0
for (let col = 0; col < 5; col++) {
  for (let row = 0; row < 5; row++) {
    const content = KINDS[n++ % KINDS.length]
    // The identical content at both stages, on purpose: this measures the cost of the *geometry*
    // moving, so nothing here should trigger a content crossfade on top of it.
    paneSlots[id(col, row)] = { content: { 1: content, 2: content }, backgroundColor: {}, backgroundImage: {}, textSizes: { 1: TS }, language: {}, locked: {}, overflowMode: {} }
  }
}

const screen = {
  screenID: SCREEN_ID,
  name: 'EXTREME 5x5 resize',
  layout: { 1: skewedGrid(0), 2: skewedGrid(4) },
  paneSlots,
  useStages: true,
  stageCount: 2,
  slideDurationSeconds: 8,
  transitionStyle: 'slide',
  paneGrowthFallback: 'screenEdge',
  showSlotBorders: true,
  borderColor: '#e08c3a',
  hideScrollbar: false,
  useScreensaver: false,
  previewAspectRatio: { width: 16, height: 9 },
  usesPercentTextSizes: true,
}

async function main() {
  const disk = JSON.parse(readFileSync('server/data/admin-screens.json', 'utf-8'))
  const existing: Record<string, unknown>[] = Array.isArray(disk) ? disk : (disk.value ?? [])
  const next = [...existing.filter((s) => s.screenID !== SCREEN_ID), screen]
  console.log(`screens ${existing.length} -> ${next.length}; panes ${Object.keys(paneSlots).length}`)

  const { browser, page } = await launch()
  await login(page)
  await page.evaluate('window.__name = window.__name || function (f) { return f }')
  const result = await page.evaluate(
    ([screens, wsUrl]) =>
      new Promise((resolve, reject) => {
        const raw = window.localStorage.getItem('admin.session')
        if (!raw) return reject(new Error('not logged in'))
        const token = JSON.parse(raw).token
        const ws = new WebSocket(wsUrl as string)
        ws.onopen = () => {
          ws.send(JSON.stringify({ type: 'write', key: 'admin.screens', value: screens, token }))
          window.setTimeout(() => {
            ws.close()
            resolve('sent')
          }, 1500)
        }
        ws.onerror = () => reject(new Error('websocket failed'))
      }),
    [next, `ws://${new URL(BASE_URL).hostname}:4000`] as const,
  )
  console.log('write:', result)
  await page.waitForTimeout(1500)
  await browser.close()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
