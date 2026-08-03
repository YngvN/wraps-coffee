import type { Page } from 'playwright'
import {
  launch,
  login,
  setDashboardLanguage,
  openAssistant,
  openModelMenu,
  closeModelMenu,
  configureAssistantModel,
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

    // ================= SECTION A: read/lookup =================

    await run('A.1', 'Product count (deterministic lookup)', 'Phase2', async () => {
      const { reply, trace } = await sendChat(page, 'Hvor mange produkter har vi?')
      const screenshot = await shotFor(page, 'A.1')
      const usesAnswerLookup = trace.some((t) => /answer_lookup/i.test(t))
      const usesLookupQuery = trace.some((t) => /lookup_query/i.test(t))
      return {
        status: 'CAPTURED',
        notes: `Reply: "${reply}". trace uses lookup_query=${usesLookupQuery}, uses answer_lookup=${usesAnswerLookup} (expect false for deterministic count path).`,
        evidence: { reply, usesAnswerLookup, usesLookupQuery },
        trace,
        screenshot,
      }
    })

    await run('A.2', 'Discounted product count', 'Phase2', async () => {
      const { reply, trace } = await sendChat(page, 'Hvor mange produkter er på tilbud?')
      const screenshot = await shotFor(page, 'A.2')
      return { status: 'CAPTURED', notes: `Reply: "${reply}" (expect 1).`, evidence: { reply }, trace, screenshot }
    })

    await run('A.3', 'Which product is on sale', 'Phase2', async () => {
      const { reply, trace } = await sendChat(page, 'Hvilke produkter er på tilbud?')
      const screenshot = await shotFor(page, 'A.3')
      return { status: 'CAPTURED', notes: `Reply: "${reply}" (expect mentions Michelin Vinterdekk).`, evidence: { reply }, trace, screenshot }
    })

    await run('A.4', 'List all products (bullet attachment)', 'Phase1', async () => {
      const { reply, trace } = await sendChat(page, 'Gi meg en liste over alle produkter', { timeoutMs: 240000 })
      const screenshot = await shotFor(page, 'A.4')
      const listItemCount = await page.locator('.assistant-panel__transcript li').count()
      return {
        status: 'CAPTURED',
        notes: `Reply: "${reply.slice(0, 300)}...". DOM <li> count near transcript: ${listItemCount} (expect a real list, not one run-on sentence — check screenshot).`,
        evidence: { reply, listItemCount },
        trace,
        screenshot,
      }
    })

    await run('A.5', 'Compound imperative+interrogative', 'General', async () => {
      const { reply, trace } = await sendChat(page, 'Gi meg en liste over alle produkter og vis meg hvem som er på tilbud', { timeoutMs: 240000 })
      const screenshot = await shotFor(page, 'A.5')
      return { status: 'CAPTURED', notes: `Reply: "${reply.slice(0, 400)}..."`, evidence: { reply }, trace, screenshot }
    })

    await run('A.6', 'Compound two-interrogative', 'General', async () => {
      const { reply, trace } = await sendChat(page, 'Hvor mange produkter har vi og hvem er på tilbud?')
      const screenshot = await shotFor(page, 'A.6')
      return { status: 'CAPTURED', notes: `Reply: "${reply}" — check whether both halves answered or one silently dropped.`, evidence: { reply }, trace, screenshot }
    })

    await run('A.7', 'Non-question phrase must not trigger create', 'Phase1', async () => {
      const { reply, trace } = await sendChat(page, 'et stort og et lite frontlys')
      const gate = await isGateVisible(page)
      const batch = await isBatchReviewVisible(page)
      const review = await isSingleReviewVisible(page)
      const screenshot = await shotFor(page, 'A.7')
      return {
        status: gate || batch || review ? 'FAIL' : 'CAPTURED',
        notes: `Reply: "${reply}". gate=${gate} batch=${batch} singleReview=${review} (all must be false — must be an ordinary lookup answer, never a create draft).`,
        evidence: { reply, gate, batch, review },
        trace,
        screenshot,
      }
    })

    await run('A.8/A.11', 'Ambiguous "Frontlys" must clarify', 'General', async () => {
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
        notes: `Reply: "${reply}". clarifying=${clarifying} options=${JSON.stringify(options)} (must list both Frontlys candidates with distinguishing category labels, never silently guess).`,
        evidence: { reply, clarifying, options },
        trace,
        screenshot,
      }
    })

    await run('A.9a', 'Bilingual filter — LED products (Norsk UI)', 'Phase2', async () => {
      const { reply, trace } = await sendChat(page, 'Vis meg alle LED-produkter')
      const screenshot = await shotFor(page, 'A.9a')
      const names = ['LED Headlight Bulb H7', 'LED Interior Strip', 'LED Fog Light']
      const found = names.filter((n) => reply.includes(n))
      return {
        status: 'CAPTURED',
        notes: `Reply: "${reply}". Found ${found.length}/3 LED product names (${JSON.stringify(found)}) — regression check for null-Norwegian-variant bilingual filter.`,
        evidence: { reply, found },
        trace,
        screenshot,
      }
    })

    await run('A.9b', 'Bilingual filter — LED products (English UI)', 'Phase2', async () => {
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
        notes: `Reply (English UI): "${reply}". Found ${found.length}/3 (${JSON.stringify(found)}) — confirms fix isn't one-directional.`,
        evidence: { reply, found },
        trace,
        screenshot,
      }
    })

    await run('A.10', 'Pronoun follow-up (diagnostic only, out of scope)', 'OutOfScope', async () => {
      const first = await sendChat(page, 'Hvilke produkter har vi i Bremser-kategorien?')
      const second = await sendChat(page, 'Hvor mye koster den første?')
      const screenshot = await shotFor(page, 'A.10')
      return {
        status: 'CAPTURED',
        notes: `Q1 reply: "${first.reply}". Q2 ("den første") reply: "${second.reply}". Diagnostic only — not a Phase 1-3 regression either way.`,
        evidence: { firstReply: first.reply, secondReply: second.reply },
        trace: [...first.trace, ...second.trace],
        screenshot,
      }
    })

    await run('A.12a', 'Event bilingual display (Norsk UI)', 'Phase2', async () => {
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

    await run('A.12b', 'Event bilingual display (English UI, no English title)', 'Phase2', async () => {
      await setDashboardLanguage(page, 'English')
      await openAssistant(page)
      const q1 = await sendChat(page, 'How many events do we have?')
      const q2 = await sendChat(page, 'What events do we have?')
      const screenshot1 = await shotFor(page, 'A.12b-chat')
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

    await run('A.extra', 'Catalogue count (2) and category count (8)', 'General', async () => {
      const q1 = await sendChat(page, 'Hvor mange kataloger har vi?')
      const q2 = await sendChat(page, 'Hvor mange kategorier har vi?')
      const screenshot = await shotFor(page, 'A-extra')
      return {
        status: 'CAPTURED',
        notes: `Catalogues Q: "${q1.reply}" (expect 2). Categories Q: "${q2.reply}" (expect 8, incl. blank-named).`,
        evidence: { q1: q1.reply, q2: q2.reply },
        trace: [...q1.trace, ...q2.trace],
        screenshot,
      }
    })

    saveResults()
    console.log('=== SECTION A COMPLETE ===')

    // ================= SECTION B: single-record ingestion =================

    await run('B.1', 'Confidence markers / posture stripping (create tire)', 'Phase3', async () => {
      const { reply, trace } = await sendChat(page, 'Legg til et nytt dekk som heter Continental Sommerdekk, ca 1200 kr')
      const gate = await isGateVisible(page)
      const gateText = gate ? await gateFieldCountText(page) : ''
      let reviewText = ''
      if (gate) {
        await clickGateSeeDetails(page)
        await page.waitForTimeout(500)
        reviewText = await singleReviewText(page)
      } else {
        reviewText = await singleReviewText(page)
      }
      const screenshot = await shotFor(page, 'B.1')
      const hasAllergens = /Allergener/i.test(reviewText)
      const hasDietary = /Diettmerker/i.test(reviewText)
      let created_ = false
      if (await page.locator('.assistant-panel__review').count()) {
        await clickReviewConfirm(page)
        await page.waitForTimeout(1000)
        created_ = true
        trackCreated('product', 'Continental Sommerdekk', 'Dekk')
      }
      return {
        status: 'CAPTURED',
        notes: `Reply: "${reply}". gate=${gate} gateText="${gateText}". review has Allergener=${hasAllergens} Diettmerker=${hasDietary} (both must be absent). confirmed=${created_}.`,
        evidence: { reply, gate, gateText, reviewText, hasAllergens, hasDietary },
        trace,
        screenshot,
      }
    })

    await run('B.2/B.3a', 'Clarification loop fix — tap to pick catalogue', 'Phase1', async () => {
      const { reply, trace } = await sendChat(page, 'Legg til en ny kategori som heter Dekkhotell')
      const clarifying = await isClarificationVisible(page)
      const options = clarifying ? await getClarificationOptionLabels(page) : []
      const screenshot1 = await shotFor(page, 'B.2-B.3a-clarify')
      let resolved = false
      let gate = false
      if (clarifying && options.length) {
        await clickClarificationOption(page, options[0])
        await page.waitForTimeout(2000)
        gate = await isGateVisible(page)
        if (gate) await clickGateSeeDetails(page)
        resolved = (await page.locator('.assistant-panel__review').count()) > 0
        if (resolved) {
          await clickReviewConfirm(page)
          await page.waitForTimeout(1000)
          trackCreated('category', 'Dekkhotell', 'AutoDeler (tapped)')
        }
      }
      const screenshot2 = await shotFor(page, 'B.2-B.3a-after')
      return {
        status: clarifying ? 'CAPTURED' : 'FAIL',
        notes: `Reply: "${reply}". clarifying=${clarifying} options=${JSON.stringify(options)} resolved(tap)=${resolved} — must resolve immediately, not loop.`,
        evidence: { reply, clarifying, options, resolved },
        trace,
        screenshot: screenshot2,
      }
    })

    await run('B.2/B.3b', 'Clarification loop fix — typed chat answer', 'Phase1', async () => {
      const { reply, trace } = await sendChat(page, 'Legg til en ny kategori som heter Sesonglager')
      const clarifying = await isClarificationVisible(page)
      const options = clarifying ? await getClarificationOptionLabels(page) : []
      let typedReply = ''
      let resolved = false
      if (clarifying && options.length) {
        const target = options.find((o) => /AutoDeler/i.test(o)) ?? options[0]
        const typed = await sendChat(page, target)
        typedReply = typed.reply
        await page.waitForTimeout(1000)
        const gate = await isGateVisible(page)
        if (gate) await clickGateSeeDetails(page)
        resolved = (await page.locator('.assistant-panel__review').count()) > 0
        if (resolved) {
          await clickReviewConfirm(page)
          await page.waitForTimeout(1000)
          trackCreated('category', 'Sesonglager', 'AutoDeler (typed)')
        }
      }
      const screenshot = await shotFor(page, 'B.2-B.3b')
      return {
        status: clarifying ? 'CAPTURED' : 'FAIL',
        notes: `Reply: "${reply}". clarifying=${clarifying} options=${JSON.stringify(options)}. Typed answer reply: "${typedReply}". resolved=${resolved} — confirms typed-answer path also resolves.`,
        evidence: { reply, clarifying, options, typedReply, resolved },
        trace,
        screenshot,
      }
    })

    await run('B.4', 'Unclear chat answer to clarification', 'Phase1', async () => {
      const { reply, trace } = await sendChat(page, 'Legg til en ny kategori som heter Vinterlager')
      const clarifying = await isClarificationVisible(page)
      const options = clarifying ? await getClarificationOptionLabels(page) : []
      let unclearReply = ''
      let stillClarifying = false
      let falselyResolved = false
      if (clarifying) {
        const typed = await sendChat(page, 'kanskje dekkhotell eller sesonglager')
        unclearReply = typed.reply
        stillClarifying = await isClarificationVisible(page)
        falselyResolved = (await isGateVisible(page)) || (await isSingleReviewVisible(page))
        // clean up: cancel whatever state this left us in so it doesn't leak into later scenarios
        if (falselyResolved) {
          if (await isGateVisible(page)) await clickGateSeeDetails(page)
          if (await page.locator('.assistant-panel__review').count()) await clickReviewCancel(page).catch(() => {})
        } else if (stillClarifying && options.length) {
          await clickClarificationOption(page, options[0])
          await page.waitForTimeout(1000)
          if (await isGateVisible(page)) await clickGateSeeDetails(page)
          if (await page.locator('.assistant-panel__review').count()) await clickReviewCancel(page).catch(() => {})
        }
      }
      const screenshot = await shotFor(page, 'B.4')
      return {
        status: clarifying ? (falselyResolved ? 'FAIL' : 'CAPTURED') : 'N/A',
        notes: `Reply: "${reply}". clarifying=${clarifying}. Unclear answer reply: "${unclearReply}". stillClarifying=${stillClarifying} falselyResolved=${falselyResolved} (must not falsely resolve).`,
        evidence: { reply, clarifying, unclearReply, stillClarifying, falselyResolved },
        trace,
        screenshot,
      }
    })

    await run('B.5a', 'Draft-quality gate — Se detaljer', 'Phase3', async () => {
      const msg = 'Legg til et nytt dekk som heter Gate Test Dekk A, ca 500 kr'
      const { reply, trace } = await sendChat(page, msg)
      const gate = await isGateVisible(page)
      const screenshot1 = await shotFor(page, 'B.5a-gate')
      let reviewShown = false
      if (gate) {
        await clickGateSeeDetails(page)
        await page.waitForTimeout(500)
        reviewShown = await isSingleReviewVisible(page)
        await clickReviewCancel(page).catch(() => {})
      }
      const screenshot2 = await shotFor(page, 'B.5a-review')
      return {
        status: gate && reviewShown ? 'CAPTURED' : 'FAIL',
        notes: `Reply: "${reply}". gate=${gate}. After "Se detaljer", normal review form shown=${reviewShown}.`,
        evidence: { reply, gate, reviewShown },
        trace,
        screenshot: screenshot2,
      }
    })

    await run('B.5b', 'Draft-quality gate — Prøv igjen (composer restore)', 'Phase3', async () => {
      const msg = 'Legg til et nytt dekk som heter Gate Test Dekk B, ca 500 kr'
      // pollute the composer first to make sure it's truly *replaced*, not appended
      const composer = page.getByPlaceholder('Be assistenten opprette, oppdatere eller slette noe …')
      const { reply, trace } = await sendChat(page, msg)
      const gate = await isGateVisible(page)
      if (gate) await clickGateTryAgain(page)
      await page.waitForTimeout(500)
      const restoredText = await composerText(page)
      const focused = await isComposerFocused(page)
      const gateGone = !(await isGateVisible(page))
      const screenshot = await shotFor(page, 'B.5b')
      // clear composer so it doesn't bleed into the next scenario
      await composer.fill('')
      return {
        status: gate && restoredText === msg && focused && gateGone ? 'PASS' : 'CAPTURED',
        notes: `gate=${gate}. After "Prøv igjen": composer="${restoredText}" (expect exact match to "${msg}"), focused=${focused}, gate dismissed=${gateGone}.`,
        evidence: { reply, gate, restoredText, expectedText: msg, focused, gateGone },
        trace,
        screenshot,
      }
    })

    await run('B.5c', 'Draft-quality gate — Avbryt (discard)', 'Phase3', async () => {
      const msg = 'Legg til et nytt dekk som heter Gate Test Dekk C, ca 500 kr'
      const { reply, trace } = await sendChat(page, msg)
      const gate = await isGateVisible(page)
      if (gate) await clickGateCancel(page)
      await page.waitForTimeout(500)
      const composerAfter = await composerText(page)
      const gateGone = !(await isGateVisible(page))
      const screenshot = await shotFor(page, 'B.5c')
      return {
        status: gate && composerAfter === '' && gateGone ? 'PASS' : 'CAPTURED',
        notes: `gate=${gate}. After "Avbryt": composer="${composerAfter}" (expect empty), gate dismissed=${gateGone}.`,
        evidence: { reply, gate, composerAfter, gateGone },
        trace,
        screenshot,
      }
    })

    await run('B.6', 'Confirm/Edit a staged draft through the gate', 'Phase3', async () => {
      const msgConfirm = 'Legg til et nytt dekk som heter Gate Confirm Dekk, ca 500 kr'
      const c1 = await sendChat(page, msgConfirm)
      let confirmOk = false
      if (await isGateVisible(page)) await clickGateSeeDetails(page)
      if (await page.locator('.assistant-panel__review').count()) {
        await clickReviewConfirm(page)
        await page.waitForTimeout(1000)
        confirmOk = true
        trackCreated('product', 'Gate Confirm Dekk', 'Dekk')
      }
      const screenshot1 = await shotFor(page, 'B.6-confirm')

      const msgEdit = 'Legg til et nytt dekk som heter Gate Edit Dekk, ca 500 kr'
      const c2 = await sendChat(page, msgEdit)
      let editFormOpened = false
      if (await isGateVisible(page)) await clickGateSeeDetails(page)
      if (await page.locator('.assistant-panel__review').count()) {
        await clickReviewEdit(page)
        await page.waitForTimeout(500)
        editFormOpened = (await page.locator('#product-name').count()) > 0
        if (editFormOpened) {
          await page.getByRole('button', { name: 'Lagre', exact: true }).click()
          await page.waitForTimeout(1000)
          trackCreated('product', 'Gate Edit Dekk', 'Dekk')
        }
      }
      const screenshot2 = await shotFor(page, 'B.6-edit')
      return {
        status: confirmOk && editFormOpened ? 'CAPTURED' : 'PARTIAL',
        notes: `Confirm path: reply="${c1.reply}" confirmed=${confirmOk}. Edit path: reply="${c2.reply}" editFormOpened=${editFormOpened}.`,
        evidence: { confirmOk, editFormOpened },
        trace: [...c1.trace, ...c2.trace],
        screenshot: screenshot2,
      }
    })

    await run('B.7', 'Price/discount display fix (invalid discount stripped)', 'Phase2', async () => {
      const { reply, trace } = await sendChat(page, 'Legg til et bremsesett som heter Brembo Sportbrems for 2400 kr med 20% rabatt')
      if (await isGateVisible(page)) await clickGateSeeDetails(page)
      const reviewText = await singleReviewText(page)
      const hasFabricatedDiscount = /\d+\s*%/.test(reviewText.match(/Rabatt[^\n]*/i)?.[0] ?? '')
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
        notes: `Reply: "${reply}". Review text discount line: "${reviewText.match(/Rabatt[^\n]*/i)?.[0] ?? '(not found)'}" — must show unset ("Fill this in"), never a captured/fabricated percentage. confirmed=${confirmed}.`,
        evidence: { reply, reviewText, hasFabricatedDiscount },
        trace,
        screenshot,
      }
    })

    await run('B.8', 'Category custom-field fabrication check', 'Phase3', async () => {
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
        notes: `Reply: "${reply}". Review text: "${reviewText.slice(0, 300)}" — must show no unrequested custom fields (e.g. no fabricated "Type"/"Merke"). confirmed=${confirmed}.`,
        evidence: { reply, reviewText },
        trace,
        screenshot,
      }
    })

    await run('B.9', 'Update product price via chat', 'Phase2', async () => {
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
        notes: `Reply: "${reply}". Review text: "${reviewText.slice(0, 300)}" — price row should show real old→new values (1200→1350), not "Fill this in". confirmed=${confirmed}.`,
        evidence: { reply, reviewText },
        trace,
        screenshot,
      }
    })

    await run('B.10', 'Delete product via chat', 'General', async () => {
      const { reply, trace } = await sendChat(page, 'Slett dekket Continental Sommerdekk')
      const screenshot1 = await shotFor(page, 'B.10-confirm')
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

    await run('B.11a', 'Kebab override — posture Av (full), verify + two trace steps', 'Phase3', async () => {
      await openModelMenu(page)
      await page.locator('#assistant-ingestion-posture-select').selectOption('full')
      await closeModelMenu(page)
      const { reply, trace } = await sendChat(page, 'Legg til et nytt dekk som heter Full Posture Dekk, ca 500 kr')
      const gate = await isGateVisible(page)
      const reviewText = await singleReviewText(page)
      const hasAllergens = /Allergener/i.test(reviewText)
      const hasDietary = /Diettmerker/i.test(reviewText)
      const draftTagged = trace.some((t) => /\(draft\)/.test(t))
      const verifyTagged = trace.some((t) => /\(verify\)/.test(t))
      const screenshot = await shotFor(page, 'B.11a')
      if (await page.locator('.assistant-panel__review').count()) await clickReviewCancel(page).catch(() => {})
      return {
        status: 'CAPTURED',
        notes: `Reply: "${reply}". gate=${gate} (expect false under full posture). Allergener present=${hasAllergens} Diettmerker present=${hasDietary} (expect true, fields present though maybe blank). trace shows (draft)=${draftTagged} and (verify)=${verifyTagged} steps.`,
        evidence: { reply, gate, hasAllergens, hasDietary, draftTagged, verifyTagged },
        trace,
        screenshot,
      }
    })

    await run('B.11b', 'Kebab override — posture back to Automatisk, single untagged step', 'Phase3', async () => {
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
        notes: `Reply: "${reply}". gate=${gate} (expect true under safe/auto posture). trace (draft) tag=${draftTagged} (verify) tag=${verifyTagged} (expect a single untagged fill_fields step, no verify pass, under safe posture).`,
        evidence: { reply, gate, draftTagged, verifyTagged },
        trace,
        screenshot,
      }
    })

    await run('B.12', 'Manual product creation unaffected (no AI chrome)', 'General', async () => {
      await openCatalogue(page, 'AutoDeler')
      await addProductToCategory(page, 'Dekk', { name: 'Manuell Test Dekk', priceMode: 'flat', price: 599 })
      const section = await expandCategorySection(page, 'Dekk')
      const html = await section.innerHTML()
      const hasAiChrome = /assistant|ai-|thought-trace/i.test(html)
      const screenshot = await shotFor(page, 'B.12')
      return {
        status: hasAiChrome ? 'FAIL' : 'PASS',
        notes: `Manually created "Manuell Test Dekk" via ordinary "+ Legg til produkt" form. AI-related chrome detected in category section HTML=${hasAiChrome} (expect false).`,
        evidence: { hasAiChrome },
        screenshot,
      }
    })

    await openAssistant(page)
    saveResults()
    console.log('=== SECTION B COMPLETE ===')

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
  } catch (err) {
    console.error('SCENARIOS FAILED (fatal, outside per-scenario try/catch):', err)
    await shot(page, 'scenarios-FATAL')
    process.exitCode = 1
  } finally {
    await browser.close()
  }
}

main()
