import { launch, login, setDashboardLanguage, openCatalogue, deleteProductInCategory } from './harness.mts'
async function main() {
  const { browser, page } = await launch()
  try {
    await login(page)
    await setDashboardLanguage(page, 'Norsk')
    await openCatalogue(page, 'Matmeny')
    await page.waitForTimeout(600)
    await deleteProductInCategory(page, 'Salater', 'Vegetar-bowl')
    console.log('[deleted] product "Vegetar-bowl" (Matmeny -> Salater)')
  } finally {
    await browser.close()
  }
}
main()
