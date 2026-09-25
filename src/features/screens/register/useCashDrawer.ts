import { useCallback } from 'react'
import { printOnUsbPrinter } from '../../../lib/companionBridge'
import { buildDrawerKick } from '../../../lib/receipt'
import { openCashDrawer } from '../../../lib/registerApi'
import type { OrdersPrinterChoice } from '../../../types/printer'
import type { ScanNotice } from './useRegisterScans'

/**
 * Opens the cash drawer from the register: after a cash sale (once per sale), or by hand with the
 * staff PIN. The server decides whether it may and pulses the printer that holds the drawer; when that
 * printer is plugged into this tablet by USB, the server only authorises and logs it, and the pulse is
 * sent from here. Every outcome is shown as a notice.
 */
export function useCashDrawer(deviceId: string | null, printerChoice: OrdersPrinterChoice, notify: (notice: ScanNotice) => void) {
  return useCallback(
    async (request: { reason: 'sale'; orderId: string } | { reason: 'manual'; unlockToken: string }) => {
      if (!deviceId) return
      try {
        const result = await openCashDrawer(deviceId, { ...request, printerId: printerChoice })
        if (!result.ok) {
          // A card sale or a repeat never opens it — that's expected, so say nothing.
          if (result.reason === 'notCash' || result.reason === 'alreadyOpened') return
          return notify({ kind: result.reason === 'noPrinter' ? 'drawerNoPrinter' : 'drawerFailed' })
        }
        if (result.via === 'device' && printerChoice.startsWith('usb:')) await printOnUsbPrinter(printerChoice.slice('usb:'.length), buildDrawerKick())
        notify({ kind: 'drawerOpened' })
      } catch {
        notify({ kind: 'drawerFailed' })
      }
    },
    [deviceId, printerChoice, notify],
  )
}
