/**
 * Cash and reports at a register (kassasystemforskrifta § 2-5, § 2-8-2, § 2-8-3):
 * - `POST /register/float` — `{ deviceId, sessionToken, amountOre }`: the opening float counted into the
 *   drawer, journaled; the register asks for it at the first sign-in of each period (after a Z);
 * - `POST /register/reports` — `{ deviceId, sessionToken, kind: 'X' | 'Z', countedCashOre?, printerId? }`,
 *   a manager only. An X report shows the period so far and changes nothing. A Z report needs the cash
 *   staff counted in the drawer, is refused while a payment is still in progress on this register or
 *   it's in training mode,
 *   journals the count (expected, counted, difference) and then the Z itself with its number, and so
 *   closes the period. Both are journaled, printed, and returned for the screen.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { buildReportPrint, resolveReceiptLanguage } from '../../src/lib/receipt'
import type { RegisterReport } from '../../src/types/registerReport'
import { missingLegalDetails } from '../../src/utils/storeLegal'
import { sendJson } from '../http'
import { checkDevice, requireSession } from './access'
import { destination, type ReceiptRouteDeps } from './receiptRoutes'
import { buildRegisterReport, lastZSeq } from './reports'
import { withJsonBody } from './routeHelpers'
import { trainingActive } from './training'

export interface ReportRouteDeps extends ReceiptRouteDeps {
  /** Whether this tablet has a provider payment still in progress. */
  hasPendingPayment: (deviceId: string) => boolean
}

/** The largest float or count accepted, in øre — a typo guard (1 000 000 kr), not a business rule. */
const MAX_CASH_ORE = 100_000_000

function isCash(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= MAX_CASH_ORE
}

/** Whether `register` has had an opening float counted since its last Z report. */
export function floatCounted(entries: { register: number | null; type: string; seq: number }[], register: number): boolean {
  const since = lastZSeq(entries as never, register)
  return entries.some((entry) => entry.register === register && entry.type === 'float' && entry.seq > since)
}

/** Handles a float or report route; `false` for anything else. */
export function handleReportRoute(req: IncomingMessage, res: ServerResponse, url: URL, deps: ReportRouteDeps): boolean {
  const path = url.pathname
  if (req.method !== 'POST' || (path !== '/register/float' && path !== '/register/reports')) return false
  withJsonBody(req, res, async (body) => {
    if (!checkDevice(res, deps, body.deviceId)) return
    const register = deps.cashRegister(body.deviceId)

    if (path === '/register/float') {
      const session = requireSession(res, deps, body.deviceId, body.sessionToken)
      if (!session) return
      if (!isCash(body.amountOre)) return sendJson(res, 400, { error: 'Expected the float in øre' })
      deps.journal.append({ register: register.number, actor: session.staffId, type: 'float', data: { amountOre: body.amountOre } })
      return sendJson(res, 200, { ok: true })
    }

    const session = requireSession(res, deps, body.deviceId, body.sessionToken, 'manager')
    if (!session) return
    if (body.kind !== 'X' && body.kind !== 'Z') return sendJson(res, 400, { error: 'Expected kind "X" or "Z"' })
    const store = deps.readStoreSettings()
    if (!store.legal || missingLegalDetails(store).length > 0) return sendJson(res, 409, { reason: 'legalDetailsMissing' })
    if (body.kind === 'Z') {
      if (!isCash(body.countedCashOre)) return sendJson(res, 400, { reason: 'countRequired' })
      if (deps.hasPendingPayment(body.deviceId)) return sendJson(res, 409, { reason: 'unsettled' })
      if (trainingActive(deps.journal.read(), register.number)) return sendJson(res, 409, { reason: 'training' })
    }

    const staffNames = new Map(deps.readStaff().map((member) => [member.id, member.name]))
    const report: RegisterReport = buildRegisterReport(deps.journal.read(), register.number, body.kind, new Date())
    report.byOperator = report.byOperator.map((operator) => ({ ...operator, name: staffNames.get(operator.staffId) }))
    if (body.kind === 'Z') {
      const countedOre = body.countedCashOre as number
      report.cashCount = { countedOre, differenceOre: countedOre - report.expectedCashOre }
      deps.journal.append({
        register: register.number,
        actor: session.staffId,
        type: 'cashCount',
        data: { expectedOre: report.expectedCashOre, countedOre, differenceOre: report.cashCount.differenceOre },
      })
    }
    deps.journal.append({ register: register.number, actor: session.staffId, type: body.kind === 'Z' ? 'zReport' : 'xReport', data: { number: report.zNumber, report } })
    console.log(`[register] ${session.name} ran ${body.kind === 'Z' ? `Z report ${report.zNumber}` : 'an X report'} on ${register.name}`)

    const target = destination(deps.readPrinterSettings(), body.printerId)
    if (target.kind === 'none') return sendJson(res, 200, { ok: true, report, printed: false })
    const language = resolveReceiptLanguage(deps.readPrinterSettings())
    const context = { legal: store.legal, storeName: store.name, register: { number: register.number, name: register.name }, printedBy: session.name }
    const bytes = buildReportPrint(report, context, { language, paperWidthMm: target.kind === 'server' ? target.printer.paperWidthMm : 80 })
    if (target.kind === 'device') return sendJson(res, 200, { ok: true, report, printed: true, via: 'device', data: Buffer.from(bytes).toString('base64') })
    try {
      await deps.printJob(target.printer, bytes)
      sendJson(res, 200, { ok: true, report, printed: true, via: 'server' })
    } catch (error) {
      console.error(`[register] printing a report on "${target.printer.name}" failed:`, error)
      sendJson(res, 200, { ok: true, report, printed: false, reason: 'printerFailed' })
    }
  })
  return true
}
