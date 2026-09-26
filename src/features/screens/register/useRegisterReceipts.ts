import { useCallback } from 'react'
import { printOnUsbPrinter } from '../../../lib/companionBridge'
import { jobBytes, makeReturn, printProForma, printSaleReceipt, type ReceiptOutcome, type ReturnRefusal } from '../../../lib/registerReceiptApi'
import type { CartLineInput, Serving } from '../../../lib/registerPricing'
import type { TrainingPrint } from '../../../lib/registerApi'
import type { OrderRecord, OrderReturn, ReturnReason } from '../../../types/order'
import type { OrdersPrinterChoice } from '../../../types/printer'
import type { ScanNotice } from './useRegisterScans'

/**
 * Prints the register's legal receipts on this tablet's chosen printer: a sale's receipt (the server
 * decides whether that's the original or the one copy), a pro forma of the cart, and a return with its
 * "Returkvittering". A USB printer on the tablet gets the job the server built. Every outcome is shown
 * as a notice; a return also resolves with its result, for the return sheet.
 */
export function useRegisterReceipts(deviceId: string | null, printerChoice: OrdersPrinterChoice, notify: (notice: ScanNotice) => void) {
  const finish = useCallback(
    async (outcome: ReceiptOutcome, printed: ScanNotice) => {
      if (!outcome.ok) return notify({ kind: 'receiptRefused', reason: outcome.reason })
      if (outcome.via === 'device' && printerChoice.startsWith('usb:')) await printOnUsbPrinter(printerChoice.slice('usb:'.length), jobBytes(outcome.data))
      notify(printed)
    },
    [notify, printerChoice],
  )

  const printSale = useCallback(
    async (order: OrderRecord) => {
      if (!deviceId) return
      try {
        const outcome = await printSaleReceipt(deviceId, order.id, printerChoice)
        await finish(outcome, { kind: outcome.ok && outcome.kind === 'copy' ? 'copyPrinted' : 'receiptPrinted' })
      } catch {
        notify({ kind: 'receiptRefused', reason: 'printerFailed' })
      }
    },
    [deviceId, printerChoice, finish, notify],
  )

  const printCartProForma = useCallback(
    async (cart: { lines: CartLineInput[]; serving: Serving }) => {
      if (!deviceId) return
      try {
        await finish(await printProForma(deviceId, cart, printerChoice), { kind: 'proFormaPrinted' })
      } catch {
        notify({ kind: 'receiptRefused', reason: 'printerFailed' })
      }
    },
    [deviceId, printerChoice, finish, notify],
  )

  const returnSale = useCallback(
    async (
      order: OrderRecord,
      request: { lines: { itemID: string; quantity: number }[]; reason: ReturnReason; note?: string },
    ): Promise<{ ok: true; return: OrderReturn } | { ok: false; reason: ReturnRefusal | 'offline' }> => {
      if (!deviceId) return { ok: false, reason: 'offline' }
      try {
        const result = await makeReturn(deviceId, { orderId: order.id, ...request }, printerChoice)
        if (!result.ok) return result
        if (result.printed && result.via === 'device' && result.data && printerChoice.startsWith('usb:')) {
          await printOnUsbPrinter(printerChoice.slice('usb:'.length), jobBytes(result.data))
        }
        notify(result.printed ? { kind: 'returnMade' } : { kind: 'receiptRefused', reason: result.reason ?? 'noPrinter' })
        return { ok: true, return: result.return }
      } catch {
        return { ok: false, reason: 'offline' }
      }
    },
    [deviceId, printerChoice, notify],
  )

  /** A practice sale's training receipt: sends it to this tablet's USB printer when the server handed it back. */
  const finishTraining = useCallback(
    async (training: TrainingPrint) => {
      try {
        if (training.via === 'device' && training.data && printerChoice.startsWith('usb:')) await printOnUsbPrinter(printerChoice.slice('usb:'.length), jobBytes(training.data))
        notify(training.via ? { kind: 'trainingPrinted' } : { kind: 'receiptRefused', reason: 'noPrinter' })
      } catch {
        notify({ kind: 'receiptRefused', reason: 'printerFailed' })
      }
    },
    [printerChoice, notify],
  )

  return { printSale, printCartProForma, returnSale, finishTraining }
}
