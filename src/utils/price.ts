import type { Discount, Price } from '../types/product'

/** Formats a `Price` as a single "X kr" or dual "X / Y kr" string, via the given translator. */
export function formatPrice(price: Price, t: (key: string, vars?: Record<string, string | number>) => string): string {
  return typeof price === 'number' ? t('menu.price', { price }) : t('menu.priceDual', { takeaway: price.takeaway, eatIn: price.eatIn })
}

/** Applies `discount` to one amount, rounded to the nearest whole krone (matching every existing price in this app, always a whole number) and never let below 0. */
function discountOne(amount: number, discount: Discount): number {
  const raw = discount.type === 'percentage' ? amount * (1 - discount.percentage / 100) : amount - discount.amount
  return Math.max(0, Math.round(raw))
}

/** Applies `discount` to `price`, discounting each side of a dual takeaway/eat-in price independently (so a discounted dual price stays a dual price, each half reduced on its own, rather than collapsing to one number). */
export function applyDiscount(price: Price, discount: Discount): Price {
  return typeof price === 'number' ? discountOne(price, discount) : { takeaway: discountOne(price.takeaway, discount), eatIn: discountOne(price.eatIn, discount) }
}

/** A product's resolved price alongside its discounted price if any — `discounted` is `null` (not omitted) when there's no discount, so a caller can tell "no discount" apart from "no price at all" (that case returns `undefined` outright). */
export interface EffectivePrice {
  original: Price
  discounted: Price | null
}

/** Resolves what a product should actually show: `price` (its own override, or the caller-supplied category default) plus its discounted price if `discount` is set. Returns `undefined` when there's no price to show at all (an item with no own price and no category default). */
export function getEffectivePrice(price: Price | undefined, discount: Discount | undefined): EffectivePrice | undefined {
  if (price === undefined) return undefined
  return { original: price, discounted: discount ? applyDiscount(price, discount) : null }
}
