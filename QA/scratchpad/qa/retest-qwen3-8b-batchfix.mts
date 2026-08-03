// Supplementary fix-up run for C.1b/C.3/C.4/C.5/C.6/C.7 from retest-qwen3-8b.mts. The original run
// found `batch=false` for all six, but a screenshot cross-check (per the plan's harness-vs-reality
// rule) showed the model actually staged valid multi-record drafts every time — they were just sitting
// behind the Draft-Quality Gate ("Se detaljer" / "Prøv igjen" / "Avbryt"), which the original scenario
// code never checked for or clicked through before testing `isBatchReviewVisible`. This script is the
// harness-bug fix: same messages, same fresh-session-per-scenario policy, but opens the gate first.
import {
  launch,
  login,
  setDashboardLanguage,
  openAssistant,
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
  isBatchReviewVisible,
  batchCardCount,
  batchCardSummaryTexts,
  confirmAllDisabledInfo,
} from './harness.mts'
import { batchCardAction, clickConfirmAll, clickCancelAll } from './harness2.mts'

const THINKING_MODEL = 'qwen3:8b'
const VISION_MODEL = 'qwen2.5vl:3b'

async function run(
  id: string,
  title: string,
  phase: string,
  fn: () => Promise<{ status: ScenarioStatus; notes: string; evidence?: Record<string, unknown>; trace?: string[]; screenshot?: string }>,
) {
  try {
    const r = await fn()
    record({ id, title, phase, ...r })
  } catch (err) {
    record({ id, title, phase, status: 'ERROR', notes: `Harness exception: ${err instanceof Error ? err.stack ?? err.message : String(err)}` })
  }
}

/** Sends the message, then opens the gate (if one appears) before reporting batch state — the fix. */
async function reachBatch(page: import('playwright').Page, message: string, timeoutMs = 240000) {
  await newChat(page)
  const { reply, trace } = await sendChat(page, message, { timeoutMs })
  const gate = await isGateVisible(page)
  const gateText = gate ? await gateFieldCountText(page) : ''
  if (gate) {
    await clickGateSeeDetails(page)
    await page.waitForTimeout(800)
  }
  const batch = await isBatchReviewVisible(page)
  const count = batch ? await batchCardCount(page) : 0
  return { reply, trace, gate, gateText, batch, count }
}

async function main() {
  const { browser, page } = await launch()
  try {
    await login(page)
    await setDashboardLanguage(page, 'Norsk')
    await configureOllamaCustomModel(page, THINKING_MODEL, VISION_MODEL)
    await openAssistant(page)
    await configureAssistantModel(page, { provider: 'local', thinkingModel: THINKING_MODEL, visionModel: VISION_MODEL, posture: 'auto' })

    await run('C.1b', 'Batch create — explicit imperative, dual pricing, no fabricated fields [gate-fix rerun]', 'C', async () => {
      const r = await reachBatch(page, 'Legg til tre nye dekk til 1200/1300 kr: sommerdekk, vinterdekk og piggdekk')
      const summaries = r.batch ? await batchCardSummaryTexts(page) : []
      let confirmedNames: string[] = []
      if (r.batch && r.count > 0) {
        await clickConfirmAll(page)
        await page.waitForTimeout(1500)
        confirmedNames = summaries.map((s) => s.split('\n')[0])
        for (const name of confirmedNames) trackCreated('product', name, 'Dekk (batch C.1b, gate-fix rerun)')
      }
      const screenshot = await shot(page, 'C-1b-gatefix')
      return {
        status: r.batch && r.count === 3 ? 'CAPTURED' : 'FAIL',
        notes: `gate=${r.gate} ("${r.gateText.slice(0, 120)}"). After Se detaljer: batch=${r.batch} cardCount=${r.count} (expect 3). Summaries: ${JSON.stringify(summaries)}. confirmedNames=${JSON.stringify(confirmedNames)}.`,
        evidence: { gate: r.gate, batch: r.batch, count: r.count, summaries },
        trace: r.trace,
        screenshot,
      }
    })

    await run('C.3', 'Per-card actions (confirm/edit/remove independence) [gate-fix rerun]', 'C', async () => {
      const r = await reachBatch(page, 'Legg til tre nye batterier: Card Test A for 500 kr, Card Test B for 600 kr, Card Test C for 700 kr')
      let confirmOk = false
      let editOk = false
      let removeOk = false
      if (r.batch && r.count >= 3) {
        await batchCardAction(page, 0, 'confirm')
        await page.waitForTimeout(1000)
        confirmOk = true
        trackCreated('product', 'Card Test A', 'Batterier (batch C.3, gate-fix rerun)')
        await batchCardAction(page, 0, 'edit')
        await page.waitForTimeout(500)
        editOk = (await page.locator('#product-name').count()) > 0
        if (editOk) {
          await page.getByRole('button', { name: 'Lagre', exact: true }).click()
          await page.waitForTimeout(1000)
          trackCreated('product', 'Card Test B', 'Batterier (batch C.3, gate-fix rerun)')
        }
        const remainingBefore = await batchCardCount(page)
        await batchCardAction(page, 0, 'remove')
        await page.waitForTimeout(500)
        const remainingAfter = await batchCardCount(page)
        removeOk = remainingAfter < remainingBefore
      }
      const screenshot = await shot(page, 'C-3-gatefix')
      return {
        status: confirmOk && editOk && removeOk ? 'PASS' : r.batch ? 'PARTIAL' : 'FAIL',
        notes: `gate=${r.gate} ("${r.gateText.slice(0, 120)}"). After Se detaljer: batch=${r.batch} count=${r.count}. confirmOk=${confirmOk} editOk=${editOk} removeOk=${removeOk}.`,
        evidence: { gate: r.gate, batch: r.batch, count: r.count, confirmOk, editOk, removeOk },
        trace: r.trace,
        screenshot,
      }
    })

    await run('C.4', 'Invalid discount blocks Confirm all only [gate-fix rerun]', 'C', async () => {
      const r = await reachBatch(page, 'Legg til to nye batterier: Bosch 60Ah for 900 kr, og Varta 70Ah for 1100 kr med 150% rabatt')
      const { disabled, hint } = r.batch ? await confirmAllDisabledInfo(page) : { disabled: false, hint: null }
      const summaries = r.batch ? await batchCardSummaryTexts(page) : []
      const boschHasDiscount = summaries.some((s) => /Bosch/i.test(s) && /%/.test(s))
      const screenshot = await shot(page, 'C-4-gatefix')
      if (r.batch) {
        const boschIdx = summaries.findIndex((s) => /Bosch/i.test(s))
        if (boschIdx >= 0) {
          await batchCardAction(page, boschIdx, 'confirm')
          await page.waitForTimeout(1000)
          trackCreated('product', 'Bosch 60Ah', 'Batterier (batch C.4, gate-fix rerun)')
        }
        const remaining = await batchCardCount(page)
        if (remaining > 0) await batchCardAction(page, 0, 'remove').catch(() => {})
      }
      return {
        status: r.batch && disabled ? 'CAPTURED' : 'FAIL',
        notes: `gate=${r.gate} ("${r.gateText.slice(0, 120)}"). After Se detaljer: batch=${r.batch}. Confirm all disabled=${disabled} hint="${hint}". Bosch card shows fabricated discount=${boschHasDiscount} (must be false). Summaries: ${JSON.stringify(summaries)}.`,
        evidence: { gate: r.gate, batch: r.batch, disabled, hint, boschHasDiscount, summaries },
        trace: r.trace,
        screenshot,
      }
    })

    await run('C.5', 'Confirm all on a clean batch [gate-fix rerun]', 'C', async () => {
      const r = await reachBatch(page, 'Legg til to nye lydanlegg: Pioneer Høyttaler for 800 kr og Sony Forsterker for 950 kr')
      const summaries = r.batch ? await batchCardSummaryTexts(page) : []
      let confirmed = false
      if (r.batch) {
        await clickConfirmAll(page)
        await page.waitForTimeout(1500)
        confirmed = true
        for (const s of summaries) trackCreated('product', s.split('\n')[0], 'Lydanlegg (batch C.5, gate-fix rerun)')
      }
      const screenshot = await shot(page, 'C-5-gatefix')
      return {
        status: r.batch && confirmed ? 'CAPTURED' : 'FAIL',
        notes: `gate=${r.gate} ("${r.gateText.slice(0, 120)}"). After Se detaljer: batch=${r.batch} summaries=${JSON.stringify(summaries)} confirmed=${confirmed}.`,
        evidence: { gate: r.gate, batch: r.batch, summaries },
        trace: r.trace,
        screenshot,
      }
    })

    await run('C.6', 'Cancel all — nothing created [gate-fix rerun]', 'C', async () => {
      const r = await reachBatch(page, 'Legg til tre nye interiørprodukter: Cancel Test A for 100 kr, Cancel Test B for 120 kr, Cancel Test C for 140 kr')
      let cancelled = false
      if (r.batch) {
        await clickCancelAll(page)
        await page.waitForTimeout(500)
        cancelled = !(await isBatchReviewVisible(page))
      }
      const screenshot = await shot(page, 'C-6-gatefix')
      return {
        status: r.batch ? (cancelled ? 'PASS' : 'CAPTURED') : 'FAIL',
        notes: `gate=${r.gate} ("${r.gateText.slice(0, 120)}"). After Se detaljer: batch=${r.batch} cancelledSuccessfully=${cancelled}. No products should exist either way.`,
        evidence: { gate: r.gate, batch: r.batch, cancelled },
        trace: r.trace,
        screenshot,
      }
    })

    await run('C.7', 'Cross-record contamination check (events batch) [gate-fix rerun]', 'C', async () => {
      const r = await reachBatch(
        page,
        'Legg til to nye arrangementer: Sommertreff 10.06.2026 kl 12-16 adresse Torget 1, og Vintertreff 15.12.2026 kl 12-16 adresse Torget 2',
      )
      const summaries = r.batch ? await batchCardSummaryTexts(page) : []
      let confirmed = false
      if (r.batch) {
        await clickConfirmAll(page)
        await page.waitForTimeout(1500)
        confirmed = true
        trackCreated('event', 'Sommertreff', 'batch C.7, gate-fix rerun')
        trackCreated('event', 'Vintertreff', 'batch C.7, gate-fix rerun')
      }
      const screenshot = await shot(page, 'C-7-gatefix')
      return {
        status: r.batch ? 'CAPTURED' : 'FAIL',
        notes: `gate=${r.gate} ("${r.gateText.slice(0, 120)}"). After Se detaljer: batch=${r.batch} summaries=${JSON.stringify(summaries)} — check each card's own date/address/category stayed isolated (no bleed) via screenshot. confirmed=${confirmed}.`,
        evidence: { gate: r.gate, batch: r.batch, summaries },
        trace: r.trace,
        screenshot,
      }
    })

    saveResults()
    console.log('=== GATE-FIX RERUN COMPLETE ===')
  } catch (err) {
    console.error('GATE-FIX RERUN FAILED (fatal):', err)
    await shot(page, 'gatefix-FATAL')
    process.exitCode = 1
  } finally {
    await browser.close()
  }
}

main()
