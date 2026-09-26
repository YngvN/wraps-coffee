/**
 * The register's legal receipts (kassasystemforskrifta § 2-8), built from what the journal recorded
 * for the sale — never from the live product list:
 *
 * - **Salgskvittering** (sales receipt): seller's name, organisation number with "MVA", address, the
 *   receipt's number, date and time, cash register and cashier, every line, the total, VAT per rate and
 *   how it was paid;
 * - **KOPI**: the same, headed "KOPI" in letters at least 50 % larger than the amounts, at most once;
 * - **Foreløpig kvittering – IKKE KVITTERING FOR KJØP** (pro forma): a bill before payment, marked
 *   the same way, in its own number series;
 * - **Returkvittering** (return, § 2-8-5): the same content as a sale, with negative amounts, naming
 *   the sales receipt it reverses and the reason, in its own number series;
 * - **Treningskvittering – IKKE KVITTERING FOR KJØP** (training mode, § 2-8-6): a practice sale, marked
 *   in large type at the top and bottom, in its own number series.
 *
 * The legal headings are Norwegian whatever `language` is; the other labels follow it. Amounts are
 * printed at normal size and the headings at double size, which is what makes them "50 % larger".
 */
import { translate, type LanguageCode } from '../../i18n/translate'
import type { PaymentMethod } from '../../types/order'
import type { StoreLegalDetails } from '../../types/storeSettings'
import { formatOrgNumber } from '../orgNumber'
import { osloDate, osloTime } from '../osloTime'
import type { VatLine } from '../vat'
import { EscPosBuilder } from './escpos'
import { charsPerLine, twoColumns, wrapText } from './receiptLayout'

export type LegalReceiptKind = 'sale' | 'copy' | 'proForma' | 'return' | 'training'

/** Everything a legal receipt prints. Amounts are in øre. */
export interface LegalReceiptData {
  kind: LegalReceiptKind
  legal: StoreLegalDetails
  storeName: string
  register: { number: number; name: string }
  cashier: string
  /** The receipt's number in its own series (for a copy: the copy's number). */
  receiptNumber: number
  /** A copy: the number of the sales receipt it copies. A return: the sales receipt it reverses. */
  originalReceiptNumber?: number
  /** A return only: why, already in the receipt's language, and any note. */
  returnReason?: string
  /** When the sale (or pro forma) happened. */
  at: Date
  /** When this copy was printed. */
  printedAt?: Date
  /** The number called out for the order ("K12"). */
  displayNumber?: string
  lines: { name: string; quantity: number; unitPriceOre: number; vatRate: number }[]
  totalOre: number
  vat: VatLine[]
  payments: { method: PaymentMethod; amountOre: number; reference?: string }[]
}

/** The legal headings, fixed in Norwegian (§ 2-8-4 to § 2-8-6). */
export const LEGAL_HEADINGS = {
  sale: 'Salgskvittering',
  copy: 'KOPI',
  proForma: 'Foreløpig kvittering – IKKE KVITTERING FOR KJØP',
  return: 'Returkvittering',
  training: 'Treningskvittering – IKKE KVITTERING FOR KJØP',
} as const

/** Øre as kroner with two decimals: 14900 → "149,00" in Norwegian, "149.00" in English. */
export function formatOre(ore: number, language: LanguageCode): string {
  const sign = ore < 0 ? '-' : ''
  const abs = Math.abs(ore)
  return `${sign}${Math.floor(abs / 100)}${language === 'no' ? ',' : '.'}${String(abs % 100).padStart(2, '0')}`
}

/** `dd.MM.yyyy HH:mm:ss` in Norwegian time. */
function osloStamp(date: Date): string {
  const [year, month, day] = osloDate(date).split('-')
  return `${day}.${month}.${year} ${osloTime(date)}`
}

/** Builds one legal receipt as a ready-to-send ESC/POS job. */
export function buildLegalReceipt(data: LegalReceiptData, options: { language: LanguageCode; paperWidthMm: 58 | 80 }): Uint8Array {
  const { language } = options
  const t = (key: string, vars?: Record<string, string | number>) => translate(language, `receipt.${key}`, vars)
  const width = charsPerLine(options.paperWidthMm)
  const rule = '-'.repeat(width)
  const money = (ore: number) => formatOre(ore, language)
  const printer = new EscPosBuilder().init()
  const field = (label: string, value: string) => twoColumns(`${label}:`, value, width).forEach((line) => printer.line(line))
  const big = (text: string) => {
    printer.align('center').bold(true).size(2, 2)
    for (const line of wrapText(text, Math.floor(width / 2))) printer.line(line)
    printer.size(1, 1).bold(false)
  }

  // Seller.
  big(data.storeName || data.legal.companyName)
  printer.align('center')
  if (data.storeName && data.storeName !== data.legal.companyName) printer.line(data.legal.companyName)
  printer.line(data.legal.streetAddress).line(`${data.legal.postalCode} ${data.legal.city}`)
  printer.line(`Org.nr. ${formatOrgNumber(data.legal.orgNumber)}${data.legal.vatRegistered ? ' MVA' : ''}`)
  if (data.legal.inForetaksregisteret) printer.line('Foretaksregisteret')
  printer.feed(1)

  // What kind of receipt this is.
  if (data.kind === 'copy') big(LEGAL_HEADINGS.copy)
  if (data.kind === 'proForma') big(LEGAL_HEADINGS.proForma)
  if (data.kind === 'training') big(LEGAL_HEADINGS.training)
  printer
    .align('center')
    .bold(true)
    .line(
      data.kind === 'proForma'
        ? t('proFormaNumber', { number: data.receiptNumber })
        : data.kind === 'return'
          ? `${LEGAL_HEADINGS.return} nr. ${data.receiptNumber}`
          : data.kind === 'training'
            ? `Treningskvittering nr. ${data.receiptNumber}`
          : `${LEGAL_HEADINGS.sale} nr. ${data.kind === 'copy' ? data.originalReceiptNumber : data.receiptNumber}`,
    )
  printer.bold(false).align('left').line(rule)

  field(t('date'), osloStamp(data.at))
  field(t('register'), `${data.register.name} (${t('registerNumber', { number: data.register.number })})`)
  field(t('cashier'), data.cashier)
  if (data.displayNumber) field(t('orderNumber'), data.displayNumber)
  if (data.kind === 'return') {
    field(t('returnOf'), `${LEGAL_HEADINGS.sale} nr. ${data.originalReceiptNumber}`)
    if (data.returnReason) field(t('returnReason'), data.returnReason)
  }
  if (data.kind === 'copy') {
    field(t('copyNumber'), String(data.receiptNumber))
    if (data.printedAt) field(t('copyPrinted'), osloStamp(data.printedAt))
  }
  printer.line(rule)

  // A return's lines are money going back: printed negative, like its total and VAT.
  const sign = data.kind === 'return' ? -1 : 1
  for (const line of data.lines) {
    for (const text of twoColumns(`${line.quantity} x ${line.name}`, money(sign * line.unitPriceOre * line.quantity), width)) printer.line(text)
  }
  printer.line(rule)

  printer.bold(true)
  for (const text of twoColumns(t('total'), `${money(data.totalOre)} kr`, width)) printer.line(text)
  printer.bold(false)

  if (data.legal.vatRegistered) {
    printer.line(rule)
    printer.line(t('vatHeading'))
    for (const vat of data.vat) {
      for (const text of twoColumns(t('vatLine', { rate: vat.ratePercent, basis: money(vat.basisOre) }), money(vat.vatOre), width)) printer.line(text)
    }
    for (const text of twoColumns(t('vatTotal'), money(data.vat.reduce((sum, vat) => sum + vat.vatOre, 0)), width)) printer.line(text)
  }

  if (data.kind !== 'proForma') {
    printer.line(rule)
    for (const payment of data.payments) {
      field(data.kind === 'return' ? t('refunded', { method: t(`method.${payment.method}`) }) : t(`method.${payment.method}`), money(payment.amountOre))
      if (payment.reference) field(t('transaction'), payment.reference)
    }
  }

  printer.feed(1).align('center')
  if (data.kind === 'proForma') big(LEGAL_HEADINGS.proForma)
  else if (data.kind === 'training') big(LEGAL_HEADINGS.training)
  else printer.line(t('thanks'))
  return printer.feed(4).cut().bytes()
}
