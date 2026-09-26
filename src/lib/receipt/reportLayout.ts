/**
 * Prints an X or Z report (kassasystemforskrifta § 2-8-2 / § 2-8-3) on a receipt printer: the business
 * (name, organisation number), which report and — for a Z — its number, the register, the period, and
 * every total the regulation lists, including those that are zero. The heading ("X-rapport" /
 * "Z-rapport") is Norwegian whatever `language`; the other labels follow it.
 */
import { translate, type LanguageCode } from '../../i18n/translate'
import type { RegisterReport, Totals } from '../../types/registerReport'
import type { StoreLegalDetails } from '../../types/storeSettings'
import { formatOrgNumber } from '../orgNumber'
import { osloDate, osloTime } from '../osloTime'
import { EscPosBuilder } from './escpos'
import { formatOre } from './legalReceipt'
import { charsPerLine, twoColumns } from './receiptLayout'

export interface ReportPrintContext {
  legal: StoreLegalDetails
  storeName: string
  register: { number: number; name: string }
  printedBy: string
  /** Set when this is a reprint from the dashboard: it's marked as a copy. */
  copy?: boolean
}

function stamp(iso: string): string {
  const date = new Date(iso)
  const [year, month, day] = osloDate(date).split('-')
  return `${day}.${month}.${year} ${osloTime(date)}`
}

/** One report as a ready-to-send ESC/POS job. */
export function buildReportPrint(report: RegisterReport, context: ReportPrintContext, options: { language: LanguageCode; paperWidthMm: 58 | 80 }): Uint8Array {
  const t = (key: string, vars?: Record<string, string | number>) => translate(options.language, `report.${key}`, vars)
  const width = charsPerLine(options.paperWidthMm)
  const rule = '-'.repeat(width)
  const money = (ore: number) => formatOre(ore, options.language)
  const printer = new EscPosBuilder().init()
  const row = (label: string, value: string) => twoColumns(label, value, width).forEach((line) => printer.line(line))
  const totals = (label: string, value: Totals) => row(`${label} (${value.count})`, money(value.amountOre))
  const section = (title: string) => printer.line(rule).bold(true).line(title).bold(false)

  printer.align('center').bold(true).size(2, 2)
  if (context.copy) printer.line('KOPI')
  printer.line(report.kind === 'Z' ? `Z-rapport nr. ${report.zNumber}` : 'X-rapport')
  printer
    .size(1, 1)
    .line(context.storeName || context.legal.companyName)
    .bold(false)
  printer.line(context.legal.companyName).line(`Org.nr. ${formatOrgNumber(context.legal.orgNumber)}${context.legal.vatRegistered ? ' MVA' : ''}`)
  printer.align('left').line(rule)
  row(t('register'), `${context.register.name} (${t('registerNumber', { number: context.register.number })})`)
  row(t('from'), report.from ? stamp(report.from) : t('firstPeriod'))
  row(t('to'), stamp(report.to))
  row(t('printedBy'), context.printedBy)

  section(t('salesHeading'))
  totals(t('sales'), report.sales)
  totals(t('returns'), report.returns)
  row(t('net'), money(report.netOre))

  section(t('byGroup'))
  for (const group of report.byGroup) row(`${group.name || t('noGroup')} (${group.count})`, money(group.amountOre))

  section(t('byPayment'))
  for (const payment of report.byPayment) row(`${translate(options.language, `receipt.method.${payment.method}`)} (${payment.count})`, money(payment.amountOre))

  section(t('byOperator'))
  for (const operator of report.byOperator) row(`${operator.name ?? operator.staffId} (${operator.count})`, money(operator.amountOre))

  section(t('vatHeading'))
  for (const vat of report.vat) row(t('vatLine', { rate: vat.ratePercent, basis: money(vat.basisOre) }), money(vat.vatOre))
  row(t('vatTotal'), money(report.vat.reduce((sum, vat) => sum + vat.vatOre, 0)))

  section(t('cashHeading'))
  row(t('float'), money(report.floatOre ?? 0))
  row(t('expectedCash'), money(report.expectedCashOre))
  if (report.cashCount) {
    row(t('countedCash'), money(report.cashCount.countedOre))
    row(t('difference'), money(report.cashCount.differenceOre))
  }
  row(t('drawerOpenings'), String(report.drawerOpenings))

  section(t('countsHeading'))
  totals(t('receipts'), report.sales)
  totals(t('copies'), report.copies)
  totals(t('proFormas'), report.proFormas)
  totals(t('returnReceipts'), report.returns)
  totals(t('discounts'), report.discounts)
  totals(t('voids'), report.voids)
  totals(t('correctionsRemoved'), report.lineCorrections.removed)
  totals(t('correctionsDecreased'), report.lineCorrections.decreased)
  row(t('priceInquiries'), String(report.priceInquiries))
  totals(t('deliveries'), report.deliveries)
  totals(t('training'), report.training)
  row(t('tips'), money(report.tipsOre))

  section(t('grandTotalHeading'))
  row(t('grandSales'), money(report.grandTotal.salesOre))
  row(t('grandReturns'), money(report.grandTotal.returnsOre))
  row(t('grandNet'), money(report.grandTotal.netOre))

  return printer.feed(4).cut().bytes()
}
