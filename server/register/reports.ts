/**
 * X and Z reports (kassasystemforskrifta § 2-8-2 and § 2-8-3), computed from the journal alone — a
 * pure function of the entries, so a report can always be rebuilt and checked. A report covers one
 * cash register from just after its last Z report until now; an X report changes nothing, a Z report
 * closes that period (the next one starts after it) and carries a running number. Grand totals (sales,
 * returns and net since the register was first used) run across all periods and are never reset.
 *
 * Fields the register doesn't have yet (discounts, tips, delivery receipts, price inquiries) are
 * reported as zero, as the regulation asks for them whether or not they occur.
 */
import { vatBreakdown } from '../../src/lib/vat'
import type { RegisterReport, Totals } from '../../src/types/registerReport'
import type { JournalEntry } from '../../src/types/journal'

const zero = (): Totals => ({ count: 0, amountOre: 0 })
const add = (totals: Totals, amountOre: number, count = 1) => {
  totals.count += count
  totals.amountOre += amountOre
}

type Line = { quantity: number; unitPriceOre: number | null; vatRate?: number; group?: { id: string; name: string } }
type Payment = { method: string; amountOre: number }

/** The seq of the register's last Z report, or 0 when it has none. */
export function lastZSeq(entries: JournalEntry[], register: number): number {
  return entries.reduce((last, entry) => (entry.register === register && entry.type === 'zReport' ? entry.seq : last), 0)
}

/** How many Z reports the register has had. */
export function zCount(entries: JournalEntry[], register: number): number {
  return entries.filter((entry) => entry.register === register && entry.type === 'zReport').length
}

/** The report for `register` over its current period (see the module comment). */
export function buildRegisterReport(entries: JournalEntry[], register: number, kind: 'X' | 'Z', now: Date): RegisterReport {
  const mine = entries.filter((entry) => entry.register === register)
  const since = lastZSeq(entries, register)
  const period = mine.filter((entry) => entry.seq > since)
  const report: RegisterReport = {
    kind,
    zNumber: kind === 'Z' ? zCount(entries, register) + 1 : undefined,
    register,
    from: since ? (mine.find((entry) => entry.seq === since)?.at ?? null) : null,
    to: now.toISOString(),
    sales: zero(),
    byGroup: [],
    byPayment: [],
    byOperator: [],
    vat: [],
    floatOre: null,
    drawerOpenings: 0,
    copies: zero(),
    proFormas: zero(),
    returns: zero(),
    discounts: zero(),
    voids: zero(),
    lineCorrections: { removed: zero(), decreased: zero() },
    priceInquiries: 0,
    deliveries: zero(),
    training: zero(),
    tipsOre: 0,
    netOre: 0,
    expectedCashOre: 0,
    grandTotal: { salesOre: 0, returnsOre: 0, netOre: 0 },
  }
  const groups = new Map<string, { id: string; name: string; count: number; amountOre: number }>()
  const payments = new Map<string, { method: string; count: number; amountOre: number }>()
  const operators = new Map<string, { staffId: string; count: number; amountOre: number }>()
  const vatLines: { grossOre: number; ratePercent: number }[] = []
  let cashOre = 0

  for (const entry of period) {
    const data = entry.data as { totalOre?: number; amountOre?: number; lines?: Line[]; payments?: Payment[]; correction?: string }
    const amount = entry.signed?.amountInOre ?? 0
    switch (entry.type) {
      case 'sale':
      case 'return': {
        if (entry.type === 'sale') {
          add(report.sales, amount)
          const operator = operators.get(entry.actor ?? '') ?? { staffId: entry.actor ?? '', count: 0, amountOre: 0 }
          add(operator, amount)
          operators.set(operator.staffId, operator)
          for (const line of data.lines ?? []) {
            const group = line.group ?? { id: '', name: '' }
            const bucket = groups.get(group.id) ?? { ...group, count: 0, amountOre: 0 }
            add(bucket, (line.unitPriceOre ?? 0) * line.quantity, line.quantity)
            groups.set(group.id, bucket)
          }
        } else add(report.returns, amount)
        const sign = entry.type === 'return' ? -1 : 1
        for (const line of data.lines ?? []) vatLines.push({ grossOre: sign * (line.unitPriceOre ?? 0) * line.quantity, ratePercent: line.vatRate ?? 0 })
        for (const payment of data.payments ?? []) {
          const bucket = payments.get(payment.method) ?? { method: payment.method, count: 0, amountOre: 0 }
          add(bucket, payment.amountOre)
          payments.set(payment.method, bucket)
          if (payment.method === 'cash') cashOre += payment.amountOre
        }
        break
      }
      case 'copy':
        add(report.copies, data.amountOre ?? amount)
        break
      case 'proForma':
        add(report.proFormas, data.amountOre ?? amount)
        break
      case 'trainingSale':
        add(report.training, amount)
        break
      case 'void':
        add(report.voids, data.amountOre ?? 0)
        break
      case 'lineCorrection':
        add(data.correction === 'removed' ? report.lineCorrections.removed : report.lineCorrections.decreased, data.amountOre ?? 0)
        break
      case 'discount':
        add(report.discounts, data.amountOre ?? 0)
        break
      case 'drawerOpen':
        report.drawerOpenings++
        break
      case 'float':
        report.floatOre = (report.floatOre ?? 0) + (data.amountOre ?? 0)
        break
    }
  }

  for (const entry of mine) {
    if (entry.type === 'sale') report.grandTotal.salesOre += entry.signed?.amountInOre ?? 0
    if (entry.type === 'return') report.grandTotal.returnsOre += entry.signed?.amountInOre ?? 0
  }
  report.grandTotal.netOre = report.grandTotal.salesOre + report.grandTotal.returnsOre
  report.byGroup = [...groups.values()].sort((a, b) => b.amountOre - a.amountOre)
  report.byPayment = [...payments.values()]
  report.byOperator = [...operators.values()]
  report.vat = vatBreakdown(vatLines)
  report.netOre = report.sales.amountOre + report.returns.amountOre
  report.expectedCashOre = (report.floatOre ?? 0) + cashOre
  return report
}
