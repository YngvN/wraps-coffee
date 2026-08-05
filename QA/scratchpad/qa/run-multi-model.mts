// Multi-model comparison run — see QA/Reports/qa-test-plan-multi-model-2026-08-04.md for the full
// classification/reasoning behind every scenario below. Sections A/B/C are adapted verbatim from
// retest-qwen3-8b.mts (2026-08-03), which already folded in every harness fix that cycle discovered
// (gate-aware batch checks, retry-once, clipboard trace capture); Section K is new this cycle,
// covering server/assistant/postChecks/ (shipped 2026-08-04, commit c5707c4) — its first-ever QA pass.
//
// Model/provider config comes from env vars so this one script drives all three runs in the plan's
// own Execution Sequence, rather than three hand-copied near-duplicate files:
//   QA_RUN_LABEL=gemma3-4b        QA_PROVIDER=local  QA_THINKING=gemma3:4b  QA_VISION=gemma3:4b       npx tsx run-multi-model.mts
//   QA_RUN_LABEL=qwen3-8b         QA_PROVIDER=local  QA_THINKING=qwen3:8b   QA_VISION=qwen2.5vl:3b    npx tsx run-multi-model.mts
//   QA_RUN_LABEL=claude-sonnet-4-5 QA_PROVIDER=claude QA_CLAUDE_MODEL=claude-sonnet-4-5              npx tsx run-multi-model.mts
// QA_RUN_LABEL also controls harness.mts's own SCREEN_DIR/RESULTS_PATH (see that file's own header).
import type { Page } from 'playwright'
import {
  launch,
  login,
  setDashboardLanguage,
  openAssistant,
  openModelMenu,
  closeModelMenu,
  configureAssistantModel,
  configureOllamaCustomModel,
  newChat,
  sendChat,
  shot,
  record,
  trackCreated,
  saveResults,
  type ScenarioStatus,
  isGateVisible,
  gateFieldCountText,
  clickGateSeeDetails,
  clickGateTryAgain,
  clickGateCancel,
  isClarificationVisible,
  getClarificationOptionLabels,
  clickClarificationOption,
  isBatchReviewVisible,
  reachBatchReview,
  batchCardCount,
  batchCardSummaryTexts,
  confirmAllDisabledInfo,
  isSingleReviewVisible,
  singleReviewText,
  clickReviewConfirm,
  clickReviewEdit,
  clickReviewCancel,
  getDestructiveConfirmPhrase,
  typeDestructiveConfirm,
  clickDestructiveConfirm,
  composerText,
  isComposerFocused,
  gotoDashboard,
  addProductToCategory,
  openCatalogue,
  expandCategorySection,
  productExistsInCategory,
} from './harness.mts'
import { batchCardAction, clickConfirmAll, clickCancelAll } from './harness2.mts'

const PROVIDER = (process.env.QA_PROVIDER as 'local' | 'claude') ?? 'local'
const THINKING_MODEL = process.env.QA_THINKING ?? 'qwen3:8b'
const VISION_MODEL = process.env.QA_VISION ?? THINKING_MODEL
const CLAUDE_MODEL = process.env.QA_CLAUDE_MODEL ?? 'claude-sonnet-4-5'

async function run(
  id: string,
  title: string,
  phase: string,
  fn: () => Promise<{ status: ScenarioStatus; notes: string; evidence?: Record<string, unknown>; trace?: string[]; screenshot?: string; attempts?: string[] }>,
) {
  try {
    const r = await fn()
    record({ id, title, phase, ...r })
  } catch (err) {
    record({ id, title, phase, status: 'ERROR', notes: `Harness exception: ${err instanceof Error ? err.stack ?? err.message : String(err)}` })
  }
}

async function shotFor(page: Page, id: string) {
  return shot(page, id.replace(/\./g, '-'))
}

/**
 * Retry-once rule (plan's own Methodology #3): if `reachedState` is false after the first attempt,
 * start a fresh session and try again once before giving up. Returns both attempts' results so the
 * caller can report attempt 1 / attempt 2 notes even when the retry is what actually worked.
 */
async function withRetryOnce<T extends { reachedState: boolean }>(page: Page, attempt: () => Promise<T>): Promise<{ first: T; second?: T }> {
  const first = await attempt()
  if (first.reachedState) return { first }
  await newChat(page)
  const second = await attempt()
  return { first, second }
}

// ---------- Section K helpers ----------

interface CheckVerdict {
  name: string
  ok: boolean
  reason?: string
  action?: 'auto-fix' | 'reject-retry' | 'reject-clarify'
  attempt: 1 | 2
}

/** Scans every "Checks: [...]" line this turn's own trace blocks carry (see AssistantPanel.tsx's
 * buildConversationClipboardText, fixed 2026-08-04 to actually include entry.checks — it previously
 * declared the field server-side but never wired it into the one place this harness reads). */
function extractChecks(trace: string[], checkName?: string): CheckVerdict[] {
  const found: CheckVerdict[] = []
  for (const block of trace) {
    for (const line of block.split('\n')) {
      const m = line.match(/Checks:\s*(\[.*\])/)
      if (!m) continue
      try {
        const parsed = JSON.parse(m[1]) as CheckVerdict[]
        found.push(...parsed)
      } catch {
        // malformed/truncated (500-char server-side cap) — skip rather than crash the run
      }
    }
  }
  return checkName ? found.filter((c) => c.name === checkName) : found
}

/** Retry-once for a Section K adversarial row: "reached a testable state" means the target check's
 * name showed up in the trace at all (fired ok:true or ok:false) — a check silently absent from the
 * trace on a step that should have run it is itself the failure to retry against, per the plan's own
 * Methodology #17. */
async function withCheckRetryOnce(page: Page, checkName: string, attempt: () => Promise<{ reply: string; trace: string[] }>) {
  const a1 = await attempt()
  const v1 = extractChecks(a1.trace, checkName)
  if (v1.length > 0) return { reply: a1.reply, trace: a1.trace, verdicts: v1, retried: false }
  await newChat(page)
  const a2 = await attempt()
  const v2 = extractChecks(a2.trace, checkName)
  return { reply: a2.reply, trace: [...a1.trace, ...a2.trace], verdicts: v2, retried: true }
}

async function dismissWhateverIsOpen(page: Page) {
  if (await isGateVisible(page)) {
    await clickGateSeeDetails(page)
    await page.waitForTimeout(300)
  }
  if (await page.locator('.assistant-panel__review').count()) await clickReviewCancel(page).catch(() => {})
  if (await isBatchReviewVisible(page)) await clickCancelAll(page).catch(() => {})
}

async function main() {
  const { browser, page } = await launch()
  try {
    await login(page)
    await setDashboardLanguage(page, 'Norsk')

    if (PROVIDER === 'local') {
      // Global Integrations config — the fallback every "Default (from settings)" kebab option reads.
      await configureOllamaCustomModel(page, THINKING_MODEL, VISION_MODEL)
      await openAssistant(page)
      await configureAssistantModel(page, { provider: 'local', thinkingModel: THINKING_MODEL, visionModel: VISION_MODEL, posture: 'auto' })
    } else {
      await openAssistant(page)
      await configureAssistantModel(page, { provider: 'claude', claudeModel: CLAUDE_MODEL, posture: 'auto' })
    }

    // ================= SECTION A: read/lookup =================

    await run('A.1', 'Product count (deterministic lookup)', 'A', async () => {
      await newChat(page)
      const { reply, trace } = await sendChat(page, 'Hvor mange produkter har vi?')
      const screenshot = await shotFor(page, 'A.1')
      const usesAnswerLookup = trace.some((t) => /answer_lookup/i.test(t))
      const usesLookupQuery = trace.some((t) => /lookup_query/i.test(t))
      return {
        status: 'CAPTURED',
        notes: `Reply: "${reply}". trace uses lookup_query=${usesLookupQuery}, uses answer_lookup=${usesAnswerLookup} (expect false for deterministic count path). Verify against current admin-UI product count, not a hardcoded number.`,
        evidence: { reply, usesAnswerLookup, usesLookupQuery },
        trace,
        screenshot,
      }
    })

    await run('A.2', 'Discounted product count', 'A', async () => {
      await newChat(page)
      const { reply, trace } = await sendChat(page, 'Hvor mange produkter er på tilbud?')
      const screenshot = await shotFor(page, 'A.2')
      return { status: 'CAPTURED', notes: `Reply: "${reply}" — verify against current active-discount count via admin UI.`, evidence: { reply }, trace, screenshot }
    })

    await run('A.3', 'Which product is on sale', 'A', async () => {
      await newChat(page)
      const { reply, trace } = await sendChat(page, 'Hvilke produkter er på tilbud?')
      const screenshot = await shotFor(page, 'A.3')
      return { status: 'CAPTURED', notes: `Reply: "${reply}" (expect mentions Michelin Vinterdekk).`, evidence: { reply }, trace, screenshot }
    })

    await run('A.4', 'List all products (bullet attachment)', 'A', async () => {
      await newChat(page)
      const { reply, trace } = await sendChat(page, 'Gi meg en liste over alle produkter', { timeoutMs: 240000 })
      const screenshot = await shotFor(page, 'A.4')
      const listItemCount = await page.locator('.assistant-panel__transcript li').count()
      return {
        status: 'CAPTURED',
        notes: `Reply: "${reply.slice(0, 300)}...". DOM <li> count near transcript: ${listItemCount} (expect a real list, not one run-on sentence or an empty/hallucinated answer).`,
        evidence: { reply, listItemCount },
        trace,
        screenshot,
      }
    })

    await run('A.5', 'Compound imperative+interrogative', 'A', async () => {
      await newChat(page)
      const { reply, trace } = await sendChat(page, 'Gi meg en liste over alle produkter og vis meg hvem som er på tilbud', { timeoutMs: 240000 })
      const screenshot = await shotFor(page, 'A.5')
      return { status: 'CAPTURED', notes: `Reply: "${reply.slice(0, 400)}..."`, evidence: { reply }, trace, screenshot }
    })

    await run('A.6', 'Compound two-interrogative', 'A', async () => {
      await newChat(page)
      const { reply, trace } = await sendChat(page, 'Hvor mange produkter har vi og hvem er på tilbud?')
      const screenshot = await shotFor(page, 'A.6')
      return { status: 'CAPTURED', notes: `Reply: "${reply}" — check whether both halves answered or one silently dropped.`, evidence: { reply }, trace, screenshot }
    })

    await run('A.7', 'Non-question phrase must not trigger create', 'A', async () => {
      await newChat(page)
      const { reply, trace } = await sendChat(page, 'et stort og et lite frontlys')
      const gate = await isGateVisible(page)
      const batch = await isBatchReviewVisible(page)
      const review = await isSingleReviewVisible(page)
      const screenshot = await shotFor(page, 'A.7')
      return {
        status: gate || batch || review ? 'FAIL' : 'CAPTURED',
        notes: `Reply: "${reply}". gate=${gate} batch=${batch} singleReview=${review} (all must be false).`,
        evidence: { reply, gate, batch, review },
        trace,
        screenshot,
      }
    })

    await run('A.8/A.11', 'Ambiguous "Frontlys" must clarify', 'A', async () => {
      await newChat(page)
      const { reply, trace } = await sendChat(page, 'Hvor mye koster Frontlys?')
      const clarifying = await isClarificationVisible(page)
      const options = clarifying ? await getClarificationOptionLabels(page) : []
      const screenshot = await shotFor(page, 'A.8-A.11')
      if (clarifying) {
        await clickClarificationOption(page, options[0])
        await page.waitForTimeout(1500)
      }
      return {
        status: clarifying ? 'CAPTURED' : 'FAIL',
        notes: `Reply: "${reply}". clarifying=${clarifying} options=${JSON.stringify(options)} (must list both Frontlys candidates, never silently guess).`,
        evidence: { reply, clarifying, options },
        trace,
        screenshot,
      }
    })

    await run('A.9a', 'Bilingual filter — LED products (Norsk UI)', 'A', async () => {
      await newChat(page)
      const { reply, trace } = await sendChat(page, 'Vis meg alle LED-produkter')
      const screenshot = await shotFor(page, 'A.9a')
      const names = ['LED Headlight Bulb H7', 'LED Interior Strip', 'LED Fog Light']
      const found = names.filter((n) => reply.includes(n))
      return {
        status: 'CAPTURED',
        notes: `Reply: "${reply}". Found ${found.length}/3 LED product names (${JSON.stringify(found)}) — regression check for null-Norwegian-variant bilingual filter. Run before A.9b per the run-order note.`,
        evidence: { reply, found },
        trace,
        screenshot,
      }
    })

    await run('A.9b', 'Bilingual filter — LED products (English UI)', 'A', async () => {
      await newChat(page)
      await setDashboardLanguage(page, 'English')
      await openAssistant(page)
      const { reply, trace } = await sendChat(page, 'Show me all LED products')
      const screenshot = await shotFor(page, 'A.9b')
      const names = ['LED Headlight Bulb H7', 'LED Interior Strip', 'LED Fog Light']
      const found = names.filter((n) => reply.includes(n))
      await setDashboardLanguage(page, 'Norsk')
      await openAssistant(page)
      return {
        status: 'CAPTURED',
        notes: `English UI Q1: "${reply}". Found ${found.length}/3 (${JSON.stringify(found)}) — read alongside A.9a's own result per the run-order note (if A.9a itself failed, this isn't an independent English-only regression).`,
        evidence: { reply, found },
        trace,
        screenshot,
      }
    })

    await run('A.10', 'Pronoun follow-up (own 2-turn continuity, diagnostic)', 'A', async () => {
      await newChat(page)
      const first = await sendChat(page, 'Hvilke produkter har vi i Bremser-kategorien?')
      const second = await sendChat(page, 'Hvor mye koster den første?')
      const screenshot = await shotFor(page, 'A.10')
      return {
        status: 'CAPTURED',
        notes: `Q1 reply: "${first.reply}". Q2 ("den første") reply: "${second.reply}". Diagnostic only. Report primary pronoun-resolution grade separately from any secondary category-scoping issue visible in Q1's own reply.`,
        evidence: { firstReply: first.reply, secondReply: second.reply },
        trace: [...first.trace, ...second.trace],
        screenshot,
      }
    })

    await run('A.12a', 'Event bilingual display (Norsk UI)', 'A', async () => {
      await newChat(page)
      const q1 = await sendChat(page, 'Hvor mange arrangementer har vi?')
      const q2 = await sendChat(page, 'Hvilke arrangementer har vi?')
      const screenshot = await shotFor(page, 'A.12a')
      return {
        status: 'CAPTURED',
        notes: `Q1: "${q1.reply}". Q2: "${q2.reply}" — expect "Bilutstilling på tunet" title shown.`,
        evidence: { q1: q1.reply, q2: q2.reply },
        trace: [...q1.trace, ...q2.trace],
        screenshot,
      }
    })

    await run('A.12b', 'Event bilingual display (English UI, no English title)', 'A', async () => {
      await newChat(page)
      await setDashboardLanguage(page, 'English')
      await openAssistant(page)
      const q1 = await sendChat(page, 'How many events do we have?')
      const q2 = await sendChat(page, 'What events do we have?')
      await gotoDashboard(page, 'events')
      await page.waitForTimeout(800)
      const screenshot2 = await shotFor(page, 'A.12b-events-view')
      const eventsViewText = await page.locator('.events-view').innerText().catch(() => '')
      await setDashboardLanguage(page, 'Norsk')
      await openAssistant(page)
      return {
        status: 'CAPTURED',
        notes: `English UI Q1: "${q1.reply}". Q2: "${q2.reply}". Events list view text: "${eventsViewText.slice(0, 200)}" — title must fall back to Norwegian variant, not render blank.`,
        evidence: { q1: q1.reply, q2: q2.reply, eventsViewText },
        trace: [...q1.trace, ...q2.trace],
        screenshot: screenshot2,
      }
    })

    await run('A.extra', 'Catalogue count and category count', 'A', async () => {
      await newChat(page)
      const q1 = await sendChat(page, 'Hvor mange kataloger har vi?')
      const q2 = await sendChat(page, 'Hvor mange kategorier har vi?')
      const screenshot = await shotFor(page, 'A-extra')
      return {
        status: 'CAPTURED',
        notes: `Catalogues Q: "${q1.reply}" — verify against current catalogue count. Categories Q: "${q2.reply}" — verify against current category count (incl. any "Ikke kategorisert"/blank buckets).`,
        evidence: { q1: q1.reply, q2: q2.reply },
        trace: [...q1.trace, ...q2.trace],
        screenshot,
      }
    })

    saveResults()
    console.log('=== SECTION A COMPLETE ===')

    // ================= SECTION B: single-record ingestion =================

    await run('B.1', 'Confidence markers / posture stripping (create tire)', 'B', async () => {
      const attempt = async () => {
        await newChat(page)
        const { reply, trace } = await sendChat(page, 'Legg til et nytt dekk som heter Continental Sommerdekk, ca 1200 kr')
        const gate = await isGateVisible(page)
        const gateText = gate ? await gateFieldCountText(page) : ''
        if (gate) await clickGateSeeDetails(page)
        const reviewText = await singleReviewText(page)
        const reachedState = (await page.locator('.assistant-panel__review').count()) > 0
        return { reply, trace, gate, gateText, reviewText, reachedState }
      }
      const { first, second } = await withRetryOnce(page, attempt)
      const finalAttempt = second ?? first
      const hasAllergens = /Allergener/i.test(finalAttempt.reviewText)
      const hasDietary = /Diettmerker|Kosthold-tagger/i.test(finalAttempt.reviewText)
      let confirmed = false
      if (finalAttempt.reachedState) {
        await clickReviewConfirm(page)
        await page.waitForTimeout(1000)
        confirmed = true
        trackCreated('product', 'Continental Sommerdekk', 'Dekk')
      }
      const screenshot = await shotFor(page, 'B.1')
      return {
        status: 'CAPTURED',
        notes: `Attempt 1 reply: "${first.reply}" reachedState=${first.reachedState}.${second ? ` Attempt 2 (retry, fresh session) reply: "${second.reply}" reachedState=${second.reachedState}.` : ''} gate=${finalAttempt.gate}. review has Allergener=${hasAllergens} Diettmerker/Kosthold-tagger=${hasDietary} (both must be absent). confirmed=${confirmed}.`,
        evidence: { attempt1: first.reply, attempt2: second?.reply, gate: finalAttempt.gate, hasAllergens, hasDietary },
        trace: finalAttempt.trace,
        screenshot,
      }
    })

    await run('B.2/B.3a', 'Clarification loop fix — tap to pick catalogue', 'B', async () => {
      const attempt = async () => {
        await newChat(page)
        const { reply, trace } = await sendChat(page, 'Legg til en ny kategori som heter Dekkhotell')
        const clarifying = await isClarificationVisible(page)
        const options = clarifying ? await getClarificationOptionLabels(page) : []
        return { reply, trace, clarifying, options, reachedState: clarifying }
      }
      const { first, second } = await withRetryOnce(page, attempt)
      const finalAttempt = second ?? first
      let resolved = false
      if (finalAttempt.clarifying && finalAttempt.options.length) {
        await clickClarificationOption(page, finalAttempt.options[0])
        await page.waitForTimeout(2000)
        if (await isGateVisible(page)) await clickGateSeeDetails(page)
        resolved = (await page.locator('.assistant-panel__review').count()) > 0
        if (resolved) {
          await clickReviewConfirm(page)
          await page.waitForTimeout(1000)
          trackCreated('category', 'Dekkhotell', 'AutoDeler (tapped)')
        }
      }
      const screenshot = await shotFor(page, 'B.2-B.3a')
      return {
        status: finalAttempt.clarifying ? 'CAPTURED' : 'FAIL',
        notes: `Attempt 1 reachedState=${first.reachedState}.${second ? ` Attempt 2 reachedState=${second.reachedState}.` : ''} clarifying=${finalAttempt.clarifying} options=${JSON.stringify(finalAttempt.options)} resolved(tap)=${resolved}.`,
        evidence: { clarifying: finalAttempt.clarifying, options: finalAttempt.options, resolved },
        trace: finalAttempt.trace,
        screenshot,
      }
    })

    await run('B.2/B.3b', 'Clarification loop fix — typed chat answer', 'B', async () => {
      const attempt = async () => {
        await newChat(page)
        const { reply, trace } = await sendChat(page, 'Legg til en ny kategori som heter Sesonglager')
        const clarifying = await isClarificationVisible(page)
        const options = clarifying ? await getClarificationOptionLabels(page) : []
        return { reply, trace, clarifying, options, reachedState: clarifying }
      }
      const { first, second } = await withRetryOnce(page, attempt)
      const finalAttempt = second ?? first
      let typedReply = ''
      let resolved = false
      if (finalAttempt.clarifying && finalAttempt.options.length) {
        const target = finalAttempt.options.find((o) => /AutoDeler/i.test(o)) ?? finalAttempt.options[0]
        const typed = await sendChat(page, target)
        typedReply = typed.reply
        await page.waitForTimeout(1000)
        if (await isGateVisible(page)) await clickGateSeeDetails(page)
        resolved = (await page.locator('.assistant-panel__review').count()) > 0
        if (resolved) {
          await clickReviewConfirm(page)
          await page.waitForTimeout(1000)
          trackCreated('category', 'Sesonglager', 'AutoDeler (typed)')
        }
      }
      const screenshot = await shotFor(page, 'B.2-B.3b')
      return {
        status: finalAttempt.clarifying ? 'CAPTURED' : 'FAIL',
        notes: `Attempt 1 reachedState=${first.reachedState}.${second ? ` Attempt 2 reachedState=${second.reachedState}.` : ''} clarifying=${finalAttempt.clarifying} options=${JSON.stringify(finalAttempt.options)}. Typed answer reply: "${typedReply}". resolved=${resolved}.`,
        evidence: { clarifying: finalAttempt.clarifying, options: finalAttempt.options, typedReply, resolved },
        trace: finalAttempt.trace,
        screenshot,
      }
    })

    await run('B.4', 'Unclear chat answer to clarification', 'B', async () => {
      const attempt = async () => {
        await newChat(page)
        const { reply, trace } = await sendChat(page, 'Legg til en ny kategori som heter Vinterlager')
        const clarifying = await isClarificationVisible(page)
        const options = clarifying ? await getClarificationOptionLabels(page) : []
        return { reply, trace, clarifying, options, reachedState: clarifying }
      }
      const { first, second } = await withRetryOnce(page, attempt)
      const finalAttempt = second ?? first
      let unclearReply = ''
      let stillClarifying = false
      let falselyResolved = false
      if (finalAttempt.clarifying) {
        const typed = await sendChat(page, 'kanskje dekkhotell eller sesonglager')
        unclearReply = typed.reply
        stillClarifying = await isClarificationVisible(page)
        falselyResolved = (await isGateVisible(page)) || (await isSingleReviewVisible(page))
        if (falselyResolved) {
          if (await isGateVisible(page)) await clickGateSeeDetails(page)
          if (await page.locator('.assistant-panel__review').count()) await clickReviewCancel(page).catch(() => {})
        } else if (stillClarifying && finalAttempt.options.length) {
          await clickClarificationOption(page, finalAttempt.options[0])
          await page.waitForTimeout(1000)
          if (await isGateVisible(page)) await clickGateSeeDetails(page)
          if (await page.locator('.assistant-panel__review').count()) await clickReviewCancel(page).catch(() => {})
        }
      }
      const screenshot = await shotFor(page, 'B.4')
      return {
        status: finalAttempt.clarifying ? (falselyResolved ? 'FAIL' : 'CAPTURED') : 'N/A',
        notes: `Attempt 1 reachedState=${first.reachedState}.${second ? ` Attempt 2 reachedState=${second.reachedState}.` : ''} clarifying=${finalAttempt.clarifying}. Unclear answer reply: "${unclearReply}". stillClarifying=${stillClarifying} falselyResolved=${falselyResolved} (must not falsely resolve).`,
        evidence: { clarifying: finalAttempt.clarifying, unclearReply, stillClarifying, falselyResolved },
        trace: finalAttempt.trace,
        screenshot,
      }
    })

    await run('B.5a', 'Draft-quality gate — Se detaljer', 'B', async () => {
      const attempt = async () => {
        await newChat(page)
        const { reply, trace } = await sendChat(page, 'Legg til et nytt dekk som heter Gate Test Dekk A, ca 500 kr')
        const gate = await isGateVisible(page)
        return { reply, trace, gate, reachedState: gate }
      }
      const { first, second } = await withRetryOnce(page, attempt)
      const finalAttempt = second ?? first
      let reviewShown = false
      if (finalAttempt.gate) {
        await clickGateSeeDetails(page)
        await page.waitForTimeout(500)
        reviewShown = await isSingleReviewVisible(page)
        await clickReviewCancel(page).catch(() => {})
      }
      const screenshot = await shotFor(page, 'B.5a')
      return {
        status: finalAttempt.gate && reviewShown ? 'CAPTURED' : 'FAIL',
        notes: `Attempt 1 reachedState=${first.reachedState}.${second ? ` Attempt 2 reachedState=${second.reachedState}.` : ''} gate=${finalAttempt.gate}. After "Se detaljer", normal review form shown=${reviewShown}.`,
        evidence: { gate: finalAttempt.gate, reviewShown },
        trace: finalAttempt.trace,
        screenshot,
      }
    })

    await run('B.5b', 'Draft-quality gate — Prøv igjen (composer restore)', 'B', async () => {
      const msg = 'Legg til et nytt dekk som heter Gate Test Dekk B, ca 500 kr'
      const attempt = async () => {
        await newChat(page)
        const { reply, trace } = await sendChat(page, msg)
        const gate = await isGateVisible(page)
        return { reply, trace, gate, reachedState: gate }
      }
      const { first, second } = await withRetryOnce(page, attempt)
      const finalAttempt = second ?? first
      if (finalAttempt.gate) await clickGateTryAgain(page)
      await page.waitForTimeout(500)
      const restoredText = await composerText(page)
      const focused = await isComposerFocused(page)
      const gateGone = !(await isGateVisible(page))
      const screenshot = await shotFor(page, 'B.5b')
      const composer = page.getByPlaceholder('Be assistenten opprette, oppdatere eller slette noe …')
      await composer.fill('').catch(() => {})
      return {
        status: finalAttempt.gate && restoredText === msg && focused && gateGone ? 'PASS' : 'CAPTURED',
        notes: `Attempt 1 reachedState=${first.reachedState}.${second ? ` Attempt 2 reachedState=${second.reachedState}.` : ''} gate=${finalAttempt.gate}. After "Prøv igjen": composer="${restoredText}" (expect exact match to "${msg}"), focused=${focused}, gate dismissed=${gateGone}.`,
        evidence: { gate: finalAttempt.gate, restoredText, expectedText: msg, focused, gateGone },
        trace: finalAttempt.trace,
        screenshot,
      }
    })

    await run('B.5c', 'Draft-quality gate — Avbryt (discard)', 'B', async () => {
      const attempt = async () => {
        await newChat(page)
        const { reply, trace } = await sendChat(page, 'Legg til et nytt dekk som heter Gate Test Dekk C, ca 500 kr')
        const gate = await isGateVisible(page)
        return { reply, trace, gate, reachedState: gate }
      }
      const { first, second } = await withRetryOnce(page, attempt)
      const finalAttempt = second ?? first
      if (finalAttempt.gate) await clickGateCancel(page)
      await page.waitForTimeout(500)
      const composerAfter = await composerText(page)
      const gateGone = !(await isGateVisible(page))
      const screenshot = await shotFor(page, 'B.5c')
      return {
        status: finalAttempt.gate && composerAfter === '' && gateGone ? 'PASS' : 'CAPTURED',
        notes: `Attempt 1 reachedState=${first.reachedState}.${second ? ` Attempt 2 reachedState=${second.reachedState}.` : ''} gate=${finalAttempt.gate}. After "Avbryt": composer="${composerAfter}" (expect empty), gate dismissed=${gateGone}.`,
        evidence: { gate: finalAttempt.gate, composerAfter, gateGone },
        trace: finalAttempt.trace,
        screenshot,
      }
    })

    await run('B.6 (Confirm path)', 'Confirm a staged draft through the gate', 'B', async () => {
      const attempt = async () => {
        await newChat(page)
        const { reply, trace } = await sendChat(page, 'Legg til et nytt dekk som heter Gate Confirm Dekk, ca 500 kr')
        if (await isGateVisible(page)) await clickGateSeeDetails(page)
        const reachedState = (await page.locator('.assistant-panel__review').count()) > 0
        return { reply, trace, reachedState }
      }
      const { first, second } = await withRetryOnce(page, attempt)
      const finalAttempt = second ?? first
      let confirmOk = false
      if (finalAttempt.reachedState) {
        await clickReviewConfirm(page)
        await page.waitForTimeout(1000)
        confirmOk = true
        trackCreated('product', 'Gate Confirm Dekk', 'Dekk')
      }
      const screenshot = await shotFor(page, 'B.6-confirm')
      return {
        status: confirmOk ? 'PASS' : 'FAIL',
        notes: `Attempt 1 reachedState=${first.reachedState}.${second ? ` Attempt 2 reachedState=${second.reachedState}.` : ''} confirmOk=${confirmOk}.`,
        evidence: { confirmOk },
        trace: finalAttempt.trace,
        screenshot,
      }
    })

    await run('B.6 (Edit path)', 'Edit a staged draft through the gate', 'B', async () => {
      const attempt = async () => {
        await newChat(page)
        const { reply, trace } = await sendChat(page, 'Legg til et nytt dekk som heter Gate Edit Dekk, ca 500 kr')
        if (await isGateVisible(page)) await clickGateSeeDetails(page)
        const reachedState = (await page.locator('.assistant-panel__review').count()) > 0
        return { reply, trace, reachedState }
      }
      const { first, second } = await withRetryOnce(page, attempt)
      const finalAttempt = second ?? first
      let editFormOpened = false
      if (finalAttempt.reachedState) {
        await clickReviewEdit(page)
        await page.waitForTimeout(500)
        editFormOpened = (await page.locator('#product-name').count()) > 0
        if (editFormOpened) {
          await page.getByRole('button', { name: 'Lagre', exact: true }).click()
          await page.waitForTimeout(1000)
          trackCreated('product', 'Gate Edit Dekk', 'Dekk')
        }
      }
      const screenshot = await shotFor(page, 'B.6-edit')
      return {
        status: editFormOpened ? 'PASS' : 'FAIL',
        notes: `Attempt 1 reachedState=${first.reachedState}.${second ? ` Attempt 2 reachedState=${second.reachedState}.` : ''} editFormOpened=${editFormOpened}.`,
        evidence: { editFormOpened },
        trace: finalAttempt.trace,
        screenshot,
      }
    })

    await run('B.7', 'Price/discount display fix (invalid discount stripped)', 'B', async () => {
      await newChat(page)
      const { reply, trace } = await sendChat(page, 'Legg til et bremsesett som heter Brembo Sportbrems for 2400 kr med 20% rabatt')
      if (await isGateVisible(page)) await clickGateSeeDetails(page)
      const reviewText = await singleReviewText(page)
      const screenshot = await shotFor(page, 'B.7')
      let confirmed = false
      if (await page.locator('.assistant-panel__review').count()) {
        await clickReviewConfirm(page)
        await page.waitForTimeout(1000)
        confirmed = true
        trackCreated('product', 'Brembo Sportbrems', 'Bremser')
      }
      return {
        status: 'CAPTURED',
        notes: `Reply: "${reply}". Review text discount line: "${reviewText.match(/Rabatt[^\n]*/i)?.[0] ?? '(not found)'}" — must show unset ("Fill this in"), never a fabricated percentage. confirmed=${confirmed}.`,
        evidence: { reply, reviewText },
        trace,
        screenshot,
      }
    })

    await run('B.8', 'Category custom-field fabrication check', 'B', async () => {
      await newChat(page)
      const { reply, trace } = await sendChat(page, 'Legg til en ny kategori som heter Verktøy')
      if (await isGateVisible(page)) await clickGateSeeDetails(page)
      const reviewText = await singleReviewText(page)
      const screenshot = await shotFor(page, 'B.8')
      let confirmed = false
      if (await page.locator('.assistant-panel__review').count()) {
        await clickReviewConfirm(page)
        await page.waitForTimeout(1000)
        confirmed = true
        trackCreated('category', 'Verktøy', 'AutoDeler')
      }
      return {
        status: 'CAPTURED',
        notes: `Reply: "${reply}". Review text: "${reviewText.slice(0, 300)}" — must show no unrequested custom fields. confirmed=${confirmed}.`,
        evidence: { reply, reviewText },
        trace,
        screenshot,
      }
    })

    // B.9/B.10: data (not session) dependency on B.1's own "Continental Sommerdekk" — if B.1 never
    // actually confirmed it above, seed it directly here so update/delete can still be graded.
    await run('B.9', 'Update product price via chat', 'B', async () => {
      await openCatalogue(page, 'AutoDeler')
      // Must expand the category section before checking — a raw item-name count on a still-collapsed
      // section reads 0 even when the product is really there (documented in "Known harness state"),
      // which force-created a real duplicate "Continental Sommerdekk" in the qwen3:8b run of this exact
      // cycle before this fix was applied.
      const already = await productExistsInCategory(page, 'Dekk', 'Continental Sommerdekk').catch(() => false)
      if (!already) {
        await addProductToCategory(page, 'Dekk', { name: 'Continental Sommerdekk', priceMode: 'flat', price: 1200 })
      }
      await newChat(page)
      const { reply, trace } = await sendChat(page, 'Endre prisen på Continental Sommerdekk til 1350 kr')
      if (await isGateVisible(page)) await clickGateSeeDetails(page)
      const reviewText = await singleReviewText(page)
      const screenshot = await shotFor(page, 'B.9')
      let confirmed = false
      if (await page.locator('.assistant-panel__review').count()) {
        await clickReviewConfirm(page)
        await page.waitForTimeout(1000)
        confirmed = true
      }
      return {
        status: 'CAPTURED',
        notes: `Reply: "${reply}". Review text: "${reviewText.slice(0, 300)}" — price row should show real old→new values, not "Fill this in". confirmed=${confirmed}. (Target product seeded directly if B.1 hadn't already created it — see notes.)`,
        evidence: { reply, reviewText, seededDirectly: !already },
        trace,
        screenshot,
      }
    })

    await run('B.10', 'Delete product via chat', 'B', async () => {
      await newChat(page)
      const { reply, trace } = await sendChat(page, 'Slett dekket Continental Sommerdekk')
      const phrase = await getDestructiveConfirmPhrase(page)
      let deleted = false
      if (phrase) {
        await typeDestructiveConfirm(page, phrase)
        await clickDestructiveConfirm(page)
        await page.waitForTimeout(1000)
        deleted = true
      }
      const screenshot2 = await shotFor(page, 'B.10-after')
      return {
        status: phrase ? 'CAPTURED' : 'FAIL',
        notes: `Reply: "${reply}". Required confirm phrase read from UI: "${phrase}". deleted=${deleted}.`,
        evidence: { reply, phrase, deleted },
        trace,
        screenshot: screenshot2,
      }
    })

    await run('B.11a', 'Kebab override — posture Av (full), verify + two trace steps', 'B', async () => {
      await newChat(page)
      await openModelMenu(page)
      await page.locator('#assistant-ingestion-posture-select').selectOption('full')
      await closeModelMenu(page)
      const { reply, trace } = await sendChat(page, 'Legg til et nytt dekk som heter Full Posture Dekk, ca 500 kr')
      const gate = await isGateVisible(page)
      const reviewText = await singleReviewText(page)
      const hasAllergens = /Allergener/i.test(reviewText)
      const hasDietary = /Diettmerker|Kosthold-tagger/i.test(reviewText)
      const draftTagged = trace.some((t) => /\(draft\)/.test(t))
      const verifyTagged = trace.some((t) => /\(verify\)/.test(t))
      const screenshot = await shotFor(page, 'B.11a')
      if (await page.locator('.assistant-panel__review').count()) await clickReviewCancel(page).catch(() => {})
      return {
        status: 'CAPTURED',
        notes: `Reply: "${reply}". gate=${gate} (expect false under full posture). Allergener present=${hasAllergens} Diettmerker/Kosthold-tagger present=${hasDietary} (expect true). trace shows (draft)=${draftTagged} and (verify)=${verifyTagged} steps.`,
        evidence: { reply, gate, hasAllergens, hasDietary, draftTagged, verifyTagged },
        trace,
        screenshot,
      }
    })

    await run('B.11b', 'Kebab override — posture back to Automatisk, single untagged step', 'B', async () => {
      await newChat(page)
      await openModelMenu(page)
      await page.locator('#assistant-ingestion-posture-select').selectOption('auto')
      await closeModelMenu(page)
      const { reply, trace } = await sendChat(page, 'Legg til et nytt dekk som heter Auto Posture Dekk, ca 500 kr')
      const gate = await isGateVisible(page)
      const draftTagged = trace.some((t) => /\(draft\)/.test(t))
      const verifyTagged = trace.some((t) => /\(verify\)/.test(t))
      const screenshot = await shotFor(page, 'B.11b')
      if (gate) await clickGateSeeDetails(page)
      if (await page.locator('.assistant-panel__review').count()) await clickReviewCancel(page).catch(() => {})
      return {
        status: 'CAPTURED',
        notes: `Reply: "${reply}". gate=${gate} (expect true under safe/auto posture, confirming the toggle really reverted). trace (draft) tag=${draftTagged} (verify) tag=${verifyTagged}.`,
        evidence: { reply, gate, draftTagged, verifyTagged },
        trace,
        screenshot,
      }
    })

    await run('B.12', 'Manual product creation unaffected (no AI chrome)', 'B', async () => {
      await openCatalogue(page, 'AutoDeler')
      await addProductToCategory(page, 'Dekk', { name: 'Manuell Test Dekk', priceMode: 'flat', price: 599 })
      const section = await expandCategorySection(page, 'Dekk')
      const html = await section.innerHTML()
      const hasAiChrome = /assistant|ai-|thought-trace/i.test(html)
      const screenshot = await shotFor(page, 'B.12')
      return {
        status: hasAiChrome ? 'FAIL' : 'PASS',
        notes: `Manually created "Manuell Test Dekk" via ordinary "+ Legg til produkt" form. AI-related chrome detected=${hasAiChrome} (expect false).`,
        evidence: { hasAiChrome },
        screenshot,
      }
    })

    saveResults()
    console.log('=== SECTION B COMPLETE ===')

    // ================= SECTION C: batch ingestion =================

    await run('C.1a', 'Batch phrasing gap — natural non-imperative phrasing', 'C', async () => {
      await newChat(page)
      const { reply, trace } = await sendChat(page, 'Dekk til 1200 kr med sommer, vinter og pigg')
      const { batch } = await reachBatchReview(page)
      const screenshot = await shotFor(page, 'C.1a')
      return {
        status: 'CAPTURED',
        notes: `Reply: "${reply}". batchShown=${batch} — known gap: likely misclassified as lookup, not itself a Phase 1-3 regression.`,
        evidence: { reply, batch },
        trace,
        screenshot,
      }
    })

    await run('C.1b', 'Batch create — explicit imperative, dual pricing, no fabricated fields', 'C', async () => {
      const attempt = async () => {
        await newChat(page)
        const { reply, trace } = await sendChat(page, 'Legg til tre nye dekk til 1200/1300 kr: sommerdekk, vinterdekk og piggdekk', { timeoutMs: 240000 })
        const { batch, count } = await reachBatchReview(page)
        return { reply, trace, batch, count, reachedState: batch && count === 3 }
      }
      const { first, second } = await withRetryOnce(page, attempt)
      const finalAttempt = second ?? first
      const summaries = finalAttempt.batch ? await batchCardSummaryTexts(page) : []
      let confirmedNames: string[] = []
      if (finalAttempt.batch && finalAttempt.count > 0) {
        await clickConfirmAll(page)
        await page.waitForTimeout(1500)
        confirmedNames = summaries.map((s) => s.split('\n')[0])
        for (const name of confirmedNames) trackCreated('product', name, 'Dekk (batch C.1b)')
      }
      const screenshot = await shotFor(page, 'C.1b')
      return {
        status: finalAttempt.reachedState ? 'CAPTURED' : 'FAIL',
        notes: `Attempt 1 reachedState=${first.reachedState}.${second ? ` Attempt 2 reachedState=${second.reachedState}.` : ''} batch=${finalAttempt.batch} cardCount=${finalAttempt.count} (expect 3). Summaries: ${JSON.stringify(summaries)}. confirmedNames=${JSON.stringify(confirmedNames)}.`,
        evidence: { batch: finalAttempt.batch, count: finalAttempt.count, summaries },
        trace: finalAttempt.trace,
        screenshot,
      }
    })

    await run('C.2', 'Shared clarification across batch cards (fillFieldsBatch)', 'C', async () => {
      const attempt = async () => {
        await newChat(page)
        const { reply, trace } = await sendChat(page, 'Legg til to nye kategorier: Skinnhotell og Feltlager', { timeoutMs: 240000 })
        const clarifying = await isClarificationVisible(page)
        const options = clarifying ? await getClarificationOptionLabels(page) : []
        return { reply, trace, clarifying, options, reachedState: clarifying }
      }
      const { first, second } = await withRetryOnce(page, attempt)
      const finalAttempt = second ?? first
      let resolved = false
      let confirmedNames: string[] = []
      if (finalAttempt.clarifying && finalAttempt.options.length) {
        const target = finalAttempt.options.find((o) => /AutoDeler/i.test(o)) ?? finalAttempt.options[0]
        await clickClarificationOption(page, target)
        await page.waitForTimeout(2000)
        const { batch } = await reachBatchReview(page)
        resolved = batch || (await isSingleReviewVisible(page))
        if (batch) {
          const summaries = await batchCardSummaryTexts(page)
          await clickConfirmAll(page)
          await page.waitForTimeout(1500)
          confirmedNames = summaries.map((s) => s.split('\n')[0])
          for (const name of confirmedNames) trackCreated('category', name, 'AutoDeler (batch C.2)')
        }
      }
      const screenshot = await shotFor(page, 'C.2')
      return {
        status: finalAttempt.clarifying ? (resolved ? 'CAPTURED' : 'FAIL') : 'PARTIAL',
        notes: `Attempt 1 reachedState=${first.reachedState}.${second ? ` Attempt 2 reachedState=${second.reachedState}.` : ''} clarifying=${finalAttempt.clarifying} options=${JSON.stringify(finalAttempt.options)} resolved=${resolved} confirmedNames=${JSON.stringify(confirmedNames)} — note whether options offered are catalogues (expected) or a store-wide category list.`,
        evidence: { clarifying: finalAttempt.clarifying, options: finalAttempt.options, resolved },
        trace: finalAttempt.trace,
        screenshot,
      }
    })

    await run('C.3', 'Per-card actions (confirm/edit/remove independence)', 'C', async () => {
      const attempt = async () => {
        await newChat(page)
        const { reply, trace } = await sendChat(page, 'Legg til tre nye batterier: Card Test A for 500 kr, Card Test B for 600 kr, Card Test C for 700 kr', {
          timeoutMs: 240000,
        })
        const { batch, count } = await reachBatchReview(page)
        return { reply, trace, batch, count, reachedState: batch && count >= 3 }
      }
      const { first, second } = await withRetryOnce(page, attempt)
      const finalAttempt = second ?? first
      let confirmOk = false
      let editOk = false
      let removeOk = false
      if (finalAttempt.reachedState) {
        await batchCardAction(page, 0, 'confirm')
        await page.waitForTimeout(1000)
        confirmOk = true
        trackCreated('product', 'Card Test A', 'Batterier (batch C.3)')
        await batchCardAction(page, 0, 'edit')
        await page.waitForTimeout(500)
        editOk = (await page.locator('#product-name').count()) > 0
        if (editOk) {
          await page.getByRole('button', { name: 'Lagre', exact: true }).click()
          await page.waitForTimeout(1000)
          trackCreated('product', 'Card Test B', 'Batterier (batch C.3)')
        }
        const remainingBefore = await batchCardCount(page)
        await batchCardAction(page, 0, 'remove')
        await page.waitForTimeout(500)
        const remainingAfter = await batchCardCount(page)
        removeOk = remainingAfter < remainingBefore
      }
      const screenshot = await shotFor(page, 'C.3')
      return {
        status: confirmOk && editOk && removeOk ? 'PASS' : finalAttempt.reachedState ? 'PARTIAL' : 'FAIL',
        notes: `Attempt 1 reachedState=${first.reachedState}.${second ? ` Attempt 2 reachedState=${second.reachedState}.` : ''} batch=${finalAttempt.batch} count=${finalAttempt.count}. confirmOk=${confirmOk} editOk=${editOk} removeOk=${removeOk}.`,
        evidence: { batch: finalAttempt.batch, count: finalAttempt.count, confirmOk, editOk, removeOk },
        trace: finalAttempt.trace,
        screenshot,
      }
    })

    await run('C.4', 'Invalid discount blocks Confirm all only', 'C', async () => {
      const attempt = async () => {
        await newChat(page)
        const { reply, trace } = await sendChat(page, 'Legg til to nye batterier: Bosch 60Ah for 900 kr, og Varta 70Ah for 1100 kr med 150% rabatt', {
          timeoutMs: 240000,
        })
        const { batch } = await reachBatchReview(page)
        return { reply, trace, batch, reachedState: batch }
      }
      const { first, second } = await withRetryOnce(page, attempt)
      const finalAttempt = second ?? first
      const { disabled, hint } = finalAttempt.batch ? await confirmAllDisabledInfo(page) : { disabled: false, hint: null }
      const summaries = finalAttempt.batch ? await batchCardSummaryTexts(page) : []
      const boschHasDiscount = summaries.some((s) => /Bosch/i.test(s) && /%/.test(s))
      const screenshot = await shotFor(page, 'C.4')
      if (finalAttempt.batch) {
        const boschIdx = summaries.findIndex((s) => /Bosch/i.test(s))
        if (boschIdx >= 0) {
          await batchCardAction(page, boschIdx, 'confirm')
          await page.waitForTimeout(1000)
          trackCreated('product', 'Bosch 60Ah', 'Batterier (batch C.4)')
        }
        const remaining = await batchCardCount(page)
        if (remaining > 0) await batchCardAction(page, 0, 'remove').catch(() => {})
      }
      return {
        status: finalAttempt.batch && disabled ? 'CAPTURED' : 'FAIL',
        notes: `Attempt 1 reachedState=${first.reachedState}.${second ? ` Attempt 2 reachedState=${second.reachedState}.` : ''} batch=${finalAttempt.batch}. Confirm all disabled=${disabled} hint="${hint}". Bosch card shows fabricated discount=${boschHasDiscount} (must be false). Summaries: ${JSON.stringify(summaries)}.`,
        evidence: { batch: finalAttempt.batch, disabled, hint, boschHasDiscount, summaries },
        trace: finalAttempt.trace,
        screenshot,
      }
    })

    await run('C.5', 'Confirm all on a clean batch', 'C', async () => {
      const attempt = async () => {
        await newChat(page)
        const { reply, trace } = await sendChat(page, 'Legg til to nye lydanlegg: Pioneer Høyttaler for 800 kr og Sony Forsterker for 950 kr', {
          timeoutMs: 240000,
        })
        const { batch } = await reachBatchReview(page)
        return { reply, trace, batch, reachedState: batch }
      }
      const { first, second } = await withRetryOnce(page, attempt)
      const finalAttempt = second ?? first
      const summaries = finalAttempt.batch ? await batchCardSummaryTexts(page) : []
      let confirmed = false
      if (finalAttempt.batch) {
        await clickConfirmAll(page)
        await page.waitForTimeout(1500)
        confirmed = true
        for (const s of summaries) trackCreated('product', s.split('\n')[0], 'Lydanlegg (batch C.5)')
      }
      const screenshot = await shotFor(page, 'C.5')
      return {
        status: finalAttempt.batch && confirmed ? 'CAPTURED' : 'FAIL',
        notes: `Attempt 1 reachedState=${first.reachedState}.${second ? ` Attempt 2 reachedState=${second.reachedState}.` : ''} batch=${finalAttempt.batch} summaries=${JSON.stringify(summaries)} confirmed=${confirmed}.`,
        evidence: { batch: finalAttempt.batch, summaries },
        trace: finalAttempt.trace,
        screenshot,
      }
    })

    await run('C.6', 'Cancel all — nothing created', 'C', async () => {
      const attempt = async () => {
        await newChat(page)
        const { reply, trace } = await sendChat(
          page,
          'Legg til tre nye interiørprodukter: Cancel Test A for 100 kr, Cancel Test B for 120 kr, Cancel Test C for 140 kr',
          { timeoutMs: 240000 },
        )
        const { batch } = await reachBatchReview(page)
        return { reply, trace, batch, reachedState: batch }
      }
      const { first, second } = await withRetryOnce(page, attempt)
      const finalAttempt = second ?? first
      let cancelled = false
      if (finalAttempt.batch) {
        await clickCancelAll(page)
        await page.waitForTimeout(500)
        cancelled = !(await isBatchReviewVisible(page))
      }
      const screenshot = await shotFor(page, 'C.6')
      return {
        status: finalAttempt.batch ? (cancelled ? 'PASS' : 'CAPTURED') : 'PASS',
        notes: `Attempt 1 reachedState=${first.reachedState}.${second ? ` Attempt 2 reachedState=${second.reachedState}.` : ''} batch=${finalAttempt.batch} cancelledSuccessfully=${cancelled}. No products should exist either way.`,
        evidence: { batch: finalAttempt.batch, cancelled },
        trace: finalAttempt.trace,
        screenshot,
      }
    })

    await run('C.7', 'Cross-record contamination check (events batch)', 'C', async () => {
      const attempt = async () => {
        await newChat(page)
        const { reply, trace } = await sendChat(
          page,
          'Legg til to nye arrangementer: Sommertreff 10.06.2026 kl 12-16 adresse Torget 1, og Vintertreff 15.12.2026 kl 12-16 adresse Torget 2',
          { timeoutMs: 240000 },
        )
        const { batch } = await reachBatchReview(page)
        return { reply, trace, batch, reachedState: batch }
      }
      const { first, second } = await withRetryOnce(page, attempt)
      const finalAttempt = second ?? first
      const summaries = finalAttempt.batch ? await batchCardSummaryTexts(page) : []
      const screenshot = await shotFor(page, 'C.7')
      let confirmed = false
      if (finalAttempt.batch) {
        await clickConfirmAll(page)
        await page.waitForTimeout(1500)
        confirmed = true
        trackCreated('event', 'Sommertreff', 'batch C.7')
        trackCreated('event', 'Vintertreff', 'batch C.7')
      }
      return {
        status: finalAttempt.reachedState ? 'CAPTURED' : 'N/A',
        notes: `Attempt 1 reachedState=${first.reachedState}.${second ? ` Attempt 2 reachedState=${second.reachedState}.` : ''} batch=${finalAttempt.batch} summaries=${JSON.stringify(summaries)} — check each card's own date/address/category stayed isolated (no bleed) via screenshot. confirmed=${confirmed}.`,
        evidence: { batch: finalAttempt.batch, summaries },
        trace: finalAttempt.trace,
        screenshot,
      }
    })

    await run('C.8', 'No false batch UI for single-record message', 'C', async () => {
      await newChat(page)
      const { reply, trace } = await sendChat(page, 'Legg til et nytt dekk som heter Test Solo Dekk for 999 kr')
      const batch = await isBatchReviewVisible(page)
      const gate = await isGateVisible(page)
      const screenshot = await shotFor(page, 'C.8')
      if (gate) await clickGateSeeDetails(page)
      if (await page.locator('.assistant-panel__review').count()) await clickReviewCancel(page).catch(() => {})
      return {
        status: !batch ? 'PASS' : 'FAIL',
        notes: `Reply: "${reply}". batchShown=${batch} (must be false). gate=${gate}.`,
        evidence: { reply, batch, gate },
        trace,
        screenshot,
      }
    })

    await run('C.9a', 'Draft-quality gate, batch (3 records)', 'C', async () => {
      const attempt = async () => {
        await newChat(page)
        const { reply, trace } = await sendChat(page, 'Legg til tre nye motoroljer: Gate Batch A, Gate Batch B og Gate Batch C, alle for 150 kr', {
          timeoutMs: 240000,
        })
        const gate = await isGateVisible(page)
        return { reply, trace, gate, reachedState: gate }
      }
      const { first, second } = await withRetryOnce(page, attempt)
      const finalAttempt = second ?? first
      const gateText = finalAttempt.gate ? await gateFieldCountText(page) : ''
      const screenshot = await shotFor(page, 'C.9a')
      if (finalAttempt.gate) await clickGateCancel(page)
      else if (await isBatchReviewVisible(page)) await clickCancelAll(page).catch(() => {})
      return {
        status: finalAttempt.gate ? 'CAPTURED' : 'N/A',
        notes: `Attempt 1 reachedState=${first.reachedState}.${second ? ` Attempt 2 reachedState=${second.reachedState}.` : ''} gate=${finalAttempt.gate}. Gate text: "${gateText}" — expect 3 per-record summary lines.`,
        evidence: { gate: finalAttempt.gate, gateText },
        trace: finalAttempt.trace,
        screenshot,
      }
    })

    await run('C.9b', 'Draft-quality gate, batch overflow (6+ records)', 'C', async () => {
      const attempt = async () => {
        await newChat(page)
        const { reply, trace } = await sendChat(
          page,
          'Legg til seks nye dekk: Dekk Seks A for 100 kr, Dekk Seks B for 110 kr, Dekk Seks C for 120 kr, Dekk Seks D for 130 kr, Dekk Seks E for 140 kr, Dekk Seks F for 150 kr',
          { timeoutMs: 300000 },
        )
        const gate = await isGateVisible(page)
        return { reply, trace, gate, reachedState: gate }
      }
      const { first, second } = await withRetryOnce(page, attempt)
      const finalAttempt = second ?? first
      const gateText = finalAttempt.gate ? await gateFieldCountText(page) : ''
      const overflowLine = gateText.match(/…og \d+ til/i)?.[0] ?? null
      const screenshot = await shotFor(page, 'C.9b')
      if (finalAttempt.gate) await clickGateCancel(page)
      else if (await isBatchReviewVisible(page)) await clickCancelAll(page).catch(() => {})
      return {
        status: finalAttempt.gate && overflowLine ? 'PASS' : finalAttempt.gate ? 'PARTIAL' : 'N/A',
        notes: `Attempt 1 reachedState=${first.reachedState}.${second ? ` Attempt 2 reachedState=${second.reachedState}.` : ''} gate=${finalAttempt.gate}. Gate text: "${gateText}". Overflow line found: "${overflowLine}" (expect up to 5 lines + "…og N til"). No C.8 leftover-draft contamination expected — fresh session.`,
        evidence: { gate: finalAttempt.gate, gateText, overflowLine },
        trace: finalAttempt.trace,
        screenshot,
      }
    })

    saveResults()
    console.log('=== SECTION C COMPLETE ===')

    // ================= SECTION K: deterministic post-checks =================
    // See QA/templates/project/qa-test-plan-project.md's own Section K for the full design rationale
    // behind each row. Runs after C so K.5/K.8 have real multi-candidate inventory (Batterier/
    // Lydanlegg) left over from C.3/C.4/C.5's own not-yet-cleaned-up creations to probe against.

    await run('K.1', 'filter-field-exists adversarial trigger', 'K', async () => {
      const r = await withCheckRetryOnce(page, 'filter-field-exists', async () => {
        await newChat(page)
        return sendChat(page, 'Hvilke produkter er discounted?')
      })
      const screenshot = await shotFor(page, 'K.1')
      return {
        status: 'CAPTURED',
        notes: `Reply: "${r.reply}". retried=${r.retried}. filter-field-exists verdicts: ${JSON.stringify(r.verdicts)} (expect reject-retry firing if a fabricated field name like "discounted" was proposed instead of the real hasDiscount; ok:true/absent means the model never proposed a bad field name this attempt).`,
        evidence: { reply: r.reply, verdicts: r.verdicts, retried: r.retried },
        trace: r.trace,
        screenshot,
      }
    })

    await run('K.2', 'filter-not-brand-name adversarial trigger', 'K', async () => {
      const r = await withCheckRetryOnce(page, 'filter-not-brand-name', async () => {
        await newChat(page)
        return sendChat(page, 'Har Wraps & Coffee dekk på lager?')
      })
      const screenshot = await shotFor(page, 'K.2')
      return {
        status: 'CAPTURED',
        notes: `Reply: "${r.reply}". retried=${r.retried}. filter-not-brand-name verdicts: ${JSON.stringify(r.verdicts)}.`,
        evidence: { reply: r.reply, verdicts: r.verdicts, retried: r.retried },
        trace: r.trace,
        screenshot,
      }
    })

    await run('K.3', 'filter-op-shape-mismatch adversarial trigger', 'K', async () => {
      const r = await withCheckRetryOnce(page, 'filter-op-shape-mismatch', async () => {
        await newChat(page)
        return sendChat(page, "Hvilke produkter har 'sport' i navnet?")
      })
      const screenshot = await shotFor(page, 'K.3')
      return {
        status: 'CAPTURED',
        notes: `Reply: "${r.reply}". retried=${r.retried}. filter-op-shape-mismatch verdicts: ${JSON.stringify(r.verdicts)} (A.9a/A.9b's own passing traces are the "doesn't false-positive" half of this check's coverage).`,
        evidence: { reply: r.reply, verdicts: r.verdicts, retried: r.retried },
        trace: r.trace,
        screenshot,
      }
    })

    await run('K.4', 'no-fabricated-selection adversarial trigger', 'K', async () => {
      const r = await withCheckRetryOnce(page, 'no-fabricated-selection', async () => {
        await newChat(page)
        return sendChat(page, 'Oppdater prisen på Michelin Vinterdek til 1300 kr')
      })
      await dismissWhateverIsOpen(page)
      const screenshot = await shotFor(page, 'K.4')
      return {
        status: 'CAPTURED',
        notes: `Reply: "${r.reply}". retried=${r.retried}. no-fabricated-selection verdicts: ${JSON.stringify(r.verdicts)}. This check's own doc comment expects a near-zero fire rate (the schema enum already blocks it structurally) — absent/ok:true is the realistic, expected outcome, not proof the row failed to probe anything. No real write attempted — nothing to clean up regardless of outcome.`,
        evidence: { reply: r.reply, verdicts: r.verdicts, retried: r.retried },
        trace: r.trace,
        screenshot,
      }
    })

    await run('K.5', 'real-ambiguity-forces-clarify adversarial trigger', 'K', async () => {
      const r = await withCheckRetryOnce(page, 'real-ambiguity-forces-clarify', async () => {
        await newChat(page)
        return sendChat(page, 'Oppdater prisen på et Batterier-produkt til 500 kr')
      })
      await dismissWhateverIsOpen(page)
      const screenshot = await shotFor(page, 'K.5')
      return {
        status: 'CAPTURED',
        notes: `Reply: "${r.reply}". retried=${r.retried}. real-ambiguity-forces-clarify verdicts: ${JSON.stringify(r.verdicts)} (expect reject-clarify naming real Batterier candidates, since the message names no specific product). No real write attempted.`,
        evidence: { reply: r.reply, verdicts: r.verdicts, retried: r.retried },
        trace: r.trace,
        screenshot,
      }
    })

    await run('K.6', 'entity-action-consistency adversarial trigger', 'K', async () => {
      const r = await withCheckRetryOnce(page, 'entity-action-consistency', async () => {
        await newChat(page)
        return sendChat(page, 'Hvilke nye dekk kan vi legge til i sortimentet?')
      })
      await dismissWhateverIsOpen(page)
      const screenshot = await shotFor(page, 'K.6')
      return {
        status: 'CAPTURED',
        notes: `Reply: "${r.reply}". retried=${r.retried}. entity-action-consistency verdicts: ${JSON.stringify(r.verdicts)} (expect reject-retry if the first attempt classified this "hvilke"-phrased lookup question as a create command). Any staged draft/gate was cancelled, not confirmed — no real write.`,
        evidence: { reply: r.reply, verdicts: r.verdicts, retried: r.retried },
        trace: r.trace,
        screenshot,
      }
    })

    await run('K.7', 'entity-searchtext-consistency adversarial trigger', 'K', async () => {
      const r = await withCheckRetryOnce(page, 'entity-searchtext-consistency', async () => {
        await newChat(page)
        return sendChat(page, 'Fortell meg om produktet Continental Sommerdekk')
      })
      const screenshot = await shotFor(page, 'K.7')
      return {
        status: 'CAPTURED',
        notes: `Reply: "${r.reply}". retried=${r.retried}. entity-searchtext-consistency verdicts: ${JSON.stringify(r.verdicts)} (this depends on the local cascade's own probabilistic failure mode — on Claude this check may legitimately never fire at all, since selectIntentSinglePass doesn't share the local cascade's own searchText/lookupEntities-desync bug; note that explicitly rather than treating absence as a failure on the Claude run).`,
        evidence: { reply: r.reply, verdicts: r.verdicts, retried: r.retried },
        trace: r.trace,
        screenshot,
      }
    })

    await run('K.8', 'pronoun-not-searchtext adversarial trigger (shared 2-turn session)', 'K', async () => {
      await newChat(page)
      const q1 = await sendChat(page, 'Hvor mange produkter har vi i Lydanlegg-kategorien?')
      const q2 = await sendChat(page, 'Hva koster den billigste?')
      const verdicts = extractChecks([...q1.trace, ...q2.trace], 'pronoun-not-searchtext')
      const screenshot = await shotFor(page, 'K.8')
      return {
        status: 'CAPTURED',
        notes: `Q1 reply: "${q1.reply}". Q2 ("den billigste") reply: "${q2.reply}". pronoun-not-searchtext verdicts: ${JSON.stringify(verdicts)} — Q2's own final reply must name a real Lydanlegg product, not a hallucinated one, regardless of whether the check itself had to intervene.`,
        evidence: { q1: q1.reply, q2: q2.reply, verdicts },
        trace: [...q1.trace, ...q2.trace],
        screenshot,
      }
    })

    await run('K.9', 'no-hallucinated-values-in-safe-mode — code review only, not chat-triggerable', 'K', async () => {
      return {
        status: 'N/A',
        notes: `Not adversarially triggerable via a live chat message under current code — under 'safe' posture, any AssistantEntity.confabulationRiskFields value is stripped from the schema before the model is ever called, so no message can make it reappear. This row is a code-review checkpoint, not a live scenario: confirm no entity's own mergeDraft reintroduces a confabulationRiskFields value post-fill. If this check is ever observed firing live in another scenario's own trace during this run, flag that as a high-severity finding here.`,
      }
    })

    await run('K.10', 'input-mentioned-values-only adversarial trigger', 'K', async () => {
      const r = await withCheckRetryOnce(page, 'input-mentioned-values-only', async () => {
        await newChat(page)
        return sendChat(page, 'Legg til en ny salat som heter Vegetar-bowl, vegansk, 129 kr')
      })
      if (await isGateVisible(page)) await clickGateSeeDetails(page)
      const reviewText = await singleReviewText(page)
      const screenshot = await shotFor(page, 'K.10')
      let confirmed = false
      if (await page.locator('.assistant-panel__review').count()) {
        await clickReviewConfirm(page)
        await page.waitForTimeout(1000)
        confirmed = true
        trackCreated('product', 'Vegetar-bowl', 'K.10 — catalogue/category placement uncertain, check both AutoDeler and Matmeny at cleanup')
      }
      return {
        status: 'CAPTURED',
        notes: `Reply: "${r.reply}". retried=${r.retried}. input-mentioned-values-only verdicts: ${JSON.stringify(r.verdicts)} (expect auto-fix if dietaryTags came back with anything beyond "vegan" — e.g. the model also adding "vegetarian" unprompted). Review text dietary line: "${reviewText.match(/(Kosthold-tagger|Diettmerker)[^\n]*/i)?.[0] ?? '(not found)'}". confirmed=${confirmed}.`,
        evidence: { reply: r.reply, verdicts: r.verdicts, retried: r.retried, reviewText },
        trace: r.trace,
        screenshot,
      }
    })

    await run('K.11', 'dual-price-both-fields adversarial trigger', 'K', async () => {
      const r = await withCheckRetryOnce(page, 'dual-price-both-fields', async () => {
        await newChat(page)
        return sendChat(page, 'Iskaffe koster 45 kr, men er dyrere om du sitter og drikker den her')
      })
      if (await isGateVisible(page)) await clickGateSeeDetails(page)
      const reviewText = await singleReviewText(page)
      const screenshot = await shotFor(page, 'K.11')
      let confirmed = false
      if (await page.locator('.assistant-panel__review').count()) {
        // Diagnostic only — cancel rather than confirm regardless of outcome, since a
        // still-incomplete dual-price draft (exactly the failure this row probes for) shouldn't be
        // written as real data even if the app would technically accept it.
        await clickReviewCancel(page).catch(() => {})
      }
      return {
        status: 'CAPTURED',
        notes: `Reply: "${r.reply}". retried=${r.retried}. dual-price-both-fields verdicts: ${JSON.stringify(r.verdicts)} (expect reject-retry if priceMode was "dual" with only one of takeawayPrice/eatInPrice filled on the first attempt). Review price rows: "${reviewText.match(/Pris[^\n]*/gi)?.join(' | ') ?? '(not found)'}". Draft cancelled either way — no real write attempted.`,
        evidence: { reply: r.reply, verdicts: r.verdicts, retried: r.retried, reviewText, confirmed },
        trace: r.trace,
        screenshot,
      }
    })

    await run('K.12a', 'catalogueId-context-consistency — true-positive case (shared 2-turn session)', 'K', async () => {
      await newChat(page)
      const q1 = await sendChat(page, 'Hvor mange produkter har vi i AutoDeler?')
      const q2 = await sendChat(page, 'Legg til en ny kategori som heter Sommerdekklager')
      const verdicts = extractChecks([...q1.trace, ...q2.trace], 'catalogueId-context-consistency')
      const clarifying = await isClarificationVisible(page)
      await dismissWhateverIsOpen(page)
      const screenshot = await shotFor(page, 'K.12a')
      return {
        status: 'CAPTURED',
        notes: `Q1 (sets AutoDeler dialog focus) reply: "${q1.reply}". Q2 (no catalogue named) reply: "${q2.reply}". catalogueId-context-consistency verdicts: ${JSON.stringify(verdicts)}. clarifying=${clarifying}. Expect either: (a) catalogueId correctly resolved to AutoDeler via focus context (ok:true, a real improvement over the pre-nullable-fix bias), or (b) a mismatched guess correctly forced into reject-clarify. Draft/clarification not confirmed — no real "Sommerdekklager" category created.`,
        evidence: { q1: q1.reply, q2: q2.reply, verdicts, clarifying },
        trace: [...q1.trace, ...q2.trace],
        screenshot,
      }
    })

    await run('K.12b', 'catalogueId-context-consistency — false-positive guard (shared 2-turn session)', 'K', async () => {
      await newChat(page)
      const q1 = await sendChat(page, 'Hvor mange produkter har vi i AutoDeler?')
      const q2 = await sendChat(page, 'Legg til en ny kategori i Matmeny som heter Vinterdekklager')
      const verdicts = extractChecks([...q1.trace, ...q2.trace], 'catalogueId-context-consistency')
      const clarifying = await isClarificationVisible(page)
      await dismissWhateverIsOpen(page)
      const screenshot = await shotFor(page, 'K.12b')
      return {
        status: verdicts.some((v) => !v.ok) ? 'FAIL' : 'CAPTURED',
        notes: `Q1 (sets AutoDeler dialog focus) reply: "${q1.reply}". Q2 (explicitly names Matmeny instead) reply: "${q2.reply}". catalogueId-context-consistency verdicts: ${JSON.stringify(verdicts)}. clarifying=${clarifying}. Expect ok:true / no reject-clarify — Matmeny is the explicit, correct instruction here even though it disagrees with Q1's own AutoDeler focus; a reject-clarify would be a real false-positive finding, graded FAIL. Draft/clarification not confirmed — no real category created.`,
        evidence: { q1: q1.reply, q2: q2.reply, verdicts, clarifying },
        trace: [...q1.trace, ...q2.trace],
        screenshot,
      }
    })

    saveResults()
    console.log('=== SECTION K COMPLETE ===')
    console.log('=== ALL SCENARIOS COMPLETE ===')
  } catch (err) {
    console.error('RUN FAILED (fatal, outside per-scenario try/catch):', err)
    await shot(page, 'run-FATAL')
    process.exitCode = 1
  } finally {
    await browser.close()
  }
}

main()
