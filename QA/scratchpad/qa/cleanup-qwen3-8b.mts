// Cleans up every record this test cycle's scenarios created on top of the AutoDeler/food-menu seed.
// AutoDeler itself (7 categories, 54 products) and food-menu's own original 7 categories are left
// untouched, per standing policy — verified against server/data/*.json before and after, not this
// script's own self-report.
import { launch, login, setDashboardLanguage, openCatalogue, deleteProductInCategory, deleteCategoryByName, deleteEventByTitle } from './harness.mts'

async function main() {
  const { browser, page } = await launch()
  try {
    await login(page)
    await setDashboardLanguage(page, 'Norsk')
    await page.waitForTimeout(500)

    await openCatalogue(page, 'AutoDeler')
    await page.waitForTimeout(600)
    for (const name of [
      'Continental Sommerdekk',
      'Gate Confirm Dekk',
      'Gate Edit Dekk',
      'Manuell Test Dekk',
      'sommerdekk',
      'vinterdekk',
      'piggdekk',
    ]) {
      try {
        await deleteProductInCategory(page, 'Dekk', name)
        console.log(`[deleted] product "${name}" (Dekk)`)
      } catch (err) {
        console.log(`[skip] product "${name}" (Dekk) — not found or already gone: ${err instanceof Error ? err.message.split('\n')[0] : err}`)
      }
    }

    await openCatalogue(page, 'AutoDeler')
    await page.waitForTimeout(600)
    for (const name of ['Brembo Sportbrems']) {
      try {
        await deleteProductInCategory(page, 'Bremser', name)
        console.log(`[deleted] product "${name}" (Bremser)`)
      } catch (err) {
        console.log(`[skip] product "${name}" (Bremser) — not found or already gone`)
      }
    }

    await openCatalogue(page, 'AutoDeler')
    await page.waitForTimeout(600)
    for (const name of ['Card Test A', 'Bosch 60Ah', 'Retry Card A']) {
      try {
        await deleteProductInCategory(page, 'Batterier', name)
        console.log(`[deleted] product "${name}" (Batterier)`)
      } catch (err) {
        console.log(`[skip] product "${name}" (Batterier) — not found or already gone`)
      }
    }

    await openCatalogue(page, 'AutoDeler')
    await page.waitForTimeout(600)
    for (const name of ['Pioneer Høyttaler', 'Sony Forsterker']) {
      try {
        await deleteProductInCategory(page, 'Lydanlegg', name)
        console.log(`[deleted] product "${name}" (Lydanlegg)`)
      } catch (err) {
        console.log(`[skip] product "${name}" (Lydanlegg) — not found or already gone`)
      }
    }

    // "Verktøy" category landed in Matmeny/food-menu instead of AutoDeler (the run's own documented
    // catalogue-placement bug) — delete it from there; Matmeny's real 7 categories are untouched.
    await openCatalogue(page, 'Matmeny')
    await page.waitForTimeout(600)
    try {
      await deleteCategoryByName(page, 'Verktøy')
      console.log('[deleted] category "Verktøy" (Matmeny)')
    } catch {
      console.log('[skip] category "Verktøy" not found in Matmeny')
    }

    for (const title of ['Sommertreff', 'Vintertreff']) {
      try {
        await deleteEventByTitle(page, title)
        console.log(`[deleted] event "${title}"`)
      } catch (err) {
        console.log(`[skip] event "${title}" — not found or already gone`)
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
