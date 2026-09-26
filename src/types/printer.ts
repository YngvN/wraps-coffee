/**
 * How the server reaches a receipt printer:
 * - `'network'` — a printer on the LAN taking raw ESC/POS on a TCP port (9100 on virtually every
 *   receipt printer), found by the server's own network scan;
 * - `'system'` — a printer installed in the server machine's own print queue (typically USB-attached),
 *   printed to raw through CUPS (`lp`) on macOS/Linux or the Windows spooler.
 *
 * A printer plugged into a *tablet* by USB is not configured here at all: only that tablet can reach
 * it, so it's picked in the order board's own ⚙ menu instead (see `OrdersPrinterChoice`).
 */
export type PrinterTransport = 'network' | 'system'

/** One receipt printer the admin has added in Settings → Printers. */
export interface ConfiguredPrinter {
  id: string
  /** Shown to staff in the order board's printer choice. */
  name: string
  transport: PrinterTransport
  /** `'network'` only. */
  host?: string
  /** `'network'` only. Falls back to `DEFAULT_RAW_PRINTER_PORT`. */
  port?: number
  /** `'system'` only — the queue name as the OS knows it. */
  systemName?: string
  paperWidthMm: 58 | 80
  /** A cash drawer is plugged into this printer's drawer port, so it may be sent the "open drawer" pulse (see `buildDrawerKick`). Printers without one are never sent it. */
  cashDrawer?: boolean
  /**
   * Whether this printer reports its drawer's state (a network printer only), and which sensor level
   * means "open" — drawers differ. When set, the register won't record a sale while the drawer is open
   * (kassasystemforskrifta § 2-6). Absent or `'off'`: not read.
   */
  drawerSensor?: 'off' | 'openWhenHigh' | 'openWhenLow'
}

/** The `admin.printers` synced key. */
export interface PrinterSettings {
  printers: ConfiguredPrinter[]
  /** The printer an order board uses unless that tablet has picked another. `null` — no printing until one is chosen. */
  defaultPrinterId: string | null
  /** The language every receipt prints in, whatever language a tablet's screen shows. Unset means Norwegian — see `resolveReceiptLanguage` in `src/lib/receipt/receiptLanguage.ts`. */
  receiptLanguage?: 'no' | 'en'
}

export const DEFAULT_PRINTER_SETTINGS: PrinterSettings = { printers: [], defaultPrinterId: null }

/** The raw-printing ("JetDirect") port receipt printers listen on. */
export const DEFAULT_RAW_PRINTER_PORT = 9100

/** A printer the server found, not yet necessarily added — see `GET /printers/discover`. */
export interface DiscoveredPrinter {
  transport: PrinterTransport
  /** Best available name: the mDNS service name, the OS queue name, or the address. */
  name: string
  host?: string
  port?: number
  systemName?: string
  /** How it was found. `'scan'` — it simply answered on port 9100. */
  source: 'mdns' | 'scan' | 'system'
  /** Its name looks like a receipt printer's (Epson TM, Star TSP, Xprinter…) — sorted first, but every found printer is offered. */
  likelyReceipt: boolean
}

/**
 * A tablet's own printer choice in the order board's ⚙ menu: `'default'` (Settings → Printers'
 * default), a configured printer's id, or `usb:<key>` for a printer plugged into this tablet (see
 * the companion's USB printer bridge).
 */
export type OrdersPrinterChoice = 'default' | string

/** Receipt-printer names worth sorting to the top of a discovery list. */
const RECEIPT_NAME_PATTERN = /\b(tm-?\w*|tsp\d*|pos|receipt|thermal|kvittering|58 ?mm|80 ?mm|xp-?\w*|srp-?\w*|ct-s\w*|bixolon|rongta|citizen|star|epson)\b/i

/** Whether a printer's name looks like a receipt printer's. */
export function looksLikeReceiptPrinter(name: string): boolean {
  return RECEIPT_NAME_PATTERN.test(name)
}

/** A printer as the AI assistant proposes it: the configured printer plus whether it should be the default — so "make the kitchen printer the default" is a plain update of one field. */
export interface PrinterDraft extends ConfiguredPrinter {
  isDefault: boolean
}
