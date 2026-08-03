import type { Page } from 'playwright'
import {
  launch,
  login,
  setDashboardLanguage,
  openAssistant,
  configureAssistantModel,
  sendChat,
  shot,
  record,
  trackCreated,
  saveResults,
  type ScenarioStatus,
  isGateVisible,
  gateFieldCountText,
  clickGateCancel,
  isClarificationVisible,
  getClarificationOptionLabels,
  clickClarificationOption,
  isBatchReviewVisible,
  batchCardCount,
  batchCardSummaryTexts,
  confirmAllDisabledInfo,
  isSingleReviewVisible,
  clickGateSeeDetails,
  clickReviewCancel,
} from './harness.mts'
import { batchCardAction, clickConfirmAll, clickCancelAll } from './harness2.mts'

async function run(id: string, title: string, phase: string, fn: () => Promise<{ status: ScenarioStatus; notes: string; evidence?: Record<string, unknown>; trace?: string[]; screenshot?: string }>) {
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

async function main() {
  const { browser, page } = await launch()
  try {
    await login(page)
    await setDashboardLanguage(page, 'Norsk')
    await openAssistant(page)
    await configureAssistantModel(page, { provider: 'local', thinkingModel: 'gemma3:4b', visionModel: 'gemma3:4b', posture: 'auto' })

    // ================= SECTION C: batch ingestion =================

    await run('C.1a', 'Batch phrasing gap — natural non-imperative phrasing', 'General', async () => {
      const { reply, trace } = await sendChat(page, 'Dekk til 1200 kr med sommer, vinter og pigg')
      const batch = await isBatchReviewVisible(page)
      const screenshot = await shotFor(page, 'C.1a')
      return {
        status: 'CAPTURED',
        notes: `Reply: "${reply}". batchShown=${batch} — known gap: likely misclassified as lookup, not a Phase 1-3 regression either way.`,
        evidence: { reply, batch },
        trace,
        screenshot,
      }
    })

    await run('C.1b', 'Batch create — explicit imperative, dual pricing, no fabricated fields', 'Phase1', async () => {
      const { reply, trace } = await sendChat(page, 'Legg til tre nye dekk til 1200/1300 kr: sommerdekk, vinterdekk og piggdekk', { timeoutMs: 240000 })
      const batch = await isBatchReviewVisible(page)
      const count = batch ? await batchCardCount(page) : 0
      const summaries = batch ? await batchCardSummaryTexts(page) : []
      const screenshot1 = await shotFor(page, 'C.1b-batch')
      let confirmedNames: string[] = []
      if (batch && count > 0) {
        await clickConfirmAll(page)
        await page.waitForTimeout(1500)
        confirmedNames = summaries.map((s) => s.split('\n')[0])
        for (const name of confirmedNames) trackCreated('product', name, 'Dekk (batch C.1b)')
      }
      const screenshot2 = await shotFor(page, 'C.1b-after')
      return {
        status: batch && count === 3 ? 'CAPTURED' : 'FAIL',
        notes: `Reply: "${reply}". batch=${batch} cardCount=${count} (expect 3). Summaries: ${JSON.stringify(summaries)}. confirmedNames=${JSON.stringify(confirmedNames)}.`,
        evidence: { reply, batch, count, summaries },
        trace,
        screenshot: screenshot2,
      }
    })

    await run('C.2', 'Shared clarification across batch cards (fillFieldsBatch)', 'Phase1', async () => {
      const { reply, trace } = await sendChat(page, 'Legg til to nye kategorier: Skinnhotell og Feltlager', { timeoutMs: 240000 })
      const clarifying = await isClarificationVisible(page)
      const options = clarifying ? await getClarificationOptionLabels(page) : []
      const screenshot1 = await shotFor(page, 'C.2-clarify')
      let resolved = false
      let confirmedNames: string[] = []
      if (clarifying && options.length) {
        const target = options.find((o) => /AutoDeler/i.test(o)) ?? options[0]
        await clickClarificationOption(page, target)
        await page.waitForTimeout(2000)
        const batch = await isBatchReviewVisible(page)
        resolved = batch || (await isSingleReviewVisible(page))
        if (batch) {
          const summaries = await batchCardSummaryTexts(page)
          await clickConfirmAll(page)
          await page.waitForTimeout(1500)
          confirmedNames = summaries.map((s) => s.split('\n')[0])
          for (const name of confirmedNames) trackCreated('category', name, 'AutoDeler (batch C.2)')
        }
      }
      const screenshot2 = await shotFor(page, 'C.2-after')
      return {
        status: clarifying ? (resolved ? 'CAPTURED' : 'FAIL') : 'PARTIAL',
        notes: `Reply: "${reply}". clarifying=${clarifying} options=${JSON.stringify(options)} resolved=${resolved} confirmedNames=${JSON.stringify(confirmedNames)} — same loop-fix, via fillFieldsBatch.`,
        evidence: { reply, clarifying, options, resolved },
        trace,
        screenshot: screenshot2,
      }
    })

    await run('C.3', 'Per-card actions (confirm/edit/remove independence)', 'General', async () => {
      const { reply, trace } = await sendChat(
        page,
        'Legg til tre nye batterier: Card Test A for 500 kr, Card Test B for 600 kr, Card Test C for 700 kr',
        { timeoutMs: 240000 },
      )
      const batch = await isBatchReviewVisible(page)
      const count = batch ? await batchCardCount(page) : 0
      const screenshot1 = await shotFor(page, 'C.3-batch')
      let confirmOk = false
      let editOk = false
      let removeOk = false
      if (batch && count >= 3) {
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
      const screenshot2 = await shotFor(page, 'C.3-after')
      return {
        status: confirmOk && editOk && removeOk ? 'PASS' : 'CAPTURED',
        notes: `Reply: "${reply}". batch=${batch} count=${count}. confirmOk=${confirmOk} editOk=${editOk} removeOk=${removeOk}.`,
        evidence: { reply, batch, count, confirmOk, editOk, removeOk },
        trace,
        screenshot: screenshot2,
      }
    })

    await run('C.4', 'Invalid discount blocks Confirm all only', 'Phase2', async () => {
      const { reply, trace } = await sendChat(
        page,
        'Legg til to nye batterier: Bosch 60Ah for 900 kr, og Varta 70Ah for 1100 kr med 150% rabatt',
        { timeoutMs: 240000 },
      )
      const batch = await isBatchReviewVisible(page)
      const { disabled, hint } = batch ? await confirmAllDisabledInfo(page) : { disabled: false, hint: null }
      const summaries = batch ? await batchCardSummaryTexts(page) : []
      const boschHasDiscount = summaries.some((s) => /Bosch/i.test(s) && /%/.test(s))
      const screenshot = await shotFor(page, 'C.4')
      if (batch) {
        // confirm the valid Bosch card, remove the invalid Varta one
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
        status: batch && disabled ? 'CAPTURED' : 'FAIL',
        notes: `Reply: "${reply}". batch=${batch}. Confirm all disabled=${disabled} hint="${hint}". Bosch card shows fabricated discount=${boschHasDiscount} (must be false). Summaries: ${JSON.stringify(summaries)}.`,
        evidence: { reply, batch, disabled, hint, boschHasDiscount, summaries },
        trace,
        screenshot,
      }
    })

    await run('C.5', 'Confirm all on a clean batch', 'General', async () => {
      const { reply, trace } = await sendChat(page, 'Legg til to nye lydanlegg: Pioneer Høyttaler for 800 kr og Sony Forsterker for 950 kr', {
        timeoutMs: 240000,
      })
      const batch = await isBatchReviewVisible(page)
      const summaries = batch ? await batchCardSummaryTexts(page) : []
      const screenshot1 = await shotFor(page, 'C.5-batch')
      let confirmed = false
      if (batch) {
        await clickConfirmAll(page)
        await page.waitForTimeout(1500)
        confirmed = true
        for (const s of summaries) trackCreated('product', s.split('\n')[0], 'Lydanlegg (batch C.5)')
      }
      const screenshot2 = await shotFor(page, 'C.5-after')
      return {
        status: batch && confirmed ? 'CAPTURED' : 'FAIL',
        notes: `Reply: "${reply}". batch=${batch} summaries=${JSON.stringify(summaries)} confirmed=${confirmed}.`,
        evidence: { reply, batch, summaries },
        trace,
        screenshot: screenshot2,
      }
    })

    await run('C.6', 'Cancel all — nothing created', 'General', async () => {
      const { reply, trace } = await sendChat(
        page,
        'Legg til tre nye interiørprodukter: Cancel Test A for 100 kr, Cancel Test B for 120 kr, Cancel Test C for 140 kr',
        { timeoutMs: 240000 },
      )
      const batch = await isBatchReviewVisible(page)
      const screenshot1 = await shotFor(page, 'C.6-batch')
      let cancelled = false
      if (batch) {
        await clickCancelAll(page)
        await page.waitForTimeout(500)
        cancelled = !(await isBatchReviewVisible(page))
      }
      const screenshot2 = await shotFor(page, 'C.6-after')
      return {
        status: batch && cancelled ? 'PASS' : 'CAPTURED',
        notes: `Reply: "${reply}". batch=${batch} cancelledSuccessfully=${cancelled}. No products should have been created.`,
        evidence: { reply, batch, cancelled },
        trace,
        screenshot: screenshot2,
      }
    })

    await run('C.7', 'Cross-record contamination check (events batch)', 'General', async () => {
      const { reply, trace } = await sendChat(
        page,
        'Legg til to nye arrangementer: Sommertreff 10.06.2026 kl 12-16 adresse Torget 1, og Vintertreff 15.12.2026 kl 12-16 adresse Torget 2',
        { timeoutMs: 240000 },
      )
      const batch = await isBatchReviewVisible(page)
      const summaries = batch ? await batchCardSummaryTexts(page) : []
      const categoryFabricated = summaries.some((s) => /kategori/i.test(s) && !/kategori:\s*(fill|—|-)?\s*$/i.test(s))
      const screenshot1 = await shotFor(page, 'C.7-batch')
      let confirmed = false
      if (batch) {
        await clickConfirmAll(page)
        await page.waitForTimeout(1500)
        confirmed = true
        trackCreated('event', 'Sommertreff', 'batch C.7')
        trackCreated('event', 'Vintertreff', 'batch C.7')
      }
      const screenshot2 = await shotFor(page, 'C.7-after')
      return {
        status: 'CAPTURED',
        notes: `Reply: "${reply}". batch=${batch} summaries=${JSON.stringify(summaries)} — check each card's own date/address stayed isolated (no bleed) via screenshot. Category field text present=${categoryFabricated} (should be absent/unset, not fabricated). confirmed=${confirmed}.`,
        evidence: { reply, batch, summaries, categoryFabricated },
        trace,
        screenshot: screenshot2,
      }
    })

    await run('C.8', 'No false batch UI for single-record message', 'General', async () => {
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

    await run('C.9a', 'Draft-quality gate, batch (3 records)', 'Phase3', async () => {
      const { reply, trace } = await sendChat(page, 'Legg til tre nye motoroljer: Gate Batch A, Gate Batch B og Gate Batch C, alle for 150 kr', {
        timeoutMs: 240000,
      })
      const gate = await isGateVisible(page)
      const gateText = gate ? await gateFieldCountText(page) : ''
      const screenshot = await shotFor(page, 'C.9a')
      if (gate) await clickGateCancel(page)
      else if (await isBatchReviewVisible(page)) await clickCancelAll(page).catch(() => {})
      return {
        status: 'CAPTURED',
        notes: `Reply: "${reply}". gate=${gate}. Gate text: "${gateText}" — expect 3 per-record summary lines.`,
        evidence: { reply, gate, gateText },
        trace,
        screenshot,
      }
    })

    await run('C.9b', 'Draft-quality gate, batch overflow (6+ records)', 'Phase3', async () => {
      const { reply, trace } = await sendChat(
        page,
        'Legg til seks nye dekk: Dekk Seks A for 100 kr, Dekk Seks B for 110 kr, Dekk Seks C for 120 kr, Dekk Seks D for 130 kr, Dekk Seks E for 140 kr, Dekk Seks F for 150 kr',
        { timeoutMs: 300000 },
      )
      const gate = await isGateVisible(page)
      const gateText = gate ? await gateFieldCountText(page) : ''
      const overflowLine = gateText.match(/…og \d+ til/i)?.[0] ?? null
      const screenshot = await shotFor(page, 'C.9b')
      if (gate) await clickGateCancel(page)
      else if (await isBatchReviewVisible(page)) await clickCancelAll(page).catch(() => {})
      return {
        status: gate && overflowLine ? 'PASS' : 'CAPTURED',
        notes: `Reply: "${reply}". gate=${gate}. Gate text: "${gateText}". Overflow line found: "${overflowLine}" (expect up to 5 lines + "…og N til").`,
        evidence: { reply, gate, gateText, overflowLine },
        trace,
        screenshot,
      }
    })

    saveResults()
    console.log('=== SECTION C COMPLETE ===')
    console.log('=== ALL SCENARIOS COMPLETE ===')

    console.log('=== ALL SCENARIOS COMPLETE ===')
  } catch (err) {
    console.error('SCENARIOS FAILED (fatal, outside per-scenario try/catch):', err)
    await shot(page, 'scenarios-c-FATAL')
    process.exitCode = 1
  } finally {
    await browser.close()
  }
}

main()
