// Diagnostic rerun for B.9/B.10. The original run found `select_item` correctly resolved down to one
// candidate for both "update price" and "delete", but the pipeline then produced no reply, no review,
// and no destructive-confirm UI. That original run also (via a harness bug in B.9's own "already"
// check) left TWO identical "Continental Sommerdekk" rows in Dekk instead of one — this script first
// collapses that back to a single row, then resends both messages fresh, to isolate whether B.9/B.10's
// stall was caused by the accidental duplicate (two identically-named candidates) or is a real,
// duplicate-independent app/model issue.
import { launch, login, setDashboardLanguage, openAssistant, configureAssistantModel, configureOllamaCustomModel, newChat, sendChat, shot, record, trackCreated, untrackCreated, saveResults, type ScenarioStatus, isGateVisible, clickGateSeeDetails, isSingleReviewVisible, singleReviewText, clickReviewConfirm, getDestructiveConfirmPhrase, typeDestructiveConfirm, clickDestructiveConfirm, openCatalogue, expandCategorySection, deleteProductInCategory } from './harness.mts'

const THINKING_MODEL = 'qwen3:8b'
const VISION_MODEL = 'qwen2.5vl:3b'

async function run(id: string, title: string, phase: string, fn: () => Promise<{ status: ScenarioStatus; notes: string; evidence?: Record<string, unknown>; trace?: string[]; screenshot?: string }>) {
  try {
    const r = await fn()
    record({ id, title, phase, ...r })
  } catch (err) {
    record({ id, title, phase, status: 'ERROR', notes: `Harness exception: ${err instanceof Error ? err.stack ?? err.message : String(err)}` })
  }
}

async function main() {
  const { browser, page } = await launch()
  try {
    await login(page)
    await setDashboardLanguage(page, 'Norsk')
    await configureOllamaCustomModel(page, THINKING_MODEL, VISION_MODEL)

    // Collapse the accidental duplicate back to exactly one "Continental Sommerdekk" in Dekk.
    await openCatalogue(page, 'AutoDeler')
    await page.waitForTimeout(600)
    const section = await expandCategorySection(page, 'Dekk')
    const dupCount = await section.locator('.products-view__item-name', { hasText: /Continental Sommerdekk/i }).count()
    if (dupCount > 1) {
      await deleteProductInCategory(page, 'Dekk', 'Continental Sommerdekk')
      untrackCreated('product', 'Continental Sommerdekk')
      console.log(`[cleanup] removed 1 duplicate "Continental Sommerdekk" (${dupCount} -> ${dupCount - 1})`)
    }

    await openAssistant(page)
    await configureAssistantModel(page, { provider: 'local', thinkingModel: THINKING_MODEL, visionModel: VISION_MODEL, posture: 'auto' })

    await run('B.9', 'Update product price via chat [duplicate-free rerun]', 'B', async () => {
      await newChat(page)
      const { reply, trace } = await sendChat(page, 'Endre prisen på Continental Sommerdekk til 1350 kr')
      if (await isGateVisible(page)) await clickGateSeeDetails(page)
      const reviewText = await singleReviewText(page)
      const screenshot = await shot(page, 'B-9-dupfix')
      let confirmed = false
      if (await isSingleReviewVisible(page)) {
        await clickReviewConfirm(page)
        await page.waitForTimeout(1000)
        confirmed = true
      }
      return {
        status: confirmed ? 'CAPTURED' : 'FAIL',
        notes: `With only one "Continental Sommerdekk" candidate (duplicate removed first). Reply: "${reply}". Review text: "${reviewText.slice(0, 300)}". confirmed=${confirmed}. Verify real price against admin data, not this self-report.`,
        evidence: { reply, reviewText, confirmed },
        trace,
        screenshot,
      }
    })

    await run('B.10', 'Delete product via chat [duplicate-free rerun]', 'B', async () => {
      await newChat(page)
      const { reply, trace } = await sendChat(page, 'Slett dekket Continental Sommerdekk')
      const screenshot1 = await shot(page, 'B-10-dupfix-confirm')
      const phrase = await getDestructiveConfirmPhrase(page)
      let deleted = false
      if (phrase) {
        await typeDestructiveConfirm(page, phrase)
        await clickDestructiveConfirm(page)
        await page.waitForTimeout(1000)
        deleted = true
      }
      const screenshot2 = await shot(page, 'B-10-dupfix-after')
      return {
        status: phrase ? 'CAPTURED' : 'FAIL',
        notes: `With only one "Continental Sommerdekk" candidate. Reply: "${reply}". Required confirm phrase read from UI: "${phrase}". deleted=${deleted}.`,
        evidence: { reply, phrase, deleted },
        trace,
        screenshot: screenshot2,
      }
    })

    saveResults()
    console.log('=== B.9/B.10 DUPLICATE-FREE RERUN COMPLETE ===')
  } catch (err) {
    console.error('B.9/B.10 RERUN FAILED (fatal):', err)
    await shot(page, 'b9b10fix-FATAL')
    process.exitCode = 1
  } finally {
    await browser.close()
  }
}

main()
