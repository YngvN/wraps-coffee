/**
 * An X or Z report as a SAF-T `eventReport`, in the schema's order, from the report the register
 * journaled when it was taken (`RegisterReport`, see `server/register/reports.ts`). Return totals are
 * written as positive amounts, as in Skatteetaten's example file; fields the register doesn't have
 * (price inquiries, other corrections, delivery receipts) are written as zero, since they're required.
 * The schema also wants at least one row per art group, payment and VAT rate, so a report with no sales
 * (a Z after a quiet day) gets a single zero row in each.
 */
import type { RegisterReport } from '../../src/types/registerReport'
import { formatSignedAmount } from '../journal/signing'
import { el, group, saftId, type XmlNode } from './xml'

const money = (ore: number) => formatSignedAmount(ore)

/** `rows`, or just `zero` when there are none — for the groups the schema requires a row in. */
const orZero = <Row>(rows: Row[], zero: Row): Row[] => (rows.length > 0 ? rows : [zero])

export interface ReportContext {
  orgNumber: string
  companyName: string
  registerID: string
  /** The report's date and time (Oslo). */
  date: string
  time: string
  /** SAF-T payment `basicID` per payment method. */
  paymentType: (method: string) => string
  /** SAF-T VAT code per rate. */
  vatCode: (ratePercent: number) => string
}

/** The `eventReport` element for one journaled report. */
export function eventReport(report: RegisterReport, context: ReportContext): XmlNode {
  const zeroRow = (container: string, row: string, type: string, num: string, amount: string, name: string) =>
    group(container, [group(row, [el(type, name), el(num, 0), el(amount, money(0))])])
  return group('eventReport', [
    el('reportID', report.kind === 'Z' ? report.zNumber : 0),
    el('reportType', report.kind === 'Z' ? 'Z report' : 'X report'),
    el('companyIdent', context.orgNumber),
    el('companyName', context.companyName),
    el('reportDate', context.date),
    el('reportTime', context.time),
    el('registerID', context.registerID),
    group('reportTotalCashSales', [el('totalCashSaleAmnt', money(report.sales.amountOre))]),
    group(
      'reportArtGroups',
      orZero(report.byGroup, { id: '', name: '', count: 0, amountOre: 0 }).map((artGroup) =>
        group('reportArtGroup', [el('artGroupID', saftId(artGroup.id || 'NONE')), el('artGroupNum', artGroup.count), el('artGroupAmnt', money(artGroup.amountOre))]),
      ),
    ),
    group(
      'reportPayments',
      orZero(report.byPayment, { method: 'cash', count: 0, amountOre: 0 }).map((payment) =>
        group('reportPayment', [el('paymentType', context.paymentType(payment.method)), el('paymentNum', payment.count), el('paymentAmnt', money(payment.amountOre))]),
      ),
    ),
    group('reportTip', [el('tipNum', 0), el('tipAmnt', money(report.tipsOre))]),
    group(
      'reportCashSalesVat',
      orZero(report.vat, { ratePercent: 25, basisOre: 0, vatOre: 0, grossOre: 0 }).map((vat) =>
        group('reportCashSaleVat', [
          el('vatCode', context.vatCode(vat.ratePercent)),
          el('vatPerc', vat.ratePercent.toFixed(2)),
          el('cashSaleAmnt', money(vat.basisOre)),
          el('vatAmnt', money(vat.vatOre)),
          el('vatAmntTp', vat.vatOre < 0 ? 'D' : 'C'),
        ]),
      ),
    ),
    el('reportOpeningChangeFloat', money(report.floatOre ?? 0)),
    el('reportReceiptNum', report.sales.count),
    el('reportOpenCashBoxNum', report.drawerOpenings),
    el('reportReceiptCopyNum', report.copies.count),
    el('reportReceiptCopyAmnt', money(report.copies.amountOre)),
    el('reportReceiptProformaNum', report.proFormas.count),
    el('reportReceiptProformaAmnt', money(report.proFormas.amountOre)),
    el('reportReturnNum', report.returns.count),
    el('reportReturnAmnt', money(Math.abs(report.returns.amountOre))),
    el('reportDiscountNum', report.discounts.count),
    el('reportDiscountAmnt', money(report.discounts.amountOre)),
    el('reportVoidTransNum', report.voids.count),
    el('reportVoidTransAmnt', money(report.voids.amountOre)),
    group('reportCorrLines', [
      group('reportCorrLine', [
        el('corrLineType', 'Delete line'),
        el('corrLineNum', report.lineCorrections.removed.count),
        el('corrLineAmnt', money(report.lineCorrections.removed.amountOre)),
      ]),
      group('reportCorrLine', [
        el('corrLineType', 'Reduce quantity'),
        el('corrLineNum', report.lineCorrections.decreased.count),
        el('corrLineAmnt', money(report.lineCorrections.decreased.amountOre)),
      ]),
    ]),
    zeroRow('reportPriceInquiries', 'reportPriceInquiry', 'priceInquiryGroup', 'priceInquiryNum', 'priceInquiryAmnt', 'None'),
    zeroRow('reportOtherCorrs', 'reportOtherCorr', 'otherCorrType', 'otherCorrNum', 'otherCorrAmnt', 'None'),
    el('reportReceiptDeliveryNum', report.deliveries.count),
    el('reportReceiptDeliveryAmnt', money(report.deliveries.amountOre)),
    el('reportTrainingNum', report.training.count),
    el('reportTrainingAmnt', money(report.training.amountOre)),
    el('reportGrandTotalSales', money(report.grandTotal.salesOre)),
    el('reportGrandTotalReturn', money(Math.abs(report.grandTotal.returnsOre))),
    el('reportGrandTotalSalesNet', money(report.grandTotal.netOre)),
  ])
}
