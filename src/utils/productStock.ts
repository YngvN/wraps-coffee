import type { Product } from '../types/product'

/** The single source of truth for whether a product should render as sold out — `trackStock` on takes over entirely (a live count of 0 or less means sold out, regardless of the manual checkbox), otherwise falls back to the plain `outOfStock` checkbox exactly as before this existed. */
export function isProductOutOfStock(product: Product): boolean {
  if (product.trackStock) return (product.stockQuantity ?? 0) <= 0
  return product.outOfStock ?? false
}
