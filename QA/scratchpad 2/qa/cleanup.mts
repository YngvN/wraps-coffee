import { readFileSync, writeFileSync } from 'node:fs'
import {
  launch,
  login,
  setDashboardLanguage,
  openProducts,
  openCatalogue,
  deleteProductInCategory,
  deleteCategoryByName,
  deleteCatalogueByName,
  deleteEventByTitle,
  gotoDashboard,
  shot,
  RESULTS_PATH,
} from './harness.mts'

interface CreatedEntry {
  type: string
  name: string
  note?: string
}

async function main() {
  const data = JSON.parse(readFileSync(RESULTS_PATH, 'utf-8')) as { created: CreatedEntry[] }
  const created = data.created

  const { browser, page } = await launch()
  const failures: { entry: CreatedEntry; error: string }[] = []
  try {
    await login(page)
    await setDashboardLanguage(page, 'Norsk')

    // Deleting a category cascades to delete its own products (`handleDeleteCategory`
    // in CategoriesView.tsx filters `products` by category id) — so tracked products
    // don't need individual deletion at all, as long as every category they live in
    // is itself deleted below. Products are only tracked in `created` for the report's
    // own bookkeeping (which record ended up where), not because cleanup needs them.
    const products = created.filter((c) => c.type === 'product')
    console.log(`${products.length} tracked products will be removed via their category's own cascade delete below (not deleted individually).`)
    await openCatalogue(page, 'AutoDeler')

    // Categories (the original 7 seed categories + Dekkhotell/Sesonglager/Verktøy/etc created during scenarios).
    const categories = created.filter((c) => c.type === 'category')
    console.log(`Deleting ${categories.length} tracked categories...`)
    await openProducts(page)
    await openCatalogue(page, 'AutoDeler')
    for (const c of categories) {
      try {
        await deleteCategoryByName(page, c.name)
        console.log(`  deleted category "${c.name}"`)
      } catch (err) {
        console.error(`  FAILED to delete category "${c.name}":`, err instanceof Error ? err.message : err)
        failures.push({ entry: c, error: String(err) })
      }
    }

    // Then the catalogues themselves (AutoDeler + the blank-named second one).
    const catalogues = created.filter((c) => c.type === 'catalogue')
    console.log(`Deleting ${catalogues.length} tracked catalogues...`)
    for (const cat of catalogues) {
      try {
        if (cat.name) {
          await deleteCatalogueByName(page, cat.name)
        } else {
          // blank-named catalogue: use openCatalogue('') to find + confirm, then delete from the list
          await openProducts(page)
          const items = page.locator('.products-view__item')
          const n = await items.count()
          let done = false
          for (let i = 0; i < n; i++) {
            const text = (await items.nth(i).locator('.products-view__item-name').innerText().catch(() => '')).trim()
            if (text === '') {
              await items.nth(i).getByRole('button', { name: 'Slett', exact: true }).click()
              done = true
              break
            }
          }
          if (!done) throw new Error('blank-named catalogue not found for deletion')
        }
        console.log(`  deleted catalogue "${cat.name || '(blank)'}"`)
      } catch (err) {
        console.error(`  FAILED to delete catalogue "${cat.name || '(blank)'}":`, err instanceof Error ? err.message : err)
        failures.push({ entry: cat, error: String(err) })
      }
    }

    // Events.
    const events = created.filter((c) => c.type === 'event')
    console.log(`Deleting ${events.length} tracked events...`)
    for (const e of events) {
      try {
        await deleteEventByTitle(page, e.name)
        console.log(`  deleted event "${e.name}"`)
      } catch (err) {
        console.error(`  FAILED to delete event "${e.name}":`, err instanceof Error ? err.message : err)
        failures.push({ entry: e, error: String(err) })
      }
    }

    // Secondary sanity check: final counts.
    await gotoDashboard(page, 'products')
    await page.waitForTimeout(800)
    const cataloguesRemaining = await page.locator('.products-view__item-name').allInnerTexts()
    await shot(page, 'cleanup-final-catalogues')

    console.log('=== CLEANUP SUMMARY ===')
    console.log('Remaining catalogues:', JSON.stringify(cataloguesRemaining))
    console.log('Failures:', failures.length)
    for (const f of failures) console.log('  -', f.entry.type, f.entry.name, '=>', f.error.slice(0, 200))

    writeFileSync(
      RESULTS_PATH.replace('results.json', 'cleanup-report.json'),
      JSON.stringify({ deleted: created.length - failures.length, total: created.length, failures, cataloguesRemaining }, null, 2),
    )
  } finally {
    await browser.close()
  }
}

main().catch((err) => {
  console.error('CLEANUP FATAL:', err)
  process.exitCode = 1
})
