import { useCallback, useEffect, useState } from 'react'
import { usePrinterSettings } from '../../../hooks/usePrinterSettings'
import { useStoreSettings } from '../../../hooks/useStoreSettings'
import { isInsideCompanion, listUsbPrinters, printOnUsbPrinter, type UsbPrinter } from '../../../lib/companionBridge'
import { printOrderFromDisplay } from '../../../lib/localServer'
import { buildReceipt, resolveReceiptLanguage } from '../../../lib/receipt'
import type { OrderRecord } from '../../../types/order'
import type { OrdersPrinterChoice } from '../../../types/printer'
import { useDeviceSetting } from './useDeviceSetting'

/** Per-order print state for the button: in progress, just printed (shown briefly), or the reason it failed. */
export type PrintStatus = 'printing' | 'printed' | { error: string }

/** One entry in the ⚙ menu's printer list. `id` is what gets stored as the tablet's choice. */
export interface PrinterOption {
  id: OrdersPrinterChoice
  label: string
}

/** What the order board needs for printing. */
export interface BoardPrinting {
  /** Whether a print button makes sense at all: the board is interactive and some printer is reachable. */
  available: boolean
  choice: OrdersPrinterChoice
  setChoice: (choice: OrdersPrinterChoice) => void
  /** Configured printers, then this tablet's USB printers (`usb:<key>`). The `'default'` entry is added by the menu itself. */
  options: PrinterOption[]
  print: (order: OrderRecord) => void
  status: Record<string, PrintStatus>
  /** Re-asks for USB printers plugged into this tablet — called when the ⚙ menu opens. */
  refreshUsbPrinters: () => void
}

/** How long a "printed" tick stays on the button. */
const PRINTED_FEEDBACK_MS = 2500

/**
 * Printing from the staff order board. A tablet prints to its own ⚙ choice, else Settings → Printers'
 * default. A configured printer (network or a server print queue) is printed through the server
 * (`printOrderFromDisplay`), which builds the receipt and checks the device is allowed. A printer plugged
 * into this tablet by USB (`usb:<key>`) can only be reached from here, so the receipt is built on the
 * page with the same shared layout and handed to the companion app (`printOnUsbPrinter`). Either way the
 * receipt is in the store's receipt language (`resolveReceiptLanguage`), not the tablet's screen language.
 *
 * `deviceId` is `null` off a companion device; printing is then unavailable, like moving orders.
 */
export function useBoardPrinting(deviceId: string | null): BoardPrinting {
  const [settings] = usePrinterSettings()
  const language = resolveReceiptLanguage(settings)
  const [storeSettings] = useStoreSettings()
  const [choice, setChoice] = useDeviceSetting<OrdersPrinterChoice>('ordersBoard.printer', (stored) => stored || 'default', 'default')
  const [usbPrinters, setUsbPrinters] = useState<UsbPrinter[]>([])
  const [status, setStatus] = useState<Record<string, PrintStatus>>({})

  /** Asks the companion which USB printers are plugged in right now. Runs on load and again whenever the ⚙ menu opens, so a printer plugged in later shows up where it's picked. */
  const refreshUsbPrinters = useCallback(() => {
    if (!isInsideCompanion()) return
    void listUsbPrinters().then(setUsbPrinters)
  }, [])

  useEffect(() => {
    if (!isInsideCompanion()) return
    let cancelled = false
    void listUsbPrinters().then((printers) => {
      if (!cancelled) setUsbPrinters(printers)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const options: PrinterOption[] = [
    ...settings.printers.map((printer) => ({ id: printer.id, label: printer.name })),
    ...usbPrinters.map((printer) => ({ id: `usb:${printer.key}`, label: printer.name })),
  ]

  const print = useCallback(
    (order: OrderRecord) => {
      if (!deviceId) return
      setStatus((current) => ({ ...current, [order.id]: 'printing' }))
      const usbKey = choice.startsWith('usb:') ? choice.slice('usb:'.length) : null
      const job = usbKey
        ? printOnUsbPrinter(usbKey, buildReceipt(order, { storeName: storeSettings.name, language, paperWidthMm: 80, printedAt: new Date() }))
        : printOrderFromDisplay(deviceId, order.id, choice, language)
      job
        .then(() => {
          setStatus((current) => ({ ...current, [order.id]: 'printed' }))
          setTimeout(() => {
            setStatus((current) => {
              if (current[order.id] !== 'printed') return current
              const next = { ...current }
              delete next[order.id]
              return next
            })
          }, PRINTED_FEEDBACK_MS)
        })
        .catch((error: unknown) => setStatus((current) => ({ ...current, [order.id]: { error: error instanceof Error ? error.message : String(error) } })))
    },
    [deviceId, choice, language, storeSettings.name],
  )

  return { available: Boolean(deviceId) && options.length > 0, choice, setChoice, options, print, status, refreshUsbPrinters }
}
