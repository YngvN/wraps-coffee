import productsSeed from '../data/products.json'
import type { Product } from '../types/product'
import { useLocalStorage } from './useLocalStorage'

const STORAGE_KEY = 'admin.products'

/** Returns the live product catalogue and a setter that persists edits to localStorage, overlaying `products.json` until a real backend exists. */
export function useProducts() {
  return useLocalStorage<Product[]>(STORAGE_KEY, productsSeed as Product[])
}
