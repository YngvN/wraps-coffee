/**
 * Opening the cash drawer from the register. A drawer plugged into a receipt printer's drawer port is
 * opened by sending that printer a short "kick" pulse (`buildDrawerKick`); no driver is involved.
 *
 * The rules, enforced here rather than trusted from the tablet:
 * - after a cash sale: once per sale, only for a register order paid in cash in the last few minutes;
 * - by hand ("Åpne skuff"): only with a live unlock token from the staff PIN.
 * Every opening is appended to a server-only log (`cash-drawer-log.json`, mirrored to the backup) with
 * the tablet, time, reason and sale — the start of the audit trail a till needs.
 */
import type { OrderRecord } from '../../src/types/order'
import type { ConfiguredPrinter, PrinterSettings } from '../../src/types/printer'
import { readDataFile, writeDataFile } from '../dataFile'

/** Why the drawer was opened. */
export type DrawerReason = 'sale' | 'manual'

/** One logged opening. */
export interface DrawerOpening {
  at: string
  deviceId: string
  reason: DrawerReason
  /** The cash sale that opened it, for `reason: 'sale'`. */
  orderId?: string
  /** The printer whose drawer port was pulsed, or `usb` for a printer on the tablet itself. */
  printer: string
}

/** A cash sale may open the drawer this long after it was recorded — enough for a slow network, not for reuse later. */
export const SALE_DRAWER_WINDOW_MS = 3 * 60_000

/** Oldest entries are dropped past this many, so the log can't grow without bound. */
const MAX_LOG_ENTRIES = 20_000

const LOG_FILE = 'cash-drawer-log.json'

/** Every logged opening, oldest first. */
export function readDrawerLog(): DrawerOpening[] {
  return readDataFile<DrawerOpening[]>(LOG_FILE, [])
}

/** Appends one opening to the log. */
export function logDrawerOpening(opening: DrawerOpening): void {
  const log = readDrawerLog()
  log.push(opening)
  writeDataFile(LOG_FILE, log.slice(-MAX_LOG_ENTRIES))
}

/** Why a sale can't open the drawer, or `null` when it may. */
export function saleDrawerRefusal(order: OrderRecord | undefined, log: DrawerOpening[], now: number): 'unknownOrder' | 'notCash' | 'tooLate' | 'alreadyOpened' | null {
  if (!order || order.source !== 'register') return 'unknownOrder'
  if (order.payment?.method !== 'cash') return 'notCash'
  if (now - new Date(order.createdAt).getTime() > SALE_DRAWER_WINDOW_MS) return 'tooLate'
  if (log.some((entry) => entry.reason === 'sale' && entry.orderId === order.id)) return 'alreadyOpened'
  return null
}

/**
 * Which configured printer to pulse: the tablet's own choice if it has a drawer, else a printer marked
 * as having one (the default first), else — when no printer is marked at all — the tablet's choice or
 * the default, since a printer without a drawer simply ignores the pulse. `null` when there is no
 * printer to send it to.
 */
export function drawerPrinter(settings: PrinterSettings, chosenId: string | undefined): ConfiguredPrinter | null {
  const chosen = chosenId ? settings.printers.find((printer) => printer.id === chosenId) : undefined
  const fallback = settings.printers.find((printer) => printer.id === settings.defaultPrinterId)
  const withDrawer = settings.printers.filter((printer) => printer.cashDrawer)
  if (withDrawer.length === 0) return chosen ?? fallback ?? null
  if (chosen?.cashDrawer) return chosen
  return withDrawer.find((printer) => printer.id === settings.defaultPrinterId) ?? withDrawer[0]
}
