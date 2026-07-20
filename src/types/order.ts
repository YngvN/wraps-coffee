/** An online order's lifecycle, tracked by the cafe as it's prepared. */
export type OrderStatus = 'received' | 'accepted' | 'preparing' | 'ready' | 'completed' | 'cancelled'

/** Where an order originated. `undefined` on an `OrderRecord` means `'website'` — the only source before delivery-platform integrations existed — so no existing website-order mapping code (e.g. `server/neonMappers.ts`'s `pullOrders`) needs to set it explicitly. */
export type OrderSource = 'website' | 'wolt' | 'foodora'

/** One line item of an order — name/price are snapshotted at order time, independent of the live product catalogue. */
export interface OrderItem {
  itemID: string
  name: string
  quantity: number
  unitPrice: number
}

/** An order shown in the admin Orders view — either placed on the public website and pulled down via the Neon bridge (see `server/neonBridge.ts`), or synced from a delivery platform like Wolt or Foodora (see `server/woltPoller.ts`/`server/foodoraPoller.ts`). Only `status` is ever edited here — every other field belongs to the order's original submission. */
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
  /** Where this order came from — see `OrderSource`. Absent means `'website'`. */
  source?: OrderSource
  /** This order's own id on its source platform (e.g. Wolt's order id), when `source` isn't `'website'` — needed to push a status change back to that platform, since `id` here may be locally generated to avoid collisions across sources. */
  externalId?: string
}
