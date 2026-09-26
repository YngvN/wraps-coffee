/**
 * The register's legal receipts from the tablet (`server/register/receiptRoutes.ts`). The server
 * decides what a print is (the original, the one copy, or refused), builds it from the journal, and
 * prints it — or, for a USB printer on this tablet, hands back the ESC/POS job (`data`, base64) for the
 * tablet to send itself.
 */
import type { OrderReturn, ReturnReason } from '../types/order'
import type { CartLineInput, Serving } from './registerPricing'
import { call, unexpected } from './registerHttp'

/** Why a receipt didn't print. */
export type ReceiptRefusal = 'legalDetailsMissing' | 'copyLimit' | 'noPrinter' | 'printerFailed' | 'unknownOrder' | 'signedOut'

export type ReceiptOutcome = { ok: true; via: 'server' } | { ok: true; via: 'device'; data: string } | { ok: false; reason: ReceiptRefusal }

type ReceiptResponse = { ok?: boolean; via?: 'server' | 'device'; data?: string; kind?: 'original' | 'copy'; reason?: ReceiptRefusal }

function outcome(status: number, body: ReceiptResponse): ReceiptOutcome & { kind?: 'original' | 'copy' } {
  if (status === 200 && body.via === 'device' && body.data) return { ok: true, via: 'device', data: body.data, kind: body.kind }
  if (status === 200 && body.via === 'server') return { ok: true, via: 'server', kind: body.kind }
  if (body.reason) return { ok: false, reason: body.reason }
  return unexpected(status, body)
}

/** Prints sale `orderId`'s receipt: its original the first time, its one copy the next, then refuses (`copyLimit`). */
export async function printSaleReceipt(deviceId: string, orderId: string, printerId: string): Promise<ReceiptOutcome & { kind?: 'original' | 'copy' }> {
  const { status, body } = await call<ReceiptResponse>('POST', '/register/receipts/print', { deviceId, orderId, printerId })
  return outcome(status, body)
}

/** Prints a pro forma ("Foreløpig kvittering") of the cart before payment. */
export async function printProForma(deviceId: string, cart: { lines: CartLineInput[]; serving: Serving }, printerId: string): Promise<ReceiptOutcome> {
  const { status, body } = await call<ReceiptResponse>('POST', '/register/pro-forma', { deviceId, ...cart, printerId })
  return outcome(status, body)
}

/** Why a return was refused (besides the receipt reasons): see `server/register/returns.ts`. */
export type ReturnRefusal = ReceiptRefusal | 'managerOnly' | 'notReturnable' | 'nothingToReturn' | 'tooMany' | 'unknownLine' | 'badReason'

/**
 * Makes a return against sale `orderId` (a manager must be signed in) and prints its "Returkvittering".
 * The return stands even when the receipt couldn't print (`printed: false`).
 */
export async function makeReturn(
  deviceId: string,
  request: { orderId: string; lines: { itemID: string; quantity: number }[]; reason: ReturnReason; note?: string },
  printerId: string,
): Promise<{ ok: true; return: OrderReturn; printed: boolean; via?: 'server' | 'device'; data?: string; reason?: ReceiptRefusal } | { ok: false; reason: ReturnRefusal }> {
  const { status, body } = await call<{ ok?: boolean; return?: OrderReturn; printed?: boolean; via?: 'server' | 'device'; data?: string; reason?: ReturnRefusal }>(
    'POST',
    '/register/returns',
    { deviceId, ...request, printerId },
  )
  if (status === 200 && body.return) return { ok: true, return: body.return, printed: body.printed === true, via: body.via, data: body.data, reason: body.reason as ReceiptRefusal | undefined }
  if (body.reason) return { ok: false, reason: body.reason }
  return unexpected(status, body)
}

/** A base64 job from the server as bytes for a USB printer. */
export function jobBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
  return bytes
}
