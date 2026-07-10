import type { OrderRecord } from '../types/order'
import { useLocalStorage } from './useLocalStorage'

const STORAGE_KEY = 'admin.orders'

/** Returns the live list of online orders and a setter that persists edits (e.g. changing status) to localStorage. Orders themselves only ever arrive via the Neon bridge pulling real submissions down from the public website — there's no local seed data, and no way to create one from this dashboard. */
export function useOrders() {
  return useLocalStorage<OrderRecord[]>(STORAGE_KEY, [])
}
