/**
 * Scratchpad-only fixture builder — not part of the app. Creates (or replaces) the
 * "EXTREME anim test" screen: a deliberately punishing 9-stage sequence exercising every
 * pane-animation path at once — lineage-matched creation, nested creation, deletion, mass
 * restructure, row<->column axis flips, dense 3x3 and 5x5 grids, pure resize with static
 * content, and real content changes. Writes through the app's own WebSocket sync (the same
 * path the UI uses) so the running server and every open tab pick it up immediately.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { launch, login, BASE_URL } from './harness.mts'

const SCREEN_ID = 'screen-extreme-anim-test'
const A = 'pane-x-alpha' // weather — present in most stages, content never changes
const B = 'pane-x-bravo' // transit — split from A
const C = 'pane-x-charlie' // time/news — split from B, content DOES change
const D = 'pane-x-delta' // news — split from B, one stage only

const TS = { heading: 11, itemTitle: 5.5, description: 4, price: 5, itemPrice: 5 }
/** Picks real media out of the server's own uploads folder rather than hardcoding a URL, so this fixture keeps working on any machine's data set. Screen previews are excluded — they're generated thumbnails, not content. */
const uploads = readdirSync('server/uploads')
const pick = (re: RegExp) => uploads.filter((f) => re.test(f) && !f.startsWith('screen-preview-') && !/-(blur|small|thumb|medium|large)\./.test(f))[0]
const uploadUrl = (f: string | undefined) => (f ? `http://localhost:4000/uploads/${f}` : '')

/** Every `ScreenSlotContent` kind, so the fixture exercises all of them. Ids reference this install's own real catalogue/board where one is needed. */
const K = {
  none: { kind: 'none' as const },
  catalogue: { kind: 'catalogue' as const, catalogueId: 'food-menu' },
  event: { kind: 'event' as const, displayMode: 'calendar' as const, count: 4 },
  image: { kind: 'image' as const, imageUrl: uploadUrl(pick(/\.(jpg|jpeg|png)$/i)), fit: 'cover' as const },
  video: { kind: 'video' as const, videoUrl: uploadUrl(pick(/\.(mp4|webm|mov)$/i)) },
  qrcode: { kind: 'qrcode' as const, url: 'https://wraps.coffee' },
  transit: { kind: 'transit' as const, brand: 'ruter' as const, stopId: 'NSR:StopPlace:5920' },
  weather: { kind: 'weather' as const },
  news: { kind: 'news' as const, sourceIds: [] as string[] },
  announcement: { kind: 'announcement' as const, title: 'Ekstremtest', description: 'Alle innholdstyper i én skjerm.' },
  messageboard: { kind: 'messageboard' as const, boardId: 'board-1783713154022', displayMode: 'rotating' as const },
  time: { kind: 'time' as const },
}
const ALL_KINDS = Object.values(K)
const weather = K.weather
const transit = K.transit
const time = K.time
const news = K.news

type Node = { type: 'leaf'; id: string } | { type: 'split'; direction: 'row' | 'column'; ratio: number; first: Node; second: Node }
const leaf = (id: string): Node => ({ type: 'leaf', id })
const split = (direction: 'row' | 'column', ratio: number, first: Node, second: Node): Node => ({ type: 'split', direction, ratio, first, second })

/** N evenly-sized tracks along `direction`, as the right-leaning binary chain a `LayoutNode` has to express them with — first track takes `100/n`, the remainder recurses, so every track lands at exactly `100/n` of the whole. */
function evenChain(direction: 'row' | 'column', nodes: Node[]): Node {
  if (nodes.length === 1) return nodes[0]
  return split(direction, 100 / nodes.length, nodes[0], evenChain(direction, nodes.slice(1)))
}
/** An `size`x`size` grid: `size` columns, each itself split into `size` rows. */
function grid(size: number, idAt: (col: number, row: number) => string): Node {
  const columns = Array.from({ length: size }, (_, col) => evenChain('column', Array.from({ length: size }, (_, row) => leaf(idAt(col, row)))))
  return evenChain('row', columns)
}

const g3 = (col: number, row: number) => `pane-x-g3-${col}${row}`
const g5 = (col: number, row: number) => `pane-x-g5-${col}${row}`

/** The 3x3 hosts the nine kinds A-D don't already cover, so between the two every kind is on screen at some stage. */
const GRID3_KINDS = [K.catalogue, K.event, K.image, K.qrcode, K.announcement, K.messageboard, K.video, K.none, K.time]
/** The 5x5 leads with one of every kind (guaranteeing full coverage even on its own), then fills the remaining 13 cells with the cheap ones — 25 simultaneous catalogue/video panes would be measuring the integrations, not the layout. */
const GRID5_LIGHT = [K.time, K.none, K.qrcode, K.announcement]
const gridContent = (index: number, dense: boolean) =>
  dense ? (index < ALL_KINDS.length ? ALL_KINDS[index] : GRID5_LIGHT[index % GRID5_LIGHT.length]) : GRID3_KINDS[index % GRID3_KINDS.length]

const slot = (content: Record<number, unknown>, splitFrom?: string) => ({
  content,
  backgroundColor: {},
  backgroundImage: {},
  textSizes: { 1: TS },
  language: {},
  locked: {},
  overflowMode: {},
  ...(splitFrom ? { splitFromPaneId: splitFrom } : {}),
})

const paneSlots: Record<string, unknown> = {
  [A]: slot({ 1: weather }),
  [B]: slot({ 2: transit }, A),
  [C]: slot({ 3: time, 4: news, 7: time }, B),
  [D]: slot({ 4: news }, B),
}
let n = 0
for (let col = 0; col < 3; col++) for (let row = 0; row < 3; row++) paneSlots[g3(col, row)] = slot({ 5: gridContent(n++, false) }, A)
n = 0
for (let col = 0; col < 5; col++) for (let row = 0; row < 5; row++) paneSlots[g5(col, row)] = slot({ 6: gridContent(n++, true) }, A)

const screen = {
  screenID: SCREEN_ID,
  name: 'EXTREME anim test',
  layout: {
    1: leaf(A), //                                             one pane
    2: split('row', 50, leaf(A), leaf(B)), //                   2 columns  <- lineage creation of B from A
    3: evenChain('row', [leaf(A), leaf(B), leaf(C)]), //        3 columns  <- nested creation of C
    4: split('row', 50, split('column', 50, leaf(A), leaf(C)), split('column', 50, leaf(B), leaf(D))), // 2x2 <- axis flip + creation of D
    5: grid(3, g3), //                                          3x3 (9)   <- 9 panes appear at once
    6: grid(5, g5), //                                          5x5 (25)  <- 9 out, 25 in: worst case
    7: evenChain('column', [leaf(A), leaf(B), leaf(C)]), //      3 rows    <- 25 out, full restructure
    8: split('row', 70, leaf(A), leaf(B)), //                   2 columns <- deletion of C + big resize
    9: leaf(B), //                                              one pane  <- deletion of A
  },
  paneSlots,
  useStages: true,
  stageCount: 9,
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
  const used = new Set<string>()
  Object.values(paneSlots).forEach((sl) => Object.values((sl as { content: Record<number, { kind: string }> }).content).forEach((c) => used.add(c.kind)))
  console.log(`screens ${existing.length} -> ${next.length}; panes ${Object.keys(paneSlots).length}; kinds (${used.size}): ${[...used].sort().join(', ')}`)
  console.log(`media: image=${K.image.imageUrl || '(none found)'} video=${K.video.videoUrl || '(none found)'}`)

  const { browser, page } = await launch()
  await login(page)
  // esbuild (via tsx) injects a `__name` helper into evaluated code that doesn't exist in the browser;
  // defining it via an untransformed string eval up front makes every later evaluate safe.
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
  await page.goto(`${BASE_URL}/screens/editor/${SCREEN_ID}`)
  await page.locator('.split-layout').first().waitFor({ timeout: 15000 })
  await page.waitForTimeout(2500)
  console.log('loaded:', await page.locator('.screen-toolbar__label--stage').innerText().catch(() => '(no label)'))
  await browser.close()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
