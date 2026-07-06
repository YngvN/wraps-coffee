import type { Price } from '../types/product'

/** Formats a `Price` as a single "X kr" or dual "X / Y kr" string, via the given translator. */
export function formatPrice(price: Price, t: (key: string, vars?: Record<string, string | number>) => string): string {
  return typeof price === 'number' ? t('menu.price', { price }) : t('menu.priceDual', { takeaway: price.takeaway, eatIn: price.eatIn })
}
