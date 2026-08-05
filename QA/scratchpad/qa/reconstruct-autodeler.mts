// Reconstructs AutoDeler's Batterier (9) and Lydanlegg (3) categories after a cleanup-script bug
// (QA/scratchpad/qa/cleanup-gemma3-4b.mts) deleted both whole categories instead of the 2 garbage
// test products it targeted. Names are the REAL original names, recovered from this run's own A.9b
// evidence (a full store listing captured before the deletion happened) — only the prices are
// reconstructed placeholders (the original prices were never captured), matching the ~10-20kr-step
// pattern seen on the surviving "Del N" categories (Dekk Del 1-8: 209-279kr). Per the user: AutoDeler
// is the sacrificial QA test catalogue, not production data, so placeholder prices are acceptable.
import { launch, login, setDashboardLanguage, openCatalogue, addCategory, addProductToCategory } from './harness.mts'

async function main() {
  const { browser, page } = await launch()
  try {
    await login(page)
    await setDashboardLanguage(page, 'Norsk')
    await page.waitForTimeout(500)

    await openCatalogue(page, 'AutoDeler')
    await page.waitForTimeout(600)
    await addCategory(page, 'Batterier')
    console.log('[created] category "Batterier"')
    await openCatalogue(page, 'AutoDeler')
    await page.waitForTimeout(600)
    await addCategory(page, 'Lydanlegg')
    console.log('[created] category "Lydanlegg"')

    await openCatalogue(page, 'AutoDeler')
    await page.waitForTimeout(600)
    const batterierPrices = [349, 369, 389, 409, 429, 449, 469, 489, 509]
    for (let i = 0; i < 9; i++) {
      const name = `Batterier Del ${i + 1}`
      await addProductToCategory(page, 'Batterier', { name, priceMode: 'flat', price: batterierPrices[i] })
      console.log(`[created] ${name} — ${batterierPrices[i]} kr`)
    }

    await openCatalogue(page, 'AutoDeler')
    await page.waitForTimeout(600)
    const lydanleggPrices = [599, 649, 699]
    for (let i = 0; i < 3; i++) {
      const name = `Lydanlegg Del ${i + 1}`
      await addProductToCategory(page, 'Lydanlegg', { name, priceMode: 'flat', price: lydanleggPrices[i] })
      console.log(`[created] ${name} — ${lydanleggPrices[i]} kr`)
    }

    console.log('=== RECONSTRUCTION COMPLETE ===')
  } catch (err) {
    console.error('RECONSTRUCTION FAILED:', err)
    process.exitCode = 1
  } finally {
    await browser.close()
  }
}

main()
