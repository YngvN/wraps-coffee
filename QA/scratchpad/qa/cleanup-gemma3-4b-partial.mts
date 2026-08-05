// Cleans up real records left behind by the first (pre-reachBatchReview-fix) gemma3:4b run attempt,
// verified against server/data/*.json directly before writing this list — not the run's own
// self-report (B.10 claimed deleted=true for Continental Sommerdekk but it was still present).
// Note: all three AI-created products actually landed in "Tilbehør", not "Dekk" — a real finding,
// not a typo here.
import { launch, login, setDashboardLanguage, openCatalogue, deleteProductInCategory, deleteCategoryByName } from './harness.mts'

async function main() {
  const { browser, page } = await launch()
  try {
    await login(page)
    await setDashboardLanguage(page, 'Norsk')
    await page.waitForTimeout(500)

    await openCatalogue(page, 'AutoDeler')
    await page.waitForTimeout(600)
    for (const name of ['Continental Sommerdekk', 'Gate Confirm Dekk', 'Gate Edit Dekk']) {
      try {
        await deleteProductInCategory(page, 'Tilbehør', name)
        console.log(`[deleted] product "${name}" (Tilbehør)`)
      } catch (err) {
        console.log(`[skip] product "${name}" (Tilbehør) — not found or already gone: ${err instanceof Error ? err.message.split('\n')[0] : err}`)
      }
    }

    await openCatalogue(page, 'AutoDeler')
    await page.waitForTimeout(600)
    try {
      await deleteProductInCategory(page, 'Dekk', 'Manuell Test Dekk')
      console.log('[deleted] product "Manuell Test Dekk" (Dekk)')
    } catch {
      console.log('[skip] product "Manuell Test Dekk" (Dekk) — not found or already gone')
    }

    await openCatalogue(page, 'AutoDeler')
    await page.waitForTimeout(600)
    try {
      await deleteCategoryByName(page, 'Verktøy')
      console.log('[deleted] category "Verktøy" (AutoDeler)')
    } catch {
      console.log('[skip] category "Verktøy" not found in AutoDeler')
    }

    console.log('=== PARTIAL CLEANUP COMPLETE ===')
  } catch (err) {
    console.error('CLEANUP FAILED:', err)
    process.exitCode = 1
  } finally {
    await browser.close()
  }
}

main()
