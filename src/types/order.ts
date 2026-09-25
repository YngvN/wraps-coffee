/** An online order's lifecycle, tracked by the cafe as it's prepared. */
export type OrderStatus = 'received' | 'accepted' | 'preparing' | 'ready' | 'completed' | 'cancelled'

/** Where an order originated. `undefined` on an `OrderRecord` means `'website'` — the only source before delivery-platform integrations existed — so no existing website-order mapping code (e.g. `server/neonMappers.ts`'s `pullOrders`) needs to set it explicitly. `'register'` is a counter sale taken on the Register pane (see `server/register/`), stored in its own `admin.registerOrders` key and never sent to the website. */
export type OrderSource = 'website' | 'wolt' | 'foodora' | 'register'

/** One line item of an order — name/price are snapshotted at order time, independent of the live product catalogue. */
export interface OrderItem {
  itemID: string
  name: string
  quantity: number
  unitPrice: number
}

/** How a customer paid. `card`/`vipps` without a `provider` were recorded by hand at the register ("Paid by card") because no payment provider is configured yet. */
export type PaymentMethod = 'card' | 'cash' | 'vipps'

/** The payment integration that took a payment, when one did — see `server/payments/`. */
export type PaymentProviderId = 'zettle' | 'vipps'

/** How a register order was paid — only ever set on `source: 'register'` orders. */
export interface OrderPayment {
  method: PaymentMethod
  /** Absent when staff recorded the payment by hand. */
  provider?: PaymentProviderId
  /** The provider's own payment reference, for looking the payment up there later. */
  reference?: string
  /** NOK actually paid — equal to the order's `totalPrice`. */
  amount: number
  /** ISO date-time string of when the payment was recorded. */
  paidAt: string
}

/** An order shown in the admin Orders view — either placed on the public website and pulled down via the Neon bridge (see `server/neonBridge.ts`), synced from a delivery platform like Wolt or Foodora (see `server/woltPoller.ts`/`server/foodoraPoller.ts`), or taken at the counter on a Register pane. Only `status` is ever edited here — every other field belongs to the order's original submission. */
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
  /** Website orders only: the secret half of the customer's pickup QR code (`WRAPS-PICKUP:<id>:<code>`), pulled from Neon's `orders.pickup_code`. Scanning that QR at the register completes the order (see `server/register/pickup.ts`). Absent on orders placed before pickup codes existed. */
  pickupCode?: string
  /** Register orders only: a short per-day number the customer is called by, e.g. `"K12"`. */
  displayNumber?: string
  /** Register orders only: the tablet's own id for this checkout, so a retried or double-tapped Pay returns the order already created instead of a second one. */
  clientOrderId?: string
  /** Register orders only: how it was paid. */
  payment?: OrderPayment
  /** Register orders only: ids of the items that were handed over at the counter (`Product.readyToServe`), so the kitchen card can show them as already served. */
  servedAtCounter?: string[]
  /** ISO date-time string of when the customer's name, phone and notes were cleared by the 7-day retention rule (see `src/utils/orderRetention.ts`). */
  anonymisedAt?: string
}
