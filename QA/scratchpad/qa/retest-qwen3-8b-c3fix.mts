// Isolated re-attempt of C.3 alone. The gate-fix batch rerun hit a 15s timeout clicking "Rediger" on
// card index 0 right after confirming card index 0 (which should leave a different card in that slot)
// — unclear if that's a real per-card-independence bug or a one-off timing issue, so this re-runs it
// alone with a longer wait and one screenshot taken immediately after the confirm, before attempting edit.
import { launch, login, setDashboardLanguage, openAssistant, configureAssistantModel, configureOllamaCustomModel, newChat, sendChat, shot, record, trackCreated, saveResults, type ScenarioStatus, isGateVisible, clickGateSeeDetails, isBatchReviewVisible, batchCardCount, batchCardSummaryTexts } from './harness.mts'
import { batchCardAction } from './harness2.mts'

const THINKING_MODEL = 'qwen3:8b'
const VISION_MODEL = 'qwen2.5vl:3b'

async function main() {
  const { browser, page } = await launch()
  try {
    await login(page)
    await setDashboardLanguage(page, 'Norsk')
    await configureOllamaCustomModel(page, THINKING_MODEL, VISION_MODEL)
    await openAssistant(page)
    await configureAssistantModel(page, { provider: 'local', thinkingModel: THINKING_MODEL, visionModel: VISION_MODEL, posture: 'auto' })

    await newChat(page)
    const { reply, trace } = await sendChat(page, 'Legg til tre nye batterier: Retry Card A for 500 kr, Retry Card B for 600 kr, Retry Card C for 700 kr', { timeoutMs: 240000 })
    const gate = await isGateVisible(page)
    if (gate) {
      await clickGateSeeDetails(page)
      await page.waitForTimeout(800)
    }
    const batch = await isBatchReviewVisible(page)
    const count = batch ? await batchCardCount(page) : 0
    const beforeShot = await shot(page, 'C-3-retry-before')

    let confirmOk = false, editOk = false, removeOk = false
    let confirmShot = '', editShot = '', removeShot = ''
    let errorNote = ''
    try {
      if (batch && count >= 3) {
        const namesBefore = await batchCardSummaryTexts(page)
        await batchCardAction(page, 0, 'confirm')
        await page.waitForTimeout(1500)
        confirmOk = true
        trackCreated('product', 'Retry Card A', 'Batterier (batch C.3 retry)')
        confirmShot = await shot(page, 'C-3-retry-after-confirm')
        const remainingAfterConfirm = await batchCardCount(page)
        console.log(`After confirm: ${remainingAfterConfirm} cards remain (was ${count}). Names before: ${JSON.stringify(namesBefore.map(s => s.split('\n')[0]))}`)

        await page.waitForTimeout(500)
        await batchCardAction(page, 0, 'edit')
        await page.waitForTimeout(800)
        editShot = await shot(page, 'C-3-retry-after-edit')
        editOk = (await page.locator('#product-name').count()) > 0
        if (editOk) {
          await page.getByRole('button', { name: 'Lagre', exact: true }).click()
          await page.waitForTimeout(1000)
          trackCreated('product', 'Retry Card B', 'Batterier (batch C.3 retry)')
        }
        const remainingBefore = await batchCardCount(page)
        await batchCardAction(page, 0, 'remove')
        await page.waitForTimeout(500)
        const remainingAfter = await batchCardCount(page)
        removeOk = remainingAfter < remainingBefore
        removeShot = await shot(page, 'C-3-retry-after-remove')
      }
    } catch (err) {
      errorNote = err instanceof Error ? err.message : String(err)
      await shot(page, 'C-3-retry-ERROR')
    }

    record({
      id: 'C.3',
      title: 'Per-card actions (confirm/edit/remove independence) [isolated retry]',
      phase: 'C',
      status: confirmOk && editOk && removeOk ? 'PASS' : errorNote ? 'PARTIAL' : batch ? 'PARTIAL' : 'FAIL',
      notes: `gate=${gate}. batch=${batch} count=${count}. confirmOk=${confirmOk} editOk=${editOk} removeOk=${removeOk}.${errorNote ? ` Error during sequence: ${errorNote}` : ''}`,
      evidence: { gate, batch, count, confirmOk, editOk, removeOk, errorNote },
      trace,
      screenshot: errorNote ? confirmShot || beforeShot : removeShot || editShot || confirmShot || beforeShot,
    })
    saveResults()
    console.log('=== C.3 ISOLATED RETRY COMPLETE ===')
  } catch (err) {
    console.error('C.3 RETRY FAILED (fatal):', err)
    await shot(page, 'c3fix-FATAL')
    process.exitCode = 1
  } finally {
    await browser.close()
  }
}

main()
