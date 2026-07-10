/** An online order's lifecycle, tracked by the cafe as it's prepared. */
export type OrderStatus = 'received' | 'accepted' | 'preparing' | 'ready' | 'completed' | 'cancelled'

/** One line item of an order — name/price are snapshotted at order time, independent of the live product catalogue. */
export interface OrderItem {
  itemID: string
  name: string
  quantity: number
  unitPrice: number
}

/** An online order placed on the public website, pulled down via the Neon bridge (see `server/neonBridge.ts`) and shown in the admin Orders view. Only `status` is ever edited here — every other field belongs to the customer's original submission. */
export interface OrderRecord {
  id: string
  items: OrderItem[]
  totalPrice: number
  customerName: string
  customerPhone: string
  pickupTime: string
  notes?: string
  status: OrderStatus
  /** ISO date-time string of when the order was placed. */
  createdAt: string
}
