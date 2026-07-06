import categoryPricesSeed from '../data/categoryPrices.json'
import type { CategoryPrices } from '../types/product'
import { useLocalStorage } from './useLocalStorage'

const STORAGE_KEY = 'admin.categoryPrices'

/** Returns each category's live default price and a setter that persists edits to localStorage, overlaying `categoryPrices.json` until a real backend exists. */
export function useCategoryPrices() {
  return useLocalStorage<CategoryPrices>(STORAGE_KEY, categoryPricesSeed as CategoryPrices)
}
