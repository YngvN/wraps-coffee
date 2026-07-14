import type { Discount, Price } from '../types/product'
import { applyDiscount, formatPrice } from '../utils/price'
import './DiscountedPrice.scss'

interface DiscountedPriceProps {
  price: Price
  discount?: Discount
  t: (key: string, vars?: Record<string, string | number>) => string
}

/**
 * Renders a product's price — plain, or (when `discount` is set) its
 * original price struck through beside the new discounted price, e.g.
 * "~~189 kr~~ 151 kr". Doesn't render the box-shadow "discounted" highlight
 * itself — that's the caller's own row/card wrapper, since its shape (an
 * admin list `<li>`, a kiosk menu-section `<li>`) differs by context.
 */
export function DiscountedPrice({ price, discount, t }: DiscountedPriceProps) {
  if (!discount) return <span className="discounted-price">{formatPrice(price, t)}</span>

  const discounted = applyDiscount(price, discount)
  return (
    <span className="discounted-price discounted-price--discounted">
      <span className="discounted-price__original">{formatPrice(price, t)}</span>
      <span className="discounted-price__new">{formatPrice(discounted, t)}</span>
    </span>
  )
}
