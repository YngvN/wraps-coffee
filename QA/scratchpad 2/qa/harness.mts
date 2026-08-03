// QA automation harness for assistant-qa-report-2026-08-02.md. Scratchpad-only, not part of the app.
import { chromium, type Browser, type Page } from 'playwright'
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs'
import path from 'node:path'

export const BASE_URL = 'http://localhost:5173'
export const REPO_ROOT = '/Users/yngve/Desktop/GitHub/wraps-coffee'
export const SCREEN_DIR = path.join(REPO_ROOT, 'assistant-qa-screenshots')
export const RESULTS_PATH = path.join(REPO_ROOT, 'scratchpad/qa/results.json')

export type ScenarioStatus = 'PASS' | 'PARTIAL' | 'FAIL' | 'N/A' | 'ERROR' | 'CAPTURED'

export interface ScenarioResult {
  id: string
  title: string
  phase: string
  status: ScenarioStatus
  notes: string
  evidence?: Record<string, unknown>
  trace?: string[]
  screenshot?: string
}

// Each script (seed.mts / scenarios.mts / cleanup.mts) is a separate Node
// process — load whatever's already on disk at import time so a later
// script's writes don't blindly clobber an earlier script's tracked state.
function loadExisting(): { results: ScenarioResult[]; created: { type: string; name: string; note?: string }[] } {
  if (!existsSync(RESULTS_PATH)) return { results: [], created: [] }
  try {
    const parsed = JSON.parse(readFileSync(RESULTS_PATH, 'utf-8'))
    return { results: parsed.results ?? [], created: parsed.created ?? [] }
  } catch {
    return { results: [], created: [] }
  }
}

const existing = loadExisting()
export const results: ScenarioResult[] = existing.results
export const created: { type: string; name: string; note?: string }[] = existing.created

export function saveResults() {
  mkdirSync(path.dirname(RESULTS_PATH), { recursive: true })
  writeFileSync(RESULTS_PATH, JSON.stringify({ results, created, updatedAt: new Date().toISOString() }, null, 2))
}

export function record(r: ScenarioResult) {
  // A scenario id can be re-recorded across re-runs of the same script — replace, don't duplicate.
  const idx = results.findIndex((existingResult) => existingResult.id === r.id)
  if (idx >= 0) results[idx] = r
  else results.push(r)
  saveResults()
  console.log(`[${r.status}] ${r.id} — ${r.title}`)
}

export function trackCreated(type: string, name: string, note?: string) {
  created.push({ type, name, note })
  saveResults()
}

export function untrackCreated(type: string, name: string) {
  const idx = created.findIndex((c) => c.type === type && c.name === name)
  if (idx >= 0) created.splice(idx, 1)
  saveResults()
}

export function exact(name: string): RegExp {
  return new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`)
}

let shotCounter = 0
export async function shot(page: Page, name: string): Promise<string> {
  mkdirSync(SCREEN_DIR, { recursive: true })
  shotCounter += 1
  const file = `${String(shotCounter).padStart(3, '0')}-${name}.png`
  await page.screenshot({ path: path.join(SCREEN_DIR, file), fullPage: true }).catch(() => {})
  return file
}

export async function launch(): Promise<{ browser: Browser; page: Page }> {
  // Headed on purpose for this pass — the user wants to watch the run happen live.
  const browser = await chromium.launch({ headless: false })
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
  page.on('dialog', (dialog) => dialog.accept().catch(() => {}))
  page.setDefaultTimeout(15000)
  return { browser, page }
}

export async function login(page: Page, username = 'admin', password = '1234') {
  await page.goto(`${BASE_URL}/admin/login`)
  await page.locator('#admin-username').fill(username)
  await page.locator('#admin-password').fill(password)
  await page.locator('form.admin-login__form button[type="submit"]').click()
  await page.waitForURL('**/admin/dashboard/**', { timeout: 20000 })
}

export async function gotoDashboard(page: Page, qs = '') {
  await page.goto(`${BASE_URL}/admin/dashboard/${qs}`)
}

/**
 * Writes go through `useLocalStorage` → `publish()`, which debounces 400ms
 * before actually sending over the WS to the local server (`syncClient.ts`,
 * `WRITE_DEBOUNCE_MS`). A hard `page.goto()` reload destroys the socket and
 * reconnects fresh; if that happens before the debounced publish flushes,
 * the server's still-stale snapshot on reconnect silently overwrites the
 * just-made local write. Call this after any Save/Lagre click and before
 * any hard navigation.
 */
export async function waitForSyncFlush(page: Page) {
  await page.waitForTimeout(900)
}

// ---------- Assistant chat helpers ----------

// A class-based selector, not `getByPlaceholder` — the placeholder text is
// translated, so it silently stops matching the instant a scenario switches
// the dashboard to English (this broke every scenario after A.9b once).
function composerLocator(page: Page) {
  return page.locator('.assistant-panel__composer textarea')
}

export async function openAssistant(page: Page) {
  const alreadyOpen = await page.locator('.assistant-panel__transcript').count()
  if (alreadyOpen) return
  await page.locator('.admin-top-navbar__icon-link--assistant').click()
  await page.locator('.assistant-panel__transcript').waitFor({ timeout: 10000 })
}

/**
 * Starts a fresh chat session the same way a human tester would — the panel's own "New chat"
 * button (`flow.newChat()`). Only rendered once the transcript has at least one line (see
 * `AssistantPanel.tsx`'s `isChatEmpty`), so a no-op when the chat is already empty (e.g. the very
 * first scenario of a run). This does NOT reset `localStorage` (posture, per-chat model overrides,
 * conversation log) — those are device-scoped settings, not session-scoped, by design.
 */
export async function newChat(page: Page) {
  await openAssistant(page)
  const btn = page.getByRole('button', { name: 'Ny samtale', exact: true })
  if (await btn.count()) {
    await btn.click()
    await page.waitForTimeout(400)
  }
}

export async function closeModelMenu(page: Page) {
  const backBtn = page.locator('.assistant-panel__log-back')
  if (await backBtn.count()) await backBtn.click().catch(() => {})
}

export async function openModelMenu(page: Page) {
  await page.getByRole('button', { name: 'AI-modell for denne samtalen' }).click()
  await page.locator('#assistant-provider-select').waitFor({ timeout: 10000 })
}

export async function configureAssistantModel(page: Page, opts: { provider?: 'standard' | 'claude' | 'local'; thinkingModel?: string; visionModel?: string; posture?: 'auto' | 'safe' | 'full' }) {
  await openAssistant(page)
  await openModelMenu(page)
  if (opts.provider) {
    await page.locator('#assistant-provider-select').selectOption(opts.provider)
  }
  if (opts.provider === 'local' && opts.thinkingModel) {
    const sel = page.locator('#assistant-local-thinking-model-select')
    if (await sel.count()) await sel.selectOption({ label: opts.thinkingModel }).catch(async () => sel.selectOption(opts.thinkingModel).catch(() => {}))
  }
  if (opts.provider === 'local' && opts.visionModel) {
    const sel = page.locator('#assistant-local-vision-model-select')
    if (await sel.count()) await sel.selectOption({ label: opts.visionModel }).catch(async () => sel.selectOption(opts.visionModel).catch(() => {}))
  }
  if (opts.posture) {
    await page.locator('#assistant-ingestion-posture-select').selectOption(opts.posture)
  }
  await closeModelMenu(page)
}

/**
 * Sends a chat message and waits for the turn to finish, returning the reply
 * text (if any — a create/update/delete/clarification turn often renders
 * straight into a gate/review/batch/clarification card with NO plain
 * `.assistant-panel__line--assistant` text bubble at all) and a best-effort
 * trace dump. Keys off the busy typing indicator (`role="status"`,
 * `AssistantTypingIndicator`) rather than the assistant-line count, since
 * that count only increases for turns that produce a plain text reply.
 */
export async function sendChat(page: Page, message: string, opts: { timeoutMs?: number } = {}): Promise<{ reply: string; trace: string[] }> {
  const timeoutMs = opts.timeoutMs ?? 180000
  const beforeCount = await page.locator('.assistant-panel__line--assistant').count()
  const composer = composerLocator(page)
  await composer.click()
  await composer.fill(message)
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  // Scoped to .assistant-typing-indicator specifically — a bare role=status
  // also matches dnd-kit's own live region on the Products page, which stays
  // mounted underneath the assistant drawer and causes a strict-mode clash.
  const status = page.locator('.assistant-typing-indicator')
  await status.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {})
  await status.waitFor({ state: 'detached', timeout: timeoutMs })
  // give the UI a beat to finish rendering the review/gate/clarification block after busy clears
  await page.waitForTimeout(500)
  const afterCount = await page.locator('.assistant-panel__line--assistant').count()
  const reply =
    afterCount > beforeCount
      ? await page
          .locator('.assistant-panel__line--assistant')
          .last()
          .innerText()
          .catch(() => '')
      : ''
  const trace = await captureLatestTrace(page)
  return { reply, trace }
}

export async function captureLatestTrace(page: Page): Promise<string[]> {
  try {
    const traceRoot = page.locator('.assistant-thought-trace').last()
    if (!(await traceRoot.count())) return []
    const summary = traceRoot.locator('.assistant-thought-trace__summary')
    await summary.click({ timeout: 3000 }).catch(() => {})
    await page.waitForTimeout(150)
    const steps = traceRoot.locator('.assistant-thought-trace__step')
    const n = await steps.count()
    const out: string[] = []
    for (let i = 0; i < n; i++) {
      const step = steps.nth(i)
      const label = await step.locator('.assistant-thought-trace__step-summary-label').innerText().catch(() => '')
      const stepSummary = step.locator('.assistant-thought-trace__step-summary')
      await stepSummary.click({ timeout: 3000 }).catch(() => {})
      const raw = await step
        .locator('.assistant-thought-trace__step-raw')
        .innerText()
        .catch(() => '')
      out.push(`${label}\n${raw}`)
    }
    return out
  } catch {
    return []
  }
}

// ---------- Review / gate / clarification / batch DOM helpers ----------

export async function isGateVisible(page: Page): Promise<boolean> {
  return (await page.locator('.assistant-draft-quality-gate').count()) > 0
}

export async function gateFieldCountText(page: Page): Promise<string> {
  return page.locator('.assistant-draft-quality-gate').innerText().catch(() => '')
}

export async function clickGateSeeDetails(page: Page) {
  await page.getByRole('button', { name: 'Se detaljer', exact: true }).click()
}
export async function clickGateTryAgain(page: Page) {
  await page.getByRole('button', { name: 'Prøv igjen', exact: true }).click()
}
export async function clickGateCancel(page: Page) {
  await page.getByRole('button', { name: 'Avbryt', exact: true }).click()
}

export async function isClarificationVisible(page: Page): Promise<boolean> {
  return (await page.locator('.assistant-panel__confirm-item').count()) > 0
}

export async function getClarificationOptionLabels(page: Page): Promise<string[]> {
  const buttons = page.locator('.assistant-panel__confirm-item button')
  const n = await buttons.count()
  const out: string[] = []
  for (let i = 0; i < n; i++) out.push((await buttons.nth(i).innerText().catch(() => '')).trim())
  return out
}

export async function clickClarificationOption(page: Page, label: string) {
  await page.locator('.assistant-panel__confirm-item button', { hasText: exact(label) }).first().click()
}

export async function isBatchReviewVisible(page: Page): Promise<boolean> {
  return (await page.locator('.assistant-batch-review').count()) > 0
}

export async function batchCardCount(page: Page): Promise<number> {
  return page.locator('.assistant-batch-review__card').count()
}

export async function batchCardSummaryTexts(page: Page): Promise<string[]> {
  const cards = page.locator('.assistant-batch-review__card')
  const n = await cards.count()
  const out: string[] = []
  for (let i = 0; i < n; i++) out.push((await cards.nth(i).innerText().catch(() => '')).trim())
  return out
}

export async function confirmAllDisabledInfo(page: Page): Promise<{ disabled: boolean; hint: string | null }> {
  const btn = page.getByRole('button', { name: 'Bekreft alle', exact: true })
  const disabled = await btn.isDisabled().catch(() => false)
  const hint = await btn.getAttribute('title').catch(() => null)
  return { disabled, hint }
}

export async function isSingleReviewVisible(page: Page): Promise<boolean> {
  const review = page.locator('.assistant-panel__review')
  if (!(await review.count())) return false
  const hasGate = await isGateVisible(page)
  const hasBatch = await isBatchReviewVisible(page)
  return !hasGate && !hasBatch
}

export async function singleReviewText(page: Page): Promise<string> {
  return page.locator('.assistant-panel__review').innerText().catch(() => '')
}

export async function clickReviewConfirm(page: Page) {
  await page.locator('.assistant-panel__review').getByRole('button', { name: 'Bekreft', exact: true }).click()
}
export async function clickReviewEdit(page: Page) {
  await page.locator('.assistant-panel__review').getByRole('button', { name: 'Rediger', exact: true }).click()
}
export async function clickReviewCancel(page: Page) {
  await page.locator('.assistant-panel__review').getByRole('button', { name: 'Avbryt', exact: true }).click()
}

export async function isDestructiveConfirmVisible(page: Page): Promise<boolean> {
  return (await page.locator('.assistant-panel__field input').count()) > 0 && (await page.locator('.assistant-panel__review, .assistant-panel__confirm-item').count()) >= 0
}

export async function getDestructiveConfirmPhrase(page: Page): Promise<string> {
  const label = await page.locator('.assistant-panel__field span').first().innerText().catch(() => '')
  const match = label.match(/[«"]([^»"]+)[»"]/)
  return match ? match[1] : ''
}

export async function typeDestructiveConfirm(page: Page, phrase: string) {
  await page.locator('.assistant-panel__field input').first().fill(phrase)
}

export async function clickDestructiveConfirm(page: Page) {
  await page.getByRole('button', { name: 'Bekreft', exact: true }).click()
}

export async function composerText(page: Page): Promise<string> {
  return composerLocator(page).inputValue().catch(() => '')
}

export async function isComposerFocused(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLTextAreaElement | null
    return !!el && el.tagName === 'TEXTAREA' && el.closest('.assistant-panel__composer') !== null
  })
}

export async function lastAssistantMessages(page: Page, count: number): Promise<string[]> {
  const lines = page.locator('.assistant-panel__line--assistant')
  const total = await lines.count()
  const start = Math.max(0, total - count)
  const out: string[] = []
  for (let i = start; i < total; i++) out.push(await lines.nth(i).innerText().catch(() => ''))
  return out
}

// ---------- Settings helpers ----------

export async function setDashboardLanguage(page: Page, lang: 'Norsk' | 'English') {
  await gotoDashboard(page, 'settings')
  const card = page.locator('.card', { has: page.getByText(exact('Språk')).or(page.getByText(exact('Language'))) }).first()
  await card.getByRole('button', { name: lang }).click()
  await page.waitForTimeout(300)
}

/** `visionTag` defaults to `thinkingTag` (the old single-tag-for-both behavior every existing caller relies on) — pass it explicitly when the thinking model isn't vision-capable (see the normistral-it:7b re-test, which keeps a real vision model in that slot instead). */
export async function configureOllamaCustomModel(page: Page, thinkingTag: string, visionTag: string = thinkingTag) {
  await gotoDashboard(page, 'settings')
  await page.waitForTimeout(800)
  const integrationsBtn = page.getByRole('button', { name: 'Integrasjonsinnstillinger', exact: true })
  if (await integrationsBtn.count()) {
    await integrationsBtn.click()
    await page.waitForTimeout(800)
  }
  const thinkingTier = page.locator('#integrations-ollama-thinking-tier')
  if (!(await thinkingTier.count())) {
    const summary = page.locator('.integration-submenu__summary', { hasText: 'Ollama' }).first()
    await summary.waitFor({ timeout: 10000 })
    await page.waitForTimeout(500)
    await summary.click({ force: true })
    await page.waitForTimeout(500)
  }
  await thinkingTier.waitFor({ timeout: 10000 })
  await thinkingTier.selectOption({ label: 'Egendefinert…' }).catch(() => thinkingTier.selectOption('__custom__'))
  await page.locator('#integrations-ollama-thinking-custom').fill(thinkingTag)
  const visionTier = page.locator('#integrations-ollama-vision-tier')
  await visionTier.selectOption({ label: 'Egendefinert…' }).catch(() => visionTier.selectOption('__custom__'))
  await page.locator('#integrations-ollama-vision-custom').fill(visionTag)
  await page.locator('.integrations-view__ollama-actions').getByRole('button', { name: 'Lagre', exact: true }).click()
  await page.waitForTimeout(500)
}

// ---------- Products/catalogue helpers ----------

export async function openProducts(page: Page) {
  await gotoDashboard(page, 'products')
  await page.locator('.products-view').first().waitFor({ timeout: 10000 })
  await page.waitForTimeout(500)
}

export async function addCatalogue(page: Page, name: string | null, opts: { allowBlank?: boolean } = {}) {
  await openProducts(page)
  await page.getByRole('button', { name: 'Legg til katalog' }).click()
  await page.locator('#catalogue-name').waitFor()
  if (name) {
    await page.locator('#catalogue-name').fill(name)
  } else if (opts.allowBlank) {
    await page.evaluate(() => document.querySelector('#catalogue-name')?.removeAttribute('required'))
  }
  await page.getByRole('button', { name: 'Lagre', exact: true }).click()
  await page.locator('#catalogue-name').waitFor({ state: 'detached', timeout: 10000 }).catch(() => {})
  await waitForSyncFlush(page)
  if (name) trackCreated('catalogue', name)
}

export async function openCatalogue(page: Page, name: string) {
  await openProducts(page)
  if (name === '') {
    // blank-named catalogue: open the one whose name span is empty
    const items = page.locator('.products-view__item-open')
    const n = await items.count()
    for (let i = 0; i < n; i++) {
      const text = (await items.nth(i).locator('.products-view__item-name').innerText().catch(() => '')).trim()
      if (text === '') {
        await items.nth(i).click({ force: true })
        await page.waitForTimeout(400)
        return
      }
    }
    throw new Error('blank-named catalogue not found')
  }
  const row = page.locator('.products-view__item-open', { hasText: exact(name) }).first()
  await row.waitFor({ timeout: 10000 })
  await row.click({ force: true })
  await page.waitForTimeout(400)
}

export async function addCategory(page: Page, name: string | null, opts: { allowBlank?: boolean; customFields?: { name: string; type?: string }[] } = {}) {
  await page.getByRole('button', { name: 'Legg til kategori' }).click()
  await page.locator('#category-name').waitFor()
  if (name) {
    await page.locator('#category-name').fill(name)
  } else if (opts.allowBlank) {
    await page.evaluate(() => document.querySelector('#category-name')?.removeAttribute('required'))
  }
  if (opts.customFields) {
    for (const field of opts.customFields) {
      await page.getByRole('button', { name: 'Legg til egendefinert felt' }).click()
      const rows = page.getByPlaceholder('Feltnavn')
      await rows.last().fill(field.name)
    }
  }
  await page.getByRole('button', { name: 'Lagre', exact: true }).click()
  await page.locator('#category-name').waitFor({ state: 'detached', timeout: 10000 }).catch(() => {})
  await waitForSyncFlush(page)
  if (name) trackCreated('category', name)
}

export async function expandCategorySection(page: Page, categoryName: string) {
  const section = page.locator('.product-column').filter({ has: page.locator('.products-view__item-name', { hasText: exact(categoryName) }) }).first()
  await section.waitFor({ timeout: 10000 })
  const expanded = await section.locator('.product-column__chevron--open').count()
  if (!expanded) {
    await section.locator('.products-view__item-open').click()
    await section.locator('.product-column__body').waitFor({ timeout: 10000 })
  }
  return section
}

export interface ProductSpec {
  name: string
  nameEn?: string
  priceMode?: 'inherit' | 'flat' | 'dual'
  price?: number
  priceTakeaway?: number
  priceEatIn?: number
  discountMode?: 'none' | 'percentage' | 'amount'
  discountValue?: number
}

export async function addProductToCategory(page: Page, categoryName: string, spec: ProductSpec) {
  const section = await expandCategorySection(page, categoryName)
  await section.locator('.products-view__add-row', { hasText: 'Legg til produkt' }).click()
  await page.locator('#product-name').waitFor()
  await page.locator('#product-name').fill(spec.name)
  if (spec.nameEn) {
    const enTab = page.getByRole('tab', { name: 'English' })
    if (!(await enTab.count())) {
      await page.getByRole('button', { name: 'Legg til språk' }).click()
      await page.getByRole('tab', { name: 'English' }).click().catch(() => {})
    } else {
      await enTab.click()
    }
    await page.locator('#product-name').fill(spec.nameEn)
    await page.getByRole('tab', { name: 'Norsk' }).click()
  }
  if (spec.priceMode === 'flat' && spec.price !== undefined) {
    await page.locator('input[name="priceMode"]').nth(1).check()
    await page.getByRole('spinbutton', { name: 'Pris', exact: true }).fill(String(spec.price))
  } else if (spec.priceMode === 'dual') {
    await page.locator('input[name="priceMode"]').nth(2).check()
    if (spec.priceTakeaway !== undefined) await page.getByRole('spinbutton', { name: 'Pris, ta med', exact: true }).fill(String(spec.priceTakeaway))
    if (spec.priceEatIn !== undefined) await page.getByRole('spinbutton', { name: 'Pris, spise her', exact: true }).fill(String(spec.priceEatIn))
  }
  if (spec.discountMode === 'percentage' && spec.discountValue !== undefined) {
    await page.locator('input[name="discountMode"]').nth(1).check()
    await page.getByRole('spinbutton', { name: 'Prosent avslag', exact: true }).fill(String(spec.discountValue))
  } else if (spec.discountMode === 'amount' && spec.discountValue !== undefined) {
    await page.locator('input[name="discountMode"]').nth(2).check()
    await page.getByRole('spinbutton', { name: 'Beløp avslag (kr)', exact: true }).fill(String(spec.discountValue))
  }
  await page.getByRole('button', { name: 'Lagre', exact: true }).click()
  await page.locator('#product-name').waitFor({ state: 'detached', timeout: 10000 }).catch(() => {})
  await waitForSyncFlush(page)
  trackCreated('product', spec.name, categoryName)
}

export async function deleteCategoryByName(page: Page, categoryName: string) {
  const row = page
    .locator('.products-view__item')
    .filter({ has: page.locator('.products-view__item-name', { hasText: exact(categoryName) }) })
    .first()
  await row.getByRole('button', { name: 'Slett', exact: true }).click()
  await waitForSyncFlush(page)
}

export async function deleteProductInCategory(page: Page, categoryName: string, productName: string) {
  const section = await expandCategorySection(page, categoryName)
  const row = section
    .locator('.products-view__item')
    .filter({ has: page.locator('.products-view__item-name', { hasText: exact(productName) }) })
    .first()
  await row.getByRole('button', { name: 'Slett', exact: true }).click()
  await waitForSyncFlush(page)
}

export async function deleteEventByTitle(page: Page, title: string) {
  await gotoDashboard(page, 'events')
  await page.waitForTimeout(600)
  const row = page
    .locator('.events-view__item')
    .filter({ has: page.locator('.events-view__item-title', { hasText: exact(title) }) })
    .first()
  await row.getByRole('button', { name: 'Slett', exact: true }).click()
  await waitForSyncFlush(page)
}

export async function deleteCatalogueByName(page: Page, name: string) {
  await openProducts(page)
  const item = page
    .locator('.products-view__item')
    .filter({ has: page.locator('.products-view__item-name', { hasText: exact(name) }) })
    .first()
  await item.getByRole('button', { name: 'Slett', exact: true }).click()
  await waitForSyncFlush(page)
}

// ---------- Events helpers ----------

export async function addEvent(page: Page, spec: { titleNo: string; category: string; date: string; startTime?: string; endTime?: string; address?: string }) {
  await gotoDashboard(page, 'events')
  await page.getByRole('button', { name: 'Legg til arrangement' }).click().catch(async () => {
    await page.getByRole('button', { name: exact('Legg til arrangement') }).click()
  })
  await page.locator('#event-title').waitFor()
  await page.locator('#event-title').fill(spec.titleNo)
  await page.locator('#event-category').fill(spec.category)
  await page.locator('#event-date').fill(spec.date)
  if (spec.startTime) await page.locator('#event-time').fill(spec.startTime)
  if (spec.endTime) await page.locator('#event-end-time').fill(spec.endTime)
  if (spec.address) await page.locator('#event-location-address').fill(spec.address)
  await page.getByRole('button', { name: 'Lagre', exact: true }).click()
  await page.locator('#event-title').waitFor({ state: 'detached', timeout: 10000 }).catch(() => {})
  await waitForSyncFlush(page)
  trackCreated('event', spec.titleNo)
}
