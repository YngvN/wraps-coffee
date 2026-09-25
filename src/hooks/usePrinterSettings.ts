import { DEFAULT_PRINTER_SETTINGS, type PrinterSettings } from '../types/printer'
import { useLocalStorage } from './useLocalStorage'

/** The receipt printers set up in Settings → Printers (`admin.printers`, synced), and which one order boards print to by default. Readable by the kiosk page too, so an order board can list them. */
export function usePrinterSettings() {
  return useLocalStorage<PrinterSettings>('admin.printers', DEFAULT_PRINTER_SETTINGS)
}
