// 30-minute usage/soak test — throwaway script, run once. See the plan this
// was built from: /Users/yngve/.claude/plans/i-want-to-run-deep-lampson.md
//
// Orchestrates 2 fake "display" browser tabs (screen-switching every 60s), 1
// admin dashboard tab (nav cycling + AI questions + price edits), a
// server-side showcase-screen create/rotate cycle every 10 minutes, and
// read-only monitoring of a real physical Android TV — while sampling
// CPU/memory/disk/thermal every 20s and tracking reliability signals
// (console/page errors, WS disconnects, TV connectivity). Writes
// metrics.jsonl/events.jsonl continuously and a report.md at the end.
//
// Run: npx tsx QA/scratchpad/usage-test-2026-08-14/run.mts
// Requires: `npm run preview` already running (port 4173 content, port 4000
// WS/API), Ollama running on 11434, and — for the TV portion to mean
// anything — the physical Android TV powered on and on the same LAN.

import { chromium, type Page } from 'playwright'
import { exec as execCb } from 'node:child_process'
import { promisify } from 'node:util'
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import {
  launch,
  login as uiLogin,
  gotoDashboard,
  openAssistant,
  configureAssistantModel,
  sendChat,
  shot,
  isGateVisible,
  clickGateCancel,
  isSingleReviewVisible,
  clickReviewCancel,
  isBatchReviewVisible,
  isClarificationVisible,
  openCatalogue,
  expandCategorySection,
  exact,
} from '../qa/harness.mts'
import { login as apiLogin, openSyncSession, resolveServerUrls, backupSyncedKeyFile, type SyncSession } from '../../../diagnostics/pane-resize-stutter/lib/seedClient'
import { createLeaf } from '../../../src/utils/layoutTree'
import type { LayoutNode, ScreenConfig, ScreenSlot, ScreenSlotContent } from '../../../src/types/screen'
import type { Product } from '../../../src/types/product'
import type { Catalogue } from '../../../src/types/category'
import type { MessageBoardPost } from '../../../src/types/messageBoard'

const exec = promisify(execCb)

// ---------- Config ----------

const REPO_ROOT = '/Users/yngve/Desktop/GitHub/wraps-coffee'
const RUN_DIR = path.join(REPO_ROOT, 'QA/scratchpad/usage-test-2026-08-14')
const METRICS_PATH = path.join(RUN_DIR, 'metrics.jsonl')
const EVENTS_PATH = path.join(RUN_DIR, 'events.jsonl')
const SCREENSHOT_DIR = path.join(RUN_DIR, 'screenshots')
const SERVER_LOG_PATH = path.join(RUN_DIR, 'server.log')

const CONTENT_URL = 'http://localhost:4173'
const OLLAMA_URL = 'http://localhost:11434/api/tags'
const TV_MACHINE_ID = '81f52ed2b76c7c0c'
const TV_OFFLINE_THRESHOLD_MS = 90_000

// SMOKE mode (USAGE_TEST_SMOKE=1) compresses every timing constant by SCALE
// so the whole script can be exercised end-to-end in ~30s instead of 30min,
// to validate mechanics (upload, screen create/rotate, nav, AI, price
// change, cleanup) before committing to the real run.
const SMOKE = process.env.USAGE_TEST_SMOKE === '1'
const SCALE = SMOKE ? 1 / 60 : 1
const scaleSec = (s: number) => Math.max(2, Math.round(s * SCALE))

const TOTAL_MS = 30 * 60 * 1000 * SCALE
const DISPLAY_SWITCH_MS = Math.max(5000, 60_000 * SCALE)
const DISPLAY2_OFFSET_MS = Math.max(2000, 30_000 * SCALE)
const RESOURCE_SAMPLE_MS = Math.max(3000, 20_000 * SCALE)
const DISK_SAMPLE_MS = Math.max(10_000, 5 * 60 * 1000 * SCALE)
const TV_POLL_MS = Math.max(3000, 20_000 * SCALE)
const IDLE_BASELINE_MS = SMOKE ? 6_000 : 60_000

const DIAG_CATALOGUE_ID = 'diag-pane-resize-catalogue-as-is'
const DIAG_CATEGORY_ID = 'diag-pane-resize-cat-a-as-is'
const DIAG_PRICE_PRODUCT_ID = `diag-pane-resize-product-as-is-${DIAG_CATEGORY_ID}-0`

const REAL_SCREEN_IDS = ['1783431536720', '1783715372380', 'screen-e202503b-c6d6-494e-a4a4-82c81f5e9991', 'screen-8ec76ce7-2a6d-4677-ae66-f5eb5a74e91a']

// ---------- Shared state ----------

interface RunState {
  t0: number
  stopRequested: boolean
  screensArray: ScreenConfig[]
  currentShowcaseId: string | null
  forceJumpDisplay2: string | null
  display1CurrentId: string | null
  wsConnected: Record<string, boolean>
  tvConnected: boolean | null
  originalPriceProduct: Product | null
  originalMessageBoardPosts: MessageBoardPost[]
  seededPostId: string
  videoUrl: string
  imageUrl: string
  catalogueForShowcase: { catalogueId: string; categoryId: string }
}

function elapsedSec(state: RunState): number {
  return (Date.now() - state.t0) / 1000
}

async function cancellableSleep(ms: number, state: RunState): Promise<void> {
  const end = Date.now() + ms
  while (Date.now() < end && !state.stopRequested) {
    await new Promise((resolve) => setTimeout(resolve, Math.min(1000, end - Date.now())))
  }
}

function appendJsonl(filePath: string, obj: Record<string, unknown>) {
  appendFileSync(filePath, `${JSON.stringify({ ts: new Date().toISOString(), ...obj })}\n`)
}

function logMetric(obj: Record<string, unknown>) {
  appendJsonl(METRICS_PATH, obj)
}

function logEvent(type: string, detail: Record<string, unknown> = {}) {
  appendJsonl(EVENTS_PATH, { type, ...detail })
  console.log(`[event] ${type}`, detail)
}

// ---------- Preflight ----------

async function checkDiskHeadroom() {
  try {
    const { stdout } = await exec('df -h /')
    logEvent('preflight-disk', { output: stdout.trim() })
    const line = stdout.trim().split('\n')[1] ?? ''
    const availMatch = line.match(/\S+\s+\S+\s+(\S+)/)
    console.log(`[preflight] disk free: ${availMatch ? availMatch[1] : 'unknown'} — review metrics.jsonl if this looks tight`)
  } catch (err) {
    console.warn('[preflight] df check failed', err)
  }
}

async function checkReachable(url: string, label: string) {
  try {
    const res = await fetch(url)
    if (!res.ok && res.status !== 401) throw new Error(`status ${res.status}`)
    console.log(`[preflight] ${label} reachable`)
  } catch (err) {
    throw new Error(`${label} not reachable at ${url}: ${String(err)}`)
  }
}

async function idleBaselineSample(state: RunState) {
  console.log('[preflight] sampling idle baseline for 60s (server + Ollama only, no browsers yet)...')
  const samples = Math.floor(IDLE_BASELINE_MS / RESOURCE_SAMPLE_MS)
  for (let i = 0; i < samples; i++) {
    await sampleResources(state, { phase: 'idle-baseline' })
    await new Promise((r) => setTimeout(r, RESOURCE_SAMPLE_MS))
  }
}

// ---------- Resource sampling ----------

async function psGroup(pattern: RegExp): Promise<{ pcpu: number; rssKb: number; count: number }> {
  const { stdout } = await exec('ps -eo pid,ppid,pcpu,rss,args').catch(() => ({ stdout: '' }))
  let pcpu = 0
  let rssKb = 0
  let count = 0
  for (const line of stdout.split('\n').slice(1)) {
    const match = line.trim().match(/^(\d+)\s+(\d+)\s+([\d.]+)\s+(\d+)\s+(.*)$/)
    if (!match) continue
    const [, , , cpuStr, rssStr, args] = match
    if (!pattern.test(args)) continue
    pcpu += Number(cpuStr)
    rssKb += Number(rssStr)
    count += 1
  }
  return { pcpu, rssKb, count }
}

async function sampleResources(state: RunState, extra: Record<string, unknown> = {}) {
  const tSec = elapsedSec(state)
  const [vite, server, chrome] = await Promise.all([psGroup(/vite.*preview/i), psGroup(/tsx.*server\/index\.ts|node.*server\/index\.ts/i), psGroup(/Chrome for Testing/)])
  logMetric({ kind: 'resource', tSec, vite, server, chrome, ...extra })

  try {
    const { stdout } = await exec('pmset -g therm')
    logMetric({ kind: 'thermal', tSec, output: stdout.trim(), ...extra })
  } catch {
    // pmset unavailable — non-fatal, just skip thermal data this sample
  }
}

async function sampleDisk(state: RunState) {
  const tSec = elapsedSec(state)
  try {
    const { stdout: duOut } = await exec(`du -sh "${REPO_ROOT}/server/data" "${REPO_ROOT}/server/uploads" "${REPO_ROOT}/server/news-image-cache" 2>/dev/null`)
    const { stdout: dfOut } = await exec('df -h /')
    logMetric({ kind: 'disk', tSec, du: duOut.trim(), df: dfOut.trim() })
  } catch (err) {
    logEvent('disk-sample-failed', { error: String(err) })
  }
}

async function runResourceSampler(state: RunState) {
  let lastDisk = 0
  while (!state.stopRequested && elapsedSec(state) < TOTAL_MS / 1000) {
    await sampleResources(state)
    if (elapsedSec(state) - lastDisk >= DISK_SAMPLE_MS / 1000) {
      await sampleDisk(state)
      lastDisk = elapsedSec(state)
    }
    await cancellableSleep(RESOURCE_SAMPLE_MS, state)
  }
}

// ---------- TV poller ----------

async function runTvPoller(state: RunState) {
  while (!state.stopRequested && elapsedSec(state) < TOTAL_MS / 1000) {
    try {
      const raw = readFileSync(path.join(REPO_ROOT, 'server/data/admin-displayMachines.json'), 'utf-8')
      const parsed = JSON.parse(raw) as { value?: { machineID: string; lastSeenAt: string }[] }
      const machine = (parsed.value ?? []).find((m) => m.machineID === TV_MACHINE_ID)
      const isConnected = machine ? Date.now() - new Date(machine.lastSeenAt).getTime() < TV_OFFLINE_THRESHOLD_MS : false
      if (state.tvConnected !== isConnected) {
        logEvent('tv-connection-change', { connected: isConnected, lastSeenAt: machine?.lastSeenAt ?? null })
        state.tvConnected = isConnected
      }
      logMetric({ kind: 'tv', tSec: elapsedSec(state), connected: isConnected })
    } catch (err) {
      logEvent('tv-poll-failed', { error: String(err) })
    }
    await cancellableSleep(TV_POLL_MS, state)
  }
}

// ---------- Showcase screen builder ----------

function emptySlot(content: ScreenSlotContent): ScreenSlot {
  return { content: { 1: content }, backgroundColor: {}, backgroundImage: {}, textSizes: {} }
}

function buildBalancedTree(nodes: LayoutNode[], direction: 'row' | 'column' = 'row'): LayoutNode {
  if (nodes.length === 1) return nodes[0]
  const mid = Math.ceil(nodes.length / 2)
  const left = buildBalancedTree(nodes.slice(0, mid), direction === 'row' ? 'column' : 'row')
  const right = buildBalancedTree(nodes.slice(mid), direction === 'row' ? 'column' : 'row')
  return { type: 'split', direction, ratio: 50, first: left, second: right }
}

function buildShowcaseScreen(n: number, state: RunState): ScreenConfig {
  const kinds: ScreenSlotContent[] = [
    { kind: 'catalogue', catalogueId: state.catalogueForShowcase.catalogueId, categories: [state.catalogueForShowcase.categoryId] },
    { kind: 'event', displayMode: 'calendar' },
    { kind: 'image', imageUrl: state.imageUrl, fit: 'cover' },
    { kind: 'video', videoUrl: state.videoUrl, fit: 'cover', removeAudio: true },
    { kind: 'qrcode', url: 'https://example.com', linkMode: 'custom' },
    { kind: 'transit', brand: 'ruter', stopId: 'NSR:StopPlace:5920' },
    { kind: 'weather' },
    { kind: 'news' },
    { kind: 'announcement', title: `Usage test showcase ${n}`, description: 'Auto-generated pane-kind showcase screen.' },
    { kind: 'time' },
    { kind: 'messageboard', boardId: 'general', displayMode: 'rotating' },
    { kind: 'none' },
  ]

  const leaves = kinds.map(() => createLeaf())
  const paneSlots: Record<string, ScreenSlot> = {}
  leaves.forEach(({ id }, i) => {
    paneSlots[id] = emptySlot(kinds[i])
  })
  const tree = buildBalancedTree(leaves.map((l) => l.node))

  return {
    screenID: `usage-test-panes-${n}`,
    name: `[usage test] all panes (${n})`,
    layout: { 1: tree },
    paneSlots,
    slideDurationSeconds: 15,
    transitionStyle: 'fade',
  }
}

async function runScreenLifecycle(session: SyncSession, state: RunState) {
  const schedule = [0, 600, 1200].map(scaleSec)
  for (let i = 0; i < schedule.length; i++) {
    while (elapsedSec(state) < schedule[i] && !state.stopRequested) {
      await cancellableSleep(1000, state)
    }
    if (state.stopRequested) return
    const n = i + 1
    const newScreen = buildShowcaseScreen(n, state)
    const next = [...state.screensArray.filter((s) => !s.screenID.startsWith('usage-test-panes-')), newScreen]
    session.write('admin.screens', next)
    state.screensArray = next
    state.currentShowcaseId = newScreen.screenID
    state.forceJumpDisplay2 = newScreen.screenID
    logEvent('showcase-screen-created', { screenID: newScreen.screenID, replaced: n > 1 })
  }
}

// ---------- Display timelines ----------

async function gotoScreen(page: Page, screenId: string) {
  await page.goto(`${CONTENT_URL}/screens/${screenId}?unattended=1`, { waitUntil: 'domcontentloaded' }).catch((err) => logEvent('display-nav-error', { screenId, error: String(err) }))
}

function currentPool(state: RunState): string[] {
  return state.currentShowcaseId ? [...REAL_SCREEN_IDS, state.currentShowcaseId] : [...REAL_SCREEN_IDS]
}

async function checkConnection(label: string, page: Page, state: RunState) {
  try {
    const disconnected = (await page.locator('.screen-display__connection-badge').count()) > 0
    const connected = !disconnected
    if (state.wsConnected[label] !== connected) {
      logEvent('ws-connection-change', { display: label, connected })
      state.wsConnected[label] = connected
    }
  } catch {
    // page may be mid-navigation — skip this check, next one will catch up
  }
}

async function runDisplayTimeline(label: string, page: Page, state: RunState, offsetMs: number) {
  await cancellableSleep(offsetMs, state)
  let idx = 0
  while (!state.stopRequested && elapsedSec(state) < TOTAL_MS / 1000) {
    if (label === 'display2' && state.forceJumpDisplay2) {
      const id = state.forceJumpDisplay2
      state.forceJumpDisplay2 = null
      await gotoScreen(page, id)
      logEvent('display-switch', { display: label, screenId: id, forced: true })
    } else {
      const pool = currentPool(state)
      let id = pool[idx % pool.length]
      idx++
      if (label === 'display2' && id === state.display1CurrentId && pool.length > 1) {
        id = pool[idx % pool.length]
        idx++
      }
      await gotoScreen(page, id)
      if (label === 'display1') state.display1CurrentId = id
      logEvent('display-switch', { display: label, screenId: id, forced: false })
    }
    await checkConnection(label, page, state)
    if (elapsedSec(state) === 0 || Math.round(elapsedSec(state)) % 900 < 5) {
      await shot(page, `${label}-t${Math.round(elapsedSec(state))}s`).catch(() => {})
    }
    await cancellableSleep(DISPLAY_SWITCH_MS, state)
  }
}

// ---------- Admin timeline ----------

interface ScheduledTask {
  atSec: number
  name: string
  run: () => Promise<void>
}

async function closeAssistantIfOpen(page: Page) {
  const open = (await page.locator('.assistant-panel__transcript').count()) > 0
  if (open) {
    await page.locator('.admin-top-navbar__icon-link--assistant').click().catch(() => {})
    await page.waitForTimeout(300)
  }
}

async function askReadOnlyQuestion(page: Page, question: string) {
  await openAssistant(page)
  const start = Date.now()
  const { reply } = await sendChat(page, question, { timeoutMs: 120000 })
  logEvent('ai-turn', { mode: 'read-only', question, latencyMs: Date.now() - start, replySnippet: reply.slice(0, 300), hadReply: reply.length > 0 })
  await closeAssistantIfOpen(page)
}

async function askWriteFlowQuestion(page: Page, question: string) {
  await openAssistant(page)
  const start = Date.now()
  const { reply } = await sendChat(page, question, { timeoutMs: 120000 })
  await page.waitForTimeout(500)

  let outcome = 'no-actionable-surface'
  try {
    if (await isGateVisible(page)) {
      await clickGateCancel(page)
      outcome = 'gate-cancelled'
    } else if (await isBatchReviewVisible(page)) {
      const cancelBtn = page.locator('.assistant-batch-review').getByRole('button', { name: 'Avbryt', exact: true })
      if (await cancelBtn.count()) {
        await cancelBtn.click()
        outcome = 'batch-cancelled'
      } else {
        outcome = 'batch-visible-no-cancel-found'
      }
    } else if (await isSingleReviewVisible(page)) {
      await clickReviewCancel(page)
      outcome = 'single-review-cancelled'
    } else if (await isClarificationVisible(page)) {
      outcome = 'clarification-left-unanswered'
    }
  } catch (err) {
    outcome = `cancel-attempt-failed: ${String(err)}`
  }

  logEvent('ai-turn', { mode: 'write-flow', question, latencyMs: Date.now() - start, replySnippet: reply.slice(0, 300), outcome })
  await closeAssistantIfOpen(page)
}

// The `?catalogueId=&categoryId=&productId=` deep link only opens the catalogue/category (confirmed via
// manual inspection — the productId param doesn't auto-open ProductForm here), so this instead reuses
// harness.mts's own openCatalogue/expandCategorySection helpers and clicks the specific product row's
// own "Rediger" (Edit) button — same click-path a real admin would use.
async function changeDiagPrice(page: Page, priceValue: number) {
  try {
    await openCatalogue(page, 'Diagnostikk (as-is)')
    const section = await expandCategorySection(page, 'Kategori A')
    const row = section
      .locator('.products-view__item')
      .filter({ has: page.locator('.products-view__item-name', { hasText: exact('Diagnostic item 1') }) })
      .first()
    await row.getByRole('button', { name: 'Rediger', exact: true }).click()
    await page.locator('#product-name').waitFor({ timeout: 10000 })
    await page.locator('input[name="priceMode"]').nth(1).check()
    await page.getByRole('spinbutton', { name: 'Pris', exact: true }).fill(String(priceValue))
    await page.getByRole('button', { name: 'Lagre', exact: true }).click()
    await page.locator('#product-name').waitFor({ state: 'detached', timeout: 10000 }).catch(() => {})
    await page.waitForTimeout(900)
    logEvent('price-change', { priceValue, ok: true })
  } catch (err) {
    logEvent('price-change', { priceValue, ok: false, error: String(err) })
  }
}

async function checkDisplayManager(page: Page) {
  await gotoDashboard(page, 'screens?displayManager=1')
  await page.waitForTimeout(1000)
  const text = await page.locator('.display-manager-view__last-seen').allInnerTexts().catch(() => [])
  logEvent('display-manager-check', { lastSeenLines: text })
}

function buildScheduledTasks(page: Page): ScheduledTask[] {
  const readOnlyQuestions = [
    'Hvor mange skjermer har vi registrert nå?',
    "List opp kategoriene i katalogen 'Diagnostikk (as-is)'.",
    'Hva er værmeldingen for i dag?',
    'Når er neste avgang fra Ulven torg?',
    "Oppsummer hva som skjer på meldingstavlen 'General'.",
  ]
  const readOnlyTimes = [240, 540, 840, 1140, 1440].map(scaleSec)
  const priceTimes = [360, 960, 1560].map(scaleSec)
  const priceValues = [10, 15, 20]
  const displayManagerTimes = [300, 900, 1500].map(scaleSec)

  const tasks: ScheduledTask[] = []
  readOnlyTimes.forEach((atSec, i) => {
    tasks.push({ atSec, name: `ai-question-${i + 1}`, run: () => askReadOnlyQuestion(page, readOnlyQuestions[i]) })
  })
  priceTimes.forEach((atSec, i) => {
    tasks.push({ atSec, name: `price-change-${i + 1}`, run: () => changeDiagPrice(page, priceValues[i]) })
  })
  displayManagerTimes.forEach((atSec, i) => {
    tasks.push({ atSec, name: `display-manager-check-${i + 1}`, run: () => checkDisplayManager(page) })
  })
  tasks.push({
    atSec: scaleSec(1680),
    name: 'ai-write-flow-question',
    run: () => askWriteFlowQuestion(page, "Legg til et nytt produkt kalt 'Diagnostikk Ekstra' i kategorien 'Kategori A' i katalogen 'Diagnostikk (as-is)'."),
  })

  return tasks.sort((a, b) => a.atSec - b.atSec)
}

async function runAdminTimeline(page: Page, state: RunState) {
  const navSections: { to: string; dwellSec: number }[] = [
    { to: 'overview', dwellSec: 40 },
    { to: 'messages', dwellSec: 40 },
    { to: 'products?allProducts=1', dwellSec: 90 },
    { to: 'events', dwellSec: 40 },
    { to: 'orders', dwellSec: 40 },
    { to: 'screens', dwellSec: 80 },
    { to: 'messageboard', dwellSec: 50 },
    { to: 'media', dwellSec: 40 },
    { to: 'users', dwellSec: 40 },
    { to: 'settings?view=integrations', dwellSec: 70 },
  ]

  const tasks = buildScheduledTasks(page)
  let cursor = 0
  let navIdx = 0

  while (!state.stopRequested && elapsedSec(state) < TOTAL_MS / 1000) {
    const section = navSections[navIdx % navSections.length]
    navIdx += 1
    await gotoDashboard(page, section.to).catch((err) => logEvent('nav-error', { to: section.to, error: String(err) }))
    logEvent('nav-visit', { to: section.to })
    await cancellableSleep(scaleSec(section.dwellSec) * 1000, state)

    while (cursor < tasks.length && elapsedSec(state) >= tasks[cursor].atSec && !state.stopRequested) {
      const task = tasks[cursor]
      console.log(`[admin] running scheduled task: ${task.name} at t=${Math.round(elapsedSec(state))}s`)
      await task.run().catch((err) => logEvent('scheduled-task-failed', { name: task.name, error: String(err) }))
      cursor += 1
    }
  }
}

// ---------- Setup helpers ----------

async function uploadVideo(token: string): Promise<string> {
  const videoPath = '/Users/yngve/Desktop/IMG_2878.mov'
  const buffer = readFileSync(videoPath)
  const res = await fetch(`${resolveServerUrls().host === 'localhost' ? 'http://localhost:4000' : ''}/uploads/video`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'video/quicktime' },
    body: buffer,
  })
  if (!res.ok) throw new Error(`video upload failed: ${res.status} ${await res.text()}`)
  const ack = (await res.json()) as { url?: string; filename: string }
  console.log('[preflight] video upload accepted, polling for transcode completion...')

  const deadline = Date.now() + 5 * 60 * 1000
  while (Date.now() < deadline) {
    const listRes = await fetch('http://localhost:4000/uploads', { headers: { Authorization: `Bearer ${token}` } })
    const list = (await listRes.json()) as { filename: string; url: string; status?: string }[]
    const entry = list.find((u) => u.filename === ack.filename)
    if (entry && !entry.status) {
      console.log('[preflight] video transcode ready:', entry.url)
      return entry.url
    }
    if (entry?.status === 'failed') throw new Error('video transcode failed')
    await new Promise((r) => setTimeout(r, 3000))
  }
  throw new Error('video transcode did not finish within 5 minutes')
}

function pickExistingImageUrl(): string {
  const dir = path.join(REPO_ROOT, 'server/uploads')
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => /\.(png|webp|jpe?g)$/i.test(f) && !f.includes('-thumb') && !f.includes('-tiny')) : []
  if (files.length === 0) throw new Error('no existing image found in server/uploads to use for the image pane')
  return `http://localhost:4000/uploads/${files[0]}`
}

async function main() {
  mkdirSync(RUN_DIR, { recursive: true })
  mkdirSync(SCREENSHOT_DIR, { recursive: true })
  writeFileSync(METRICS_PATH, '')
  writeFileSync(EVENTS_PATH, '')

  console.log('=== Preflight ===')
  await checkDiskHeadroom()
  await checkReachable(CONTENT_URL, 'preview server (4173)')
  await checkReachable(OLLAMA_URL, 'Ollama (11434)')

  if (!existsSync(SERVER_LOG_PATH)) {
    console.warn(`[preflight] WARNING: ${SERVER_LOG_PATH} does not exist yet — make sure you started:`)
    console.warn(`  npm run preview 2>&1 | tee ${SERVER_LOG_PATH}`)
  }

  const { token } = await apiLogin('admin', '1234')

  let tvLastSeen: string | null = null
  try {
    const raw = readFileSync(path.join(REPO_ROOT, 'server/data/admin-displayMachines.json'), 'utf-8')
    const parsed = JSON.parse(raw) as { value?: { machineID: string; lastSeenAt: string }[] }
    const machine = (parsed.value ?? []).find((m) => m.machineID === TV_MACHINE_ID)
    tvLastSeen = machine?.lastSeenAt ?? null
    const staleMs = tvLastSeen ? Date.now() - new Date(tvLastSeen).getTime() : Infinity
    if (staleMs > TV_OFFLINE_THRESHOLD_MS) {
      console.warn(`[preflight] WARNING: TV last seen ${tvLastSeen ?? 'never'} — make sure it's powered on and connected before this run means anything for the TV portion.`)
    } else {
      console.log(`[preflight] TV already connected, last seen ${tvLastSeen}`)
    }
  } catch (err) {
    console.warn('[preflight] could not read TV status', err)
  }

  console.log('[preflight] backing up synced-key files before any writes...')
  for (const key of ['admin.products', 'admin.screens', 'admin.messageBoardPosts'] as const) {
    backupSyncedKeyFile(REPO_ROOT, key)
  }

  console.log('[preflight] uploading video...')
  const videoUrl = await uploadVideo(token)
  const imageUrl = pickExistingImageUrl()
  console.log('[preflight] using existing image:', imageUrl)

  const session = await openSyncSession(token, ['admin.screens', 'admin.products', 'admin.messageBoardPosts', 'admin.catalogues'])

  const products = (session.snapshot['admin.products'] as Product[]) ?? []
  const originalPriceProduct = products.find((p) => p.itemID === DIAG_PRICE_PRODUCT_ID)
  if (!originalPriceProduct) throw new Error(`expected diagnostic product ${DIAG_PRICE_PRODUCT_ID} not found — has the diagnostic fixture data been removed?`)

  const catalogues = (session.snapshot['admin.catalogues'] as Catalogue[]) ?? []
  const realCatalogue = catalogues.find((c) => !c.id.startsWith('diag-pane-resize-')) ?? catalogues[0]
  if (!realCatalogue || realCatalogue.categories.length === 0) throw new Error('no usable catalogue found for the showcase screen catalogue pane')

  const originalMessageBoardPosts = (session.snapshot['admin.messageBoardPosts'] as MessageBoardPost[]) ?? []
  const seededPostId = `usage-test-post-${Date.now()}`
  const seededPost: MessageBoardPost = {
    id: seededPostId,
    boardId: 'general',
    title: 'Usage test post',
    body: 'Auto-generated for the 30-minute usage/soak test — safe to ignore.',
    authorUsername: 'admin',
    createdAt: new Date().toISOString(),
  }
  session.write('admin.messageBoardPosts', [...originalMessageBoardPosts, seededPost])
  console.log('[preflight] seeded throwaway message-board post', seededPostId)

  const state: RunState = {
    t0: Date.now(),
    stopRequested: false,
    screensArray: (session.snapshot['admin.screens'] as ScreenConfig[]) ?? [],
    currentShowcaseId: null,
    forceJumpDisplay2: null,
    display1CurrentId: null,
    wsConnected: {},
    tvConnected: null,
    originalPriceProduct,
    originalMessageBoardPosts,
    seededPostId,
    videoUrl,
    imageUrl,
    catalogueForShowcase: { catalogueId: realCatalogue.id, categoryId: realCatalogue.categories[0].id },
  }

  await idleBaselineSample(state)
  state.t0 = Date.now() // real clock starts now, after idle baseline

  console.log('=== Launching 3 browser windows ===')
  const d1 = await launch()
  const d2 = await launch()
  const adm = await launch()

  for (const [label, { page }] of [
    ['display1', d1],
    ['display2', d2],
    ['admin', adm],
  ] as const) {
    page.on('console', (msg) => {
      if (msg.type() === 'error') logEvent('console-error', { page: label, text: msg.text().slice(0, 500) })
    })
    page.on('pageerror', (err) => logEvent('page-error', { page: label, text: String(err).slice(0, 500) }))
  }

  await uiLogin(adm.page)
  await configureAssistantModel(adm.page, { provider: 'local', thinkingModel: 'qwen3:8b' })
  console.log('[setup] admin logged in, assistant configured for local qwen3:8b')

  await shot(adm.page, 'admin-t0')

  let cleanedUp = false
  const cleanup = async () => {
    if (cleanedUp) return
    cleanedUp = true
    console.log('=== Cleanup ===')

    try {
      const currentProducts = (await readCurrentProducts()) ?? products
      const reverted = currentProducts.map((p) => (p.itemID === DIAG_PRICE_PRODUCT_ID ? state.originalPriceProduct! : p))
      session.write('admin.products', reverted)
      logEvent('cleanup', { step: 'price-revert', ok: true })
    } catch (err) {
      logEvent('cleanup', { step: 'price-revert', ok: false, error: String(err) })
    }

    logEvent('cleanup', { step: 'showcase-screen-3-kept', screenID: state.currentShowcaseId })
    logEvent('cleanup', { step: 'message-board-post-kept', postId: state.seededPostId })
    logEvent('cleanup', { step: 'video-upload-kept', url: state.videoUrl })

    await new Promise((r) => setTimeout(r, 1000)) // let final writes flush before closing the session
    try {
      session.close()
    } catch {
      // already closed / never opened — fine
    }

    for (const [label, { browser }] of [
      ['display1', d1],
      ['display2', d2],
      ['admin', adm],
    ] as const) {
      try {
        await browser.close()
        logEvent('cleanup', { step: 'browser-closed', browser: label, ok: true })
      } catch (err) {
        logEvent('cleanup', { step: 'browser-closed', browser: label, ok: false, error: String(err) })
      }
    }

    await writeReport(state)
    console.log(`=== Done. Report at ${path.join(RUN_DIR, 'report.md')} ===`)
  }

  async function readCurrentProducts(): Promise<Product[] | null> {
    try {
      const raw = readFileSync(path.join(REPO_ROOT, 'server/data/admin-products.json'), 'utf-8')
      const parsed = JSON.parse(raw) as { value?: Product[] }
      return parsed.value ?? null
    } catch {
      return null
    }
  }

  let sigintCount = 0
  const onSignal = () => {
    sigintCount += 1
    if (sigintCount === 1) {
      console.log('\n[signal] stop requested — finishing current step and cleaning up (Ctrl+C again to force)...')
      state.stopRequested = true
    } else {
      console.log('\n[signal] forcing exit after one cleanup attempt...')
      cleanup().finally(() => process.exit(1))
    }
  }
  process.on('SIGINT', onSignal)
  process.on('SIGTERM', onSignal)

  try {
    await Promise.all([
      runDisplayTimeline('display1', d1.page, state, 0),
      runDisplayTimeline('display2', d2.page, state, DISPLAY2_OFFSET_MS),
      runAdminTimeline(adm.page, state),
      runScreenLifecycle(session, state),
      runResourceSampler(state),
      runTvPoller(state),
    ])
  } finally {
    await shot(adm.page, 'admin-tEnd').catch(() => {})
    await cleanup()
  }
}

// ---------- Report generation ----------

async function writeReport(state: RunState) {
  const metricsLines = existsSync(METRICS_PATH) ? readFileSync(METRICS_PATH, 'utf-8').trim().split('\n').filter(Boolean) : []
  const eventLines = existsSync(EVENTS_PATH) ? readFileSync(EVENTS_PATH, 'utf-8').trim().split('\n').filter(Boolean) : []
  const metrics = metricsLines.map((l) => JSON.parse(l))
  const events = eventLines.map((l) => JSON.parse(l))

  const resourceSamples = metrics.filter((m) => m.kind === 'resource' && m.phase !== 'idle-baseline')
  const idleSamples = metrics.filter((m) => m.kind === 'resource' && m.phase === 'idle-baseline')
  const diskSamples = metrics.filter((m) => m.kind === 'disk')
  const tvSamples = metrics.filter((m) => m.kind === 'tv')

  const consoleErrors = events.filter((e) => e.type === 'console-error')
  const pageErrors = events.filter((e) => e.type === 'page-error')
  const wsDrops = events.filter((e) => e.type === 'ws-connection-change' && e.connected === false)
  const tvTransitions = events.filter((e) => e.type === 'tv-connection-change')
  const aiTurns = events.filter((e) => e.type === 'ai-turn')
  const priceChanges = events.filter((e) => e.type === 'price-change')
  const showcaseCreated = events.filter((e) => e.type === 'showcase-screen-created')
  const displaySwitches = events.filter((e) => e.type === 'display-switch')

  function avg(nums: number[]) {
    return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0
  }
  function summarize(group: 'vite' | 'server' | 'chrome') {
    const cpu = resourceSamples.map((s) => s[group]?.pcpu ?? 0)
    const rss = resourceSamples.map((s) => (s[group]?.rssKb ?? 0) / 1024)
    return { minCpu: Math.min(...cpu, 0), avgCpu: avg(cpu), maxCpu: Math.max(...cpu, 0), minRssMb: Math.min(...rss, 0), avgRssMb: avg(rss), maxRssMb: Math.max(...rss, 0) }
  }

  const early = resourceSamples.filter((s) => s.tSec <= 320 && s.tSec >= 280)
  const late = resourceSamples.filter((s) => s.tSec >= 1480 && s.tSec <= 1520)
  function rssAt(samples: typeof resourceSamples, group: 'vite' | 'server' | 'chrome') {
    return avg(samples.map((s) => (s[group]?.rssKb ?? 0) / 1024))
  }

  const tvUptimePct = tvSamples.length ? (100 * tvSamples.filter((s) => s.connected).length) / tvSamples.length : 0

  let gitCommit = 'unknown'
  try {
    const { stdout } = await exec('git rev-parse --short HEAD', { cwd: REPO_ROOT })
    gitCommit = stdout.trim()
  } catch {
    // not fatal
  }

  const lines: string[] = []
  lines.push('# 30-Minute Usage Test Report')
  lines.push('')
  lines.push('## 1. Run metadata')
  lines.push(`- Start: ${new Date(state.t0).toISOString()}`)
  lines.push(`- Duration target: 30 min`)
  lines.push(`- Git commit: ${gitCommit}`)
  lines.push(`- AI model: local Ollama qwen3:8b`)
  lines.push('')

  lines.push('## 2. Pass/fail summary')
  lines.push('| Check | Result |')
  lines.push('|---|---|')
  lines.push(`| Console errors | ${consoleErrors.length === 0 ? 'PASS' : `WARN (${consoleErrors.length})`} |`)
  lines.push(`| Page errors | ${pageErrors.length === 0 ? 'PASS' : `FAIL (${pageErrors.length})`} |`)
  lines.push(`| WS disconnects | ${wsDrops.length === 0 ? 'PASS' : `WARN (${wsDrops.length})`} |`)
  lines.push(`| TV connectivity | ${tvUptimePct >= 95 ? 'PASS' : 'WARN'} (${tvUptimePct.toFixed(1)}%) |`)
  lines.push(`| Showcase screens created | ${showcaseCreated.length}/3 expected |`)
  lines.push(`| AI turns completed | ${aiTurns.length}/6 expected |`)
  lines.push(`| Price changes applied | ${priceChanges.filter((e) => e.ok).length}/3 expected |`)
  lines.push('')

  lines.push('## 3. CPU / Memory')
  for (const group of ['vite', 'server', 'chrome'] as const) {
    const s = summarize(group)
    lines.push(`**${group}**: CPU avg ${s.avgCpu.toFixed(1)}% (max ${s.maxCpu.toFixed(1)}%), RSS avg ${s.avgRssMb.toFixed(0)}MB (max ${s.maxRssMb.toFixed(0)}MB)`)
    lines.push(`  - t=5min vs t=25min RSS: ${rssAt(early, group).toFixed(0)}MB -> ${rssAt(late, group).toFixed(0)}MB`)
  }
  lines.push(`- Idle baseline samples: ${idleSamples.length} (see metrics.jsonl, phase=idle-baseline)`)
  lines.push('')

  lines.push('## 4. Disk')
  for (const d of diskSamples) {
    lines.push(`- t=${Math.round(d.tSec)}s: ${d.du.replace(/\n/g, '; ')}`)
  }
  lines.push('')

  lines.push('## 5. Reliability detail')
  lines.push(`- Console errors: ${consoleErrors.length}`)
  lines.push(`- Page errors: ${pageErrors.length}`)
  lines.push(`- WS disconnect events: ${wsDrops.length}`)
  lines.push(`- TV connection transitions: ${tvTransitions.length}`)
  lines.push('')

  lines.push('## 6. Activity log')
  lines.push(`- Display switches: ${displaySwitches.length}`)
  lines.push(`- AI turns: ${aiTurns.length}`)
  for (const t of aiTurns) lines.push(`  - [${t.mode}] "${String(t.question).slice(0, 60)}..." — ${t.latencyMs}ms — ${t.outcome ?? (t.hadReply ? 'replied' : 'no reply')}`)
  lines.push(`- Price changes: ${priceChanges.length}`)
  lines.push(`- Showcase screens created: ${showcaseCreated.map((e) => e.screenID).join(', ')}`)
  lines.push('')

  lines.push('## 7. Cleanup verification')
  const cleanupEvents = events.filter((e) => e.type === 'cleanup')
  for (const c of cleanupEvents) lines.push(`- ${c.step}: ${c.ok !== false ? 'OK' : `FAILED (${c.error})`}`)
  lines.push('')

  lines.push('## 8. Known limitations')
  lines.push('- Chromium CPU/RSS reported as one aggregate across all 3 windows, not per-tab.')
  lines.push('- TV monitored via disk-poll of lastSeenAt, not native automation.')
  lines.push('- Numbers include the cost of running 3 headed browsers + Ollama + preview server concurrently on this dev machine.')

  writeFileSync(path.join(RUN_DIR, 'report.md'), lines.join('\n'))
}

main().catch((err) => {
  console.error('FATAL:', err)
  process.exit(1)
})
