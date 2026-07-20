import type { OrderRecord } from '../types/order'
import { useLocalStorage } from './useLocalStorage'

const STORAGE_KEY = 'admin.foodoraOrders'

/** Returns the live list of Foodora delivery orders and a setter that persists edits, synced across devices. Orders here only ever arrive via the local server's own background poller (`server/foodoraPoller.ts`), which fully replaces this list on every successful sync — there's no local seed data, and no way to create one from this dashboard. A status change here should also go through `pushFoodoraOrderStatus` (`src/lib/localServer.ts`), not just this setter, so the change reaches Foodora too — see `OrdersView.tsx`'s `updateStatus`. */
export function useFoodoraOrders() {
  return useLocalStorage<OrderRecord[]>(STORAGE_KEY, [])
}
