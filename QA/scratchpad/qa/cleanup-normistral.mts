// Cleans up records the normistral-it:7b retest's own scenarios created on top of the AutoDeler
// seed — the seed catalogue itself (AutoDeler: 7 categories, 54 products, 1 event) is intentionally
// LEFT IN PLACE per the user's own request, so a future re-test doesn't need to re-seed.
import { launch, login, deleteProductInCategory, deleteCategoryByName, gotoDashboard, exact, waitForSyncFlush } from './harness.mts'

async function main() {
  const { browser, page } = await launch()
  try {
    await login(page)

    // AutoDeler -> Dekk: scenario-created products, seed's own "Michelin Vinterdekk"/"Dekk Del N" left alone.
    await gotoDashboard(page, 'products')
    await page.waitForTimeout(800)
    for (const name of ['Continental Sommerdekk', 'Gate Confirm Dekk', 'Gate Edit Dekk', 'Manuell Test Dekk']) {
      try {
        await deleteProductInCategory(page, 'Dekk', name)
        console.log(`[deleted] product "${name}" (Dekk)`)
      } catch (err) {
        console.log(`[skip] product "${name}" (Dekk) — not found or already gone`)
      }
    }

    // Brembo Sportbrems landed in the blank/unnamed catalogue, uncategorized — open that catalogue
    // directly and delete it from its own product list (no category section to expand into).
    await gotoDashboard(page, 'products')
    await page.waitForTimeout(600)
    const blankCatalogueItem = page.locator('.products-view__item-open').filter({ has: page.locator('.products-view__item-name', { hasText: exact('') }) }).first()
    if (await blankCatalogueItem.count()) {
      await blankCatalogueItem.click({ force: true })
      await page.waitForTimeout(500)
      const bremboRow = page.locator('.products-view__item').filter({ has: page.locator('.products-view__item-name', { hasText: /Brembo Sportbrems/i }) }).first()
      if (await bremboRow.count()) {
        await bremboRow.getByRole('button', { name: 'Slett', exact: true }).click()
        await waitForSyncFlush(page)
        console.log('[deleted] product "Brembo Sportbrems" (blank catalogue, uncategorized)')
      } else {
        console.log('[skip] "Brembo Sportbrems" not found in blank catalogue')
      }
    }

    // "Verktøy" category landed in Matmeny/food-menu instead of AutoDeler — deleting it here cascades
    // its own (empty) product list; Matmeny's real 7 categories are untouched.
    await gotoDashboard(page, 'products')
    await page.waitForTimeout(600)
    const matmenyItem = page.locator('.products-view__item-open', { hasText: exact('Matmeny') }).first()
    if (await matmenyItem.count()) {
      await matmenyItem.click({ force: true })
      await page.waitForTimeout(500)
      try {
        await deleteCategoryByName(page, 'Verktøy')
        console.log('[deleted] category "Verktøy" (Matmeny)')
      } catch {
        console.log('[skip] category "Verktøy" not found in Matmeny')
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
