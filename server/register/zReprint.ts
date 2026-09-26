/**
 * Printing a Z report again from the dashboard (Settings → Register → Z reports): the report exactly as
 * it was journaled when the day was closed, marked KOPI, on the default printer.
 */
import { buildReportPrint, resolveReceiptLanguage } from '../../src/lib/receipt'
import type { ConfiguredPrinter, PrinterSettings } from '../../src/types/printer'
import type { RegisterReport } from '../../src/types/registerReport'
import type { StoreSettings } from '../../src/types/storeSettings'
import type { Journal } from '../journal/journal'
import type { CashRegister } from './registers'

export interface ZReprintDeps {
  journal: Journal
  readStoreSettings: () => StoreSettings
  readPrinterSettings: () => PrinterSettings
  readRegisters: () => CashRegister[]
  printJob: (printer: ConfiguredPrinter, bytes: Uint8Array) => Promise<void>
}

/** Prints the Z report journaled as entry `seq` again, as a copy printed by `printedBy`. */
export async function reprintZ(seq: number, printedBy: string, deps: ZReprintDeps): Promise<'printed' | 'notFound' | 'noPrinter' | 'printerFailed'> {
  const entry = deps.journal.read().find((candidate) => candidate.seq === seq && candidate.type === 'zReport')
  const store = deps.readStoreSettings()
  if (!entry || !store.legal) return 'notFound'
  const settings = deps.readPrinterSettings()
  const printer = settings.printers.find((candidate) => candidate.id === settings.defaultPrinterId)
  if (!printer) return 'noPrinter'
  const register = deps.readRegisters().find((candidate) => candidate.number === entry.register)
  const context = { legal: store.legal, storeName: store.name, register: { number: entry.register ?? 0, name: register?.name ?? '' }, printedBy, copy: true }
  try {
    await deps.printJob(printer, buildReportPrint(entry.data.report as RegisterReport, context, { language: resolveReceiptLanguage(settings), paperWidthMm: printer.paperWidthMm }))
    return 'printed'
  } catch {
    return 'printerFailed'
  }
}
