import type { OrderRecord } from '../types/order'
import { useLocalStorage } from './useLocalStorage'

const STORAGE_KEY = 'admin.registerOrders'

/** Returns the live list of counter sales taken on a Register pane, synced across devices. Orders here are only ever created by the server's register checkout (`server/register/`), never written whole from a client: a status change goes through `pushDisplayOrderStatus` from the board, like every other order. */
export function useRegisterOrders() {
  return useLocalStorage<OrderRecord[]>(STORAGE_KEY, [])
}
