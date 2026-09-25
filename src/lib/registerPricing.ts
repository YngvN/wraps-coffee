/**
 * Turns a register cart (product ids + quantities) into a priced order, using the live product list.
 * Shared by the server, which is authoritative (the tablet never sends a price or a status, so a stale
 * or tampered client can't sell at the wrong price or skip the kitchen), and the Register page, which
 * uses the very same rules to show the total staff will be asked to confirm.
 */
import type { Catalogue } from '../types/category'
import type { OrderItem, OrderRecord, OrderStatus } from '../types/order'
import type { CategoryPrices, Price, Product } from '../types/product'
import { getEffectivePrice } from '../utils/price'
import { defaultPriceForProduct } from '../utils/productCatalogue'
import { isProductOutOfStock } from '../utils/productStock'

/** Whether the customer takes the order away or eats in — picks the matching half of a dual `Price`. */
export type Serving = 'takeaway' | 'eatIn'

/** One cart line as the tablet sends it. */
export interface CartLineInput {
  productId: string
  quantity: number
  /** Staff confirmed selling a product the stock count says is sold out (the count can drift from the shelf). */
  allowSoldOut?: boolean
}

/** The product data pricing reads. */
export interface PricingCatalogue {
  products: Product[]
  catalogues: Catalogue[]
  categoryPrices: CategoryPrices
}

/** A cart that priced cleanly. */
export interface PricedCart {
  items: OrderItem[]
  totalPrice: number
  /** Ids of the lines handed over at the counter (`Product.readyToServe`). */
  servedAtCounter: string[]
  /** Where the order starts on the kanban — see `initialRegisterStatus`. */
  status: OrderStatus
}

/** Why a cart couldn't be priced; `productId` names the offending line when there is one. */
export type PricingError = { reason: 'empty' | 'badQuantity' | 'unknownProduct' | 'noPrice' | 'soldOut'; productId?: string }

/** Largest quantity accepted on one line — a typo guard, not a business rule. */
export const MAX_LINE_QUANTITY = 99

/** Picks the half of `price` that matches `serving`. */
function pickAmount(price: Price, serving: Serving): number {
  return typeof price === 'number' ? price : price[serving]
}

/** What one of `product` costs right now for `serving` — its own price or its category/catalogue default, with any discount applied. `undefined` when it has no price at all. */
export function unitPriceFor(product: Product, catalogue: PricingCatalogue, serving: Serving): number | undefined {
  const effective = getEffectivePrice(product.price ?? defaultPriceForProduct(product, catalogue.catalogues, catalogue.categoryPrices), product.discount)
  return effective ? pickAmount(effective.discounted ?? effective.original, serving) : undefined
}

/**
 * The kanban placement rule: an order made *only* of ready-to-serve items was handed over at the
 * counter, so it goes straight to History (`completed`) — `ready` would leave it in Done waiting for a
 * tap nobody makes. Anything that needs making starts in Incoming (`received`), so the kitchen's
 * chime and flash fire as for any other new order.
 */
export function initialRegisterStatus(products: Product[]): OrderStatus {
  return products.length > 0 && products.every((product) => product.readyToServe === true) ? 'completed' : 'received'
}

/** Prices `lines` against the live catalogue. Duplicate lines for one product are merged. */
export function priceCart(lines: CartLineInput[], catalogue: PricingCatalogue, serving: Serving): { ok: true; cart: PricedCart } | ({ ok: false } & PricingError) {
  if (lines.length === 0) return { ok: false, reason: 'empty' }

  const merged = new Map<string, CartLineInput>()
  for (const line of lines) {
    if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > MAX_LINE_QUANTITY) return { ok: false, reason: 'badQuantity', productId: line.productId }
    const existing = merged.get(line.productId)
    merged.set(line.productId, {
      productId: line.productId,
      quantity: (existing?.quantity ?? 0) + line.quantity,
      allowSoldOut: Boolean(existing?.allowSoldOut || line.allowSoldOut),
    })
  }

  const items: OrderItem[] = []
  const soldProducts: Product[] = []
  for (const line of merged.values()) {
    if (line.quantity > MAX_LINE_QUANTITY) return { ok: false, reason: 'badQuantity', productId: line.productId }
    const product = catalogue.products.find((candidate) => candidate.itemID === line.productId)
    if (!product) return { ok: false, reason: 'unknownProduct', productId: line.productId }
    if (isProductOutOfStock(product) && !line.allowSoldOut) return { ok: false, reason: 'soldOut', productId: line.productId }
    const unitPrice = unitPriceFor(product, catalogue, serving)
    if (unitPrice === undefined) return { ok: false, reason: 'noPrice', productId: line.productId }
    items.push({ itemID: product.itemID, name: product.name.no || product.name.en, quantity: line.quantity, unitPrice })
    soldProducts.push(product)
  }

  return {
    ok: true,
    cart: {
      items,
      totalPrice: items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
      servedAtCounter: soldProducts.filter((product) => product.readyToServe === true).map((product) => product.itemID),
      status: initialRegisterStatus(soldProducts),
    },
  }
}

/** The local calendar day of an ISO timestamp, as `YYYY-MM-DD` in the server's own time zone. */
function localDay(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
}

/** The next counter number for today ("K1", "K2", …) — restarts every day, counting only register orders created today. */
export function nextDisplayNumber(existing: OrderRecord[], now: Date): string {
  const today = localDay(now)
  const highest = existing
    .filter((order) => order.displayNumber && localDay(new Date(order.createdAt)) === today)
    .reduce((max, order) => Math.max(max, Number(order.displayNumber?.slice(1)) || 0), 0)
  return `K${highest + 1}`
}
