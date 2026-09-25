import { translate, type LanguageCode } from '../../i18n/translate'
import type { OrderRecord } from '../../types/order'
import { EscPosBuilder } from './escpos'
import { orderNumber } from '../orderNumber'

/** Characters per line in the printer's standard font — 48 on 80 mm paper, 32 on 58 mm. */
export function charsPerLine(paperWidthMm: 58 | 80): number {
  return paperWidthMm === 58 ? 32 : 48
}

/** What a receipt needs besides the order itself. */
export interface ReceiptOptions {
  storeName: string
  language: LanguageCode
  paperWidthMm: 58 | 80
  /** When the receipt is printed — a parameter rather than `new Date()` inside, so tests are deterministic. */
  printedAt: Date
}

/** `dd.MM.yyyy HH:mm` in local time — unambiguous in both Norwegian and English, and short enough for one receipt line. */
export function formatReceiptDate(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** Whole kroner, the way the admin Orders view shows prices. */
export function formatKroner(amount: number): string {
  return `${amount.toFixed(0)} kr`
}

/** Breaks `text` into lines of at most `width` characters at spaces, hard-splitting any single word longer than a line. */
export function wrapText(text: string, maxWidth: number): string[] {
  // Clamped: a width below 1 would make the hard-split loop below slice nothing and never end.
  const width = Math.max(1, Math.floor(maxWidth))
  const lines: string[] = []
  for (const paragraph of text.split('\n')) {
    let current = ''
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      let rest = word
      while (rest.length > width) {
        if (current) lines.push(current)
        current = ''
        lines.push(rest.slice(0, width))
        rest = rest.slice(width)
      }
      if (!current) current = rest
      else if (current.length + 1 + rest.length <= width) current += ` ${rest}`
      else {
        lines.push(current)
        current = rest
      }
    }
    lines.push(current)
  }
  return lines
}

/** `left` and `right` on one line of `width` characters, `left` wrapped above if both don't fit. */
export function twoColumns(left: string, right: string, width: number): string[] {
  const room = width - right.length - 1
  if (room < 1) return [...wrapText(left, width), right.padStart(width)]
  const wrapped = wrapText(left, room)
  const last = wrapped.pop() ?? ''
  return [...wrapped, `${last.padEnd(room)} ${right}`]
}

/** The order's short number — the same one the customer pickup board shows (see `orderNumber`). */
export function receiptOrderNumber(order: OrderRecord): string {
  return orderNumber(order)
}

/**
 * Builds one order's receipt as a ready-to-send ESC/POS job:
 *
 * store name, order number (large) and where it came from; customer, phone, pickup time and when it was
 * placed; every item with its quantity and line price; the order's notes in bold (allergies must not
 * be missed); the total, and how it was paid for a register sale; when it was printed. A counter sale
 * leaves out the customer and pickup lines it has nothing for. Then a partial cut. Labels are translated into
 * `options.language` with the same keys the order board uses.
 */
export function buildReceipt(order: OrderRecord, options: ReceiptOptions): Uint8Array {
  const t = (key: string, vars?: Record<string, string | number>) => translate(options.language, `receipt.${key}`, vars)
  const width = charsPerLine(options.paperWidthMm)
  const rule = '-'.repeat(width)
  const source = order.source === 'wolt' ? 'Wolt' : order.source === 'foodora' ? 'Foodora' : order.source === 'register' ? t('sourceRegister') : t('sourceWebsite')
  const printer = new EscPosBuilder().init()

  printer.align('center').bold(true).size(2, 2)
  for (const line of wrapText(options.storeName, Math.floor(width / 2))) printer.line(line)
  printer.size(1, 1).bold(false).feed(1)
  printer
    .size(2, 2)
    .bold(true)
    .line(`#${receiptOrderNumber(order)}`)
    .size(1, 1)
    .bold(false)
  printer.line(source).feed(1).align('left').line(rule)

  const field = (label: string, value: string) => twoColumns(`${label}:`, value, width).forEach((line) => printer.line(line))
  if (order.source !== 'register' || order.customerName) field(t('customer'), order.customerName || '-')
  if (order.customerPhone) field(t('phone'), order.customerPhone)
  if (order.pickupTime) field(t('pickup'), order.pickupTime)
  field(t('placed'), formatReceiptDate(new Date(order.createdAt)))
  printer.line(rule)

  for (const item of order.items) {
    for (const line of twoColumns(`${item.quantity} x ${item.name}`, formatKroner(item.quantity * item.unitPrice), width)) printer.line(line)
  }
  printer.line(rule)

  if (order.notes?.trim()) {
    printer.bold(true).line(`${t('notes')}:`)
    for (const line of wrapText(order.notes.trim(), width)) printer.line(line)
    printer.bold(false).line(rule)
  }

  printer.bold(true).size(1, 2)
  for (const line of twoColumns(t('total'), formatKroner(order.totalPrice), width)) printer.line(line)
  printer.size(1, 1).bold(false)
  if (order.payment) field(t('paid'), t(`method.${order.payment.method}`))
  printer.feed(1)
  printer.align('center').line(t('printedAt', { time: formatReceiptDate(options.printedAt) }))
  return printer.feed(4).cut().bytes()
}

/** A job that only opens the cash drawer on the printer's drawer port — no paper is printed. */
export function buildDrawerKick(): Uint8Array {
  return new EscPosBuilder().init().openDrawer().bytes()
}
