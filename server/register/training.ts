/**
 * Training mode (kassasystemforskrifta § 2-8-6): a manager switches a register into it to practise.
 * While it's on, a sale is journaled as a signed `trainingSale` in its own number series and prints a
 * "Treningskvittering – IKKE KVITTERING FOR KJØP"; it creates no order (nothing reaches the kitchen or
 * the board), touches no stock, and X/Z reports count it separately, never as a sale. Returns and
 * provider payments are refused while it's on. Whether it's on is read from the journal (the register's
 * last `trainingOn`/`trainingOff`), so it survives a restart and can always be checked.
 *
 * - `POST /register/training` — `{ deviceId, sessionToken, on: boolean }`, a manager only.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { JournalEntry } from '../../src/types/journal'
import type { OrderRecord } from '../../src/types/order'
import { sendJson } from '../http'
import { checkDevice, requireSession } from './access'
import { deliver, destination, type ReceiptRouteDeps } from './receiptRoutes'
import { saleReceiptData } from './receipts'
import { withJsonBody } from './routeHelpers'
import { saleJournalInput } from './saleJournal'
import type { StaffSession } from './sessions'

/** Whether `register` is in training mode: its latest training switch was "on". */
export function trainingActive(entries: JournalEntry[], register: number): boolean {
  let active = false
  for (const entry of entries) if (entry.register === register && (entry.type === 'trainingOn' || entry.type === 'trainingOff')) active = entry.type === 'trainingOn'
  return active
}

/** Handles `POST /register/training`; `false` for anything else. */
export function handleTrainingRoute(req: IncomingMessage, res: ServerResponse, url: URL, deps: ReceiptRouteDeps): boolean {
  if (req.method !== 'POST' || url.pathname !== '/register/training') return false
  withJsonBody(req, res, (body) => {
    if (!checkDevice(res, deps, body.deviceId)) return
    const session = requireSession(res, deps, body.deviceId, body.sessionToken, 'manager')
    if (!session) return
    const on = body.on === true
    if (trainingActive(deps.journal.read(), session.register) !== on) {
      deps.journal.append({ register: session.register, actor: session.staffId, type: on ? 'trainingOn' : 'trainingOff', data: { name: session.name } })
      console.log(`[register] ${session.name} turned training mode ${on ? 'on' : 'off'} on register ${session.register}`)
    }
    sendJson(res, 200, { ok: true, training: on })
  })
  return true
}

/**
 * A sale made in training mode: journaled as a signed `trainingSale`, printed as a training receipt,
 * and answered with an order-shaped result the register can show — which is saved nowhere.
 */
export async function trainingCheckout(res: ServerResponse, deps: ReceiptRouteDeps, session: StaffSession, order: OrderRecord, printerId: unknown): Promise<void> {
  const sale = saleJournalInput(order, session.register, session.staffId)
  const entry = deps.journal.append({ ...sale, type: 'trainingSale', data: { ...sale.data, orderId: undefined } })
  const practice: OrderRecord = { ...order, id: `training-${entry.seq}`, displayNumber: `T${entry.receiptNumber}`, status: 'completed' }
  const store = deps.readStoreSettings()
  const target = destination(deps.readPrinterSettings(), printerId)
  if (!store.legal || target.kind === 'none') return sendJson(res, 201, { order: practice, training: true, printed: false })
  const register = deps.cashRegister(session.deviceId)
  const data = saleReceiptData(entry, { legal: store.legal, storeName: store.name, register: { number: register.number, name: register.name }, cashier: session.name })
  await deliver(res, deps, target, { ...data, kind: 'training' }, { order: practice, training: true })
}
