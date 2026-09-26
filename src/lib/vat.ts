/**
 * Norwegian VAT (merverdiavgift) for register sales. Prices are entered including VAT; this works out
 * the rate a line is sold at and how a total splits into basis and VAT, in øre (integers), so receipts,
 * X/Z reports and the SAF-T export all add up to the same øre.
 */
import type { VatCategory } from '../types/product'
import type { Serving } from './registerPricing'

export const VAT_CATEGORIES: VatCategory[] = ['food', 'standard', 'exempt']

/** The VAT rate in percent for a product in `category` sold for `serving`. */
export function vatRatePercent(category: VatCategory | undefined, serving: Serving): number {
  if (category === 'exempt') return 0
  if (category === 'standard') return 25
  return serving === 'eatIn' ? 25 : 15
}

/** Kroner (as entered on products and orders) to øre, rounded to the nearest øre. */
export function toOre(kroner: number): number {
  return Math.round(kroner * 100)
}

/**
 * The VAT inside `grossOre` (a price including VAT) at `ratePercent`, rounded to the nearest øre. A
 * negative amount (a return) rounds exactly like the positive one, so a full return cancels its sale's
 * VAT to the øre.
 */
export function vatOfGross(grossOre: number, ratePercent: number): number {
  const vat = Math.round((Math.abs(grossOre) * ratePercent) / (100 + ratePercent))
  return grossOre < 0 ? -vat : vat
}

/** One VAT rate's share of a sale or report. */
export interface VatLine {
  ratePercent: number
  /** Amount excluding VAT. */
  basisOre: number
  vatOre: number
  /** Amount including VAT. */
  grossOre: number
}

/**
 * Totals per VAT rate, highest rate first. VAT is computed once per rate on that rate's gross total
 * (not per line and then added), so rounding never drifts from what a receipt's lines add up to.
 */
export function vatBreakdown(lines: { grossOre: number; ratePercent: number }[]): VatLine[] {
  const gross = new Map<number, number>()
  for (const line of lines) gross.set(line.ratePercent, (gross.get(line.ratePercent) ?? 0) + line.grossOre)
  return [...gross.entries()]
    .sort(([a], [b]) => b - a)
    .map(([ratePercent, grossOre]) => {
      const vatOre = vatOfGross(grossOre, ratePercent)
      return { ratePercent, basisOre: grossOre - vatOre, vatOre, grossOre }
    })
}
