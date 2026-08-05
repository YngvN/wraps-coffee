// Cleans up every real record the gemma3:4b run (2026-08-04) created on top of AutoDeler/Matmeny,
// verified directly against server/data/*.json before writing this list, not the run's own
// self-report (B.10 claimed deleted=true for Continental Sommerdekk but it was still present both
// times this was checked). AutoDeler (54 products/7 categories) and Matmeny's own 7 categories are
// left untouched.
import { launch, login, setDashboardLanguage, openCatalogue, deleteProductInCategory, deleteCategoryByName, deleteEventByTitle } from './harness.mts'

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
        console.log(`[skip] product "${name}" (Tilbehør): ${err instanceof Error ? err.message.split('\n')[0] : err}`)
      }
    }

    await openCatalogue(page, 'AutoDeler')
    await page.waitForTimeout(600)
    try {
      await deleteProductInCategory(page, 'Dekk', 'Manuell Test Dekk')
      console.log('[deleted] product "Manuell Test Dekk" (Dekk)')
    } catch {
      console.log('[skip] product "Manuell Test Dekk" (Dekk)')
    }

    // C.3/C.4's own batch fill fabricated category names as product names — real leftovers are
    // literally named "Batterier" and "Lydanlegg", not the requested "Card Test A"/"Pioneer Høyttaler".
    await openCatalogue(page, 'AutoDeler')
    await page.waitForTimeout(600)
    try {
      await deleteProductInCategory(page, 'Batterier', 'Batterier')
      console.log('[deleted] product "Batterier" (Batterier) — fabricated category-name-as-product-name from C.3/C.4')
    } catch {
      console.log('[skip] product "Batterier" (Batterier)')
    }

    await openCatalogue(page, 'AutoDeler')
    await page.waitForTimeout(600)
    try {
      await deleteProductInCategory(page, 'Lydanlegg', 'Lydanlegg')
      console.log('[deleted] product "Lydanlegg" (Lydanlegg) — fabricated category-name-as-product-name from C.3/C.4')
    } catch {
      console.log('[skip] product "Lydanlegg" (Lydanlegg)')
    }

    await openCatalogue(page, 'AutoDeler')
    await page.waitForTimeout(600)
    try {
      await deleteCategoryByName(page, 'Verktøy')
      console.log('[deleted] category "Verktøy" (AutoDeler)')
    } catch {
      console.log('[skip] category "Verktøy" (AutoDeler)')
    }

    await openCatalogue(page, 'Matmeny')
    await page.waitForTimeout(600)
    try {
      await deleteProductInCategory(page, 'Salater', 'Vegetar-bowl')
      console.log('[deleted] product "Vegetar-bowl" (Matmeny → Salater)')
    } catch {
      console.log('[skip] product "Vegetar-bowl" (Matmeny → Salater)')
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
