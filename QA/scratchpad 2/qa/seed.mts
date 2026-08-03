import {
  launch,
  login,
  setDashboardLanguage,
  configureOllamaCustomModel,
  openAssistant,
  configureAssistantModel,
  addCatalogue,
  openCatalogue,
  addCategory,
  addProductToCategory,
  addEvent,
  shot,
  saveResults,
  type ProductSpec,
} from './harness.mts'

const CATEGORY_COUNTS: Record<string, number> = {
  Dekk: 9,
  Bremser: 4,
  Motorolje: 13,
  Batterier: 9,
  Lydanlegg: 3,
  Interiør: 13,
  Tilbehør: 3,
}

function fillerProducts(category: string, total: number, specials: string[]): ProductSpec[] {
  const out: ProductSpec[] = []
  let n = 1
  for (let i = 0; i < total - specials.length; i++) {
    out.push({ name: `${category} Del ${n}`, priceMode: 'flat', price: 199 + n * 10 })
    n++
  }
  return out
}

export async function seedAll(page: import('playwright').Page) {
  console.log('=== SETUP ===')
  await login(page)
  await setDashboardLanguage(page, 'Norsk')
  await configureOllamaCustomModel(page, 'gemma3:4b')
  await openAssistant(page)
  await configureAssistantModel(page, { provider: 'local', thinkingModel: 'gemma3:4b', visionModel: 'gemma3:4b', posture: 'auto' })
  await shot(page, 'seed-setup-done')

  console.log('=== CATALOGUE: AutoDeler ===')
  await addCatalogue(page, 'AutoDeler')
  await openCatalogue(page, 'AutoDeler')

  console.log('=== CATEGORY: Dekk (custom field Dekkdimensjon) ===')
  await addCategory(page, 'Dekk', { customFields: [{ name: 'Dekkdimensjon' }] })
  for (const spec of fillerProducts('Dekk', CATEGORY_COUNTS.Dekk, ['Michelin'])) {
    await addProductToCategory(page, 'Dekk', spec)
  }
  await addProductToCategory(page, 'Dekk', {
    name: 'Michelin Vinterdekk 205/55R16',
    priceMode: 'dual',
    priceTakeaway: 1499,
    priceEatIn: 1599,
    discountMode: 'percentage',
    discountValue: 20,
  })
  await shot(page, 'seed-dekk-done')

  console.log('=== CATEGORY: Bremser ===')
  await addCategory(page, 'Bremser')
  for (const spec of fillerProducts('Bremser', CATEGORY_COUNTS.Bremser, [])) await addProductToCategory(page, 'Bremser', spec)

  console.log('=== CATEGORY: Motorolje ===')
  await addCategory(page, 'Motorolje')
  for (const spec of fillerProducts('Motorolje', CATEGORY_COUNTS.Motorolje, [])) await addProductToCategory(page, 'Motorolje', spec)

  console.log('=== CATEGORY: Batterier ===')
  await addCategory(page, 'Batterier')
  for (const spec of fillerProducts('Batterier', CATEGORY_COUNTS.Batterier, [])) await addProductToCategory(page, 'Batterier', spec)

  console.log('=== CATEGORY: Lydanlegg ===')
  await addCategory(page, 'Lydanlegg')
  for (const spec of fillerProducts('Lydanlegg', CATEGORY_COUNTS.Lydanlegg, [])) await addProductToCategory(page, 'Lydanlegg', spec)

  console.log('=== CATEGORY: Interiør (Frontlys #1, 2 LED, fillers) ===')
  await addCategory(page, 'Interiør')
  for (const spec of fillerProducts('Interiør', CATEGORY_COUNTS.Interiør, ['Frontlys', 'LED1', 'LED2'])) await addProductToCategory(page, 'Interiør', spec)
  await addProductToCategory(page, 'Interiør', { name: 'Frontlys', priceMode: 'flat', price: 349 })
  await addProductToCategory(page, 'Interiør', { name: 'LED Headlight Bulb H7', priceMode: 'flat', price: 249 })
  await addProductToCategory(page, 'Interiør', { name: 'LED Interior Strip', priceMode: 'flat', price: 179 })

  console.log('=== CATEGORY: Tilbehør (Frontlys #2, 1 LED, filler) ===')
  await addCategory(page, 'Tilbehør')
  for (const spec of fillerProducts('Tilbehør', CATEGORY_COUNTS.Tilbehør, ['Frontlys', 'LED3'])) await addProductToCategory(page, 'Tilbehør', spec)
  await addProductToCategory(page, 'Tilbehør', { name: 'Frontlys', priceMode: 'flat', price: 429 })
  await addProductToCategory(page, 'Tilbehør', { name: 'LED Fog Light', priceMode: 'flat', price: 299 })

  console.log('=== SECOND CATALOGUE: blank name, blank category, 0 products ===')
  await addCatalogue(page, null, { allowBlank: true })
  // the newly created blank catalogue opens for editing via the modal close; navigate back to products and open it
  await openCatalogue(page, '')
  await addCategory(page, null, { allowBlank: true })

  console.log('=== EVENT: Bilutstilling på tunet ===')
  const future = new Date()
  future.setDate(future.getDate() + 30)
  const dateStr = future.toISOString().slice(0, 10)
  await addEvent(page, { titleNo: 'Bilutstilling på tunet', category: 'Utstilling', date: dateStr, startTime: '12:00', endTime: '16:00', address: 'Torget 1' })

  await shot(page, 'seed-all-done')
  saveResults()
  console.log('=== SEED COMPLETE ===')
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { browser, page } = await launch()
  try {
    await seedAll(page)
  } catch (err) {
    console.error('SEED FAILED:', err)
    await shot(page, 'seed-FAILED')
    process.exitCode = 1
  } finally {
    await browser.close()
  }
}
