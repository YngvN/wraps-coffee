// Cleans up every real record the qwen3:8b run (2026-08-04, multi-model cycle) created on top of
// AutoDeler/Matmeny, verified directly against server/data/*.json before writing this list.
import { launch, login, setDashboardLanguage, openCatalogue, deleteProductInCategory, deleteCategoryByName, deleteEventByTitle } from './harness.mts'

async function main() {
  const { browser, page } = await launch()
  try {
    await login(page)
    await setDashboardLanguage(page, 'Norsk')
    await page.waitForTimeout(500)

    await openCatalogue(page, 'AutoDeler')
    await page.waitForTimeout(600)
    // Two "Continental Sommerdekk" rows exist (a harness bug — see the report's own Key Findings) —
    // delete twice to remove both.
    for (const name of ['Continental Sommerdekk', 'Continental Sommerdekk', 'Gate Confirm Dekk', 'Gate Edit Dekk', 'Manuell Test Dekk', 'sommerdekk', 'vinterdekk', 'piggdekk']) {
      try {
        await deleteProductInCategory(page, 'Dekk', name)
        console.log(`[deleted] product "${name}" (Dekk)`)
      } catch (err) {
        console.log(`[skip] product "${name}" (Dekk): ${err instanceof Error ? err.message.split('\n')[0] : err}`)
      }
    }

    await openCatalogue(page, 'AutoDeler')
    await page.waitForTimeout(600)
    try {
      await deleteProductInCategory(page, 'Bremser', 'Brembo Sportbrems')
      console.log('[deleted] product "Brembo Sportbrems" (Bremser)')
    } catch {
      console.log('[skip] product "Brembo Sportbrems" (Bremser)')
    }

    await openCatalogue(page, 'AutoDeler')
    await page.waitForTimeout(600)
    for (const name of ['Card Test A', 'Card Test B', 'Bosch 60Ah']) {
      try {
        await deleteProductInCategory(page, 'Batterier', name)
        console.log(`[deleted] product "${name}" (Batterier)`)
      } catch {
        console.log(`[skip] product "${name}" (Batterier)`)
      }
    }

    await openCatalogue(page, 'AutoDeler')
    await page.waitForTimeout(600)
    for (const name of ['Pioneer Høyttaler', 'Sony Forsterker']) {
      try {
        await deleteProductInCategory(page, 'Lydanlegg', name)
        console.log(`[deleted] product "${name}" (Lydanlegg)`)
      } catch {
        console.log(`[skip] product "${name}" (Lydanlegg)`)
      }
    }

    // "Verktøy" landed in Matmeny, not AutoDeler — the still-present catalogueId bias (see report).
    await openCatalogue(page, 'Matmeny')
    await page.waitForTimeout(600)
    try {
      await deleteCategoryByName(page, 'Verktøy')
      console.log('[deleted] category "Verktøy" (Matmeny)')
    } catch {
      console.log('[skip] category "Verktøy" (Matmeny)')
    }

    for (const title of ['Sommertreff', 'Vintertreff']) {
      try {
        await deleteEventByTitle(page, title)
        console.log(`[deleted] event "${title}"`)
      } catch {
        console.log(`[skip] event "${title}"`)
      }
    }

    console.log('=== CLEANUP COMPLETE ===')
  } catch (err) {
    console.error('CLEANUP FAILED:', err)
    process.exitCode = 1
  } finally {
    await browser.close()
  }
}

main()
