/**
 * An X or Z report for one cash register (kassasystemforskrifta § 2-8-2 / § 2-8-3), as the server
 * computes it from the journal (`server/register/reports.ts`) and the register shows and prints it.
 * Amounts are in øre.
 */
import type { VatLine } from '../lib/vat'

export interface Totals {
  count: number
  amountOre: number
}

export interface RegisterReport {
  kind: 'X' | 'Z'
  /** Z only: its number in the register's series. */
  zNumber?: number
  register: number
  /** When the period began (just after the last Z), or `null` for the register's first period. */
  from: string | null
  to: string
  /** Sales receipts: how many, and their gross total. */
  sales: Totals
  /** Sales per product group (units and gross amount). */
  byGroup: { id: string; name: string; count: number; amountOre: number }[]
  /** Payments per method, sales and refunds together (refunds negative). */
  byPayment: { method: string; count: number; amountOre: number }[]
  /** Sales per staff member. */
  byOperator: { staffId: string; name?: string; count: number; amountOre: number }[]
  /** VAT basis and amount per rate, sales minus returns. */
  vat: VatLine[]
  /** The opening float counted into the drawer this period, if any. */
  floatOre: number | null
  drawerOpenings: number
  copies: Totals
  proFormas: Totals
  returns: Totals
  discounts: Totals
  voids: Totals
  lineCorrections: { removed: Totals; decreased: Totals }
  priceInquiries: number
  deliveries: Totals
  training: Totals
  tipsOre: number
  /** Sales minus returns this period. */
  netOre: number
  /** Cash that should be in the drawer: the float, plus cash sales, minus cash refunds. */
  expectedCashOre: number
  /** Since the register was first used, never reset. */
  grandTotal: { salesOre: number; returnsOre: number; netOre: number }
  /** Z only: the cash staff counted in the drawer, and how far it was off `expectedCashOre` (counted − expected). */
  cashCount?: { countedOre: number; differenceOre: number }
}
