/**
 * Scratchpad-only helper — not part of the app. Sets the content of **one** pane on the `Empty test`
 * fixture (`screen-4d546476-…`, 11 stages of pure geometry) over the local server's own sync
 * WebSocket, so a whole class of measurement arms needs no rebuild at all.
 *
 * `Empty test` measures worst 20ms / debt 0ms with every pane blank (consolidated report, fact 17),
 * which makes it a zero-noise instrument: whatever a single pane's own content costs is the entire
 * difference from that floor. This script is what swaps that single pane's content between arms.
 *
 * The pane is `TARGET_PANE`, chosen because it is the one whose box changes shape most across the
 * fixture — 1080px tall at stage 3, 540px at stage 4 — which is the resize the catalogue-cost
 * investigation is about.
 *
 * Content is written at stage key `'1'` only, deliberately: `resolveStageValue` resolves a stage to
 * the greatest key `<=` it, so one entry covers all 11 stages *and* keeps the pane's resolved content
 * identity byte-identical across every transition. That is what makes the fixture measure pure
 * resize cost — the pane never changes content, only shape.
 *
 * Usage: npx tsx QA/scratchpad/qa/emptytest-variant.mts <variant>
 *   blank      — restore the original empty block (the 20ms/0ms floor)
 *   catalogue  — the full `food-menu` catalogue, 7 categories / 55 available items
 *   cat-small  — the same catalogue narrowed to one small category (3 items), for DOM-size scaling
 *   cat-mid    — narrowed to ~half the items, the middle point of that same sweep
 */
import { WebSocket } from 'ws'

const WS_ORIGIN = process.env.QA_WS_ORIGIN ?? 'http://localhost:4000'
const SCREEN_ID = 'screen-4d546476-e34b-43d8-b17a-60a430eb48cd'
/** The `Empty test` leaf that goes 960x1080 at stage 3 -> 960x540 at stage 4 — the largest relative shape change on the fixture. */
const TARGET_PANE = 'pane-165995c1-7fb3-41b9-b8ed-957daf274735'
const CATALOGUE_ID = 'food-menu'

/** Each arm's own `ScreenSlotContent` for `TARGET_PANE`, written at stage key `'1'`. */
const VARIANTS: Record<string, unknown> = {
  blank: { kind: 'image', imageUrl: '' },
  catalogue: { kind: 'catalogue', catalogueId: CATALOGUE_ID },
  'cat-small': { kind: 'catalogue', catalogueId: CATALOGUE_ID, categories: ['smoothies'] },
  'cat-mid': { kind: 'catalogue', catalogueId: CATALOGUE_ID, categories: ['nachos', 'salads', 'wraps'] },
}

async function login(): Promise<string> {
  const res = await fetch(`${WS_ORIGIN}/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: '1234' }),
  })
  if (!res.ok) throw new Error(`login failed: ${res.status}`)
  return ((await res.json()) as { token: string }).token
}

async function main() {
  const variant = process.argv[2]
  const content = variant ? VARIANTS[variant] : undefined
  if (!content) throw new Error(`usage: emptytest-variant.mts <${Object.keys(VARIANTS).join('|')}>`)

  const token = await login()
  const socket = new WebSocket(WS_ORIGIN.replace(/^http/, 'ws'))

  await new Promise<void>((resolve, reject) => {
    socket.on('error', reject)
    socket.on('open', () => socket.send(JSON.stringify({ type: 'hello', keys: ['admin.screens'] })))
    socket.on('message', (raw) => {
      const message = JSON.parse(raw.toString()) as { type: string; state?: Record<string, { value: unknown }>; key?: string }
      if (message.type === 'snapshot') {
        const screens = (message.state?.['admin.screens']?.value as Record<string, unknown>[] | undefined) ?? []
        const screen = screens.find((entry) => entry.screenID === SCREEN_ID)
        if (!screen) return reject(new Error(`screen ${SCREEN_ID} not found`))
        const paneSlots = screen.paneSlots as Record<string, Record<string, unknown>>
        const slot = paneSlots[TARGET_PANE]
        if (!slot) return reject(new Error(`pane ${TARGET_PANE} not found`))
        // Replaces the whole `content` timeline rather than merging into it, so an arm can never
        // inherit a stage entry a previous arm left behind.
        slot.content = { '1': content }
        socket.send(JSON.stringify({ type: 'write', key: 'admin.screens', value: screens, token }))
        return
      }
      if (message.type === 'update' && message.key === 'admin.screens') {
        console.log(`[emptytest-variant] ${TARGET_PANE.slice(0, 14)} -> ${variant}`)
        socket.close()
        resolve()
      }
    })
    setTimeout(() => reject(new Error('timed out waiting for the write to echo back')), 15000)
  })
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
