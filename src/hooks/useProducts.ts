import productsSeed from '../data/products.json'
import type { Product } from '../types/product'
import { useLocalStorage } from './useLocalStorage'

const STORAGE_KEY = 'admin.products'

/** Normalizes one persisted product — defaults `dietaryTags` to an empty array for records saved before that field existed (an already-running server or an already-synced browser can still be holding one), so no consumer has to guard against it being `undefined` itself. */
function normalizeProduct(product: Product): Product {
  return { ...product, dietaryTags: product.dietaryTags ?? [] }
}

/** Returns the live product catalogue and a setter that persists edits to localStorage, overlaying `products.json` until a real backend exists. */
export function useProducts() {
  const [products, setProducts] = useLocalStorage<Product[]>(STORAGE_KEY, productsSeed as Product[])
  return [products.map(normalizeProduct), setProducts] as const
}
