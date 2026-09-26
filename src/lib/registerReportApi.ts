/**
 * The opening float and X/Z reports from the tablet (`server/register/reportRoutes.ts`). A report comes
 * back for the screen; the server prints it, or — for a USB printer on the tablet — hands back the job
 * (`data`, base64) for the tablet to send.
 */
import type { RegisterReport } from '../types/registerReport'
import { call, unexpected } from './registerHttp'

/** Records the opening float counted into the drawer, in øre. */
export async function saveFloat(deviceId: string, amountOre: number): Promise<void> {
  const { status, body } = await call('POST', '/register/float', { deviceId, amountOre })
  if (status !== 200) unexpected(status, body)
}

export type ReportRefusal = 'legalDetailsMissing' | 'countRequired' | 'unsettled' | 'training' | 'managerOnly' | 'signedOut'

/** Runs an X report, or a Z report with the cash counted in the drawer (øre). A manager must be signed in. */
export async function runReport(
  deviceId: string,
  request: { kind: 'X' | 'Z'; countedCashOre?: number },
  printerId: string,
): Promise<{ ok: true; report: RegisterReport; printed: boolean; via?: 'server' | 'device'; data?: string } | { ok: false; reason: ReportRefusal }> {
  const { status, body } = await call<{ ok?: boolean; report?: RegisterReport; printed?: boolean; via?: 'server' | 'device'; data?: string; reason?: ReportRefusal }>(
    'POST',
    '/register/reports',
    { deviceId, ...request, printerId },
  )
  if (status === 200 && body.report) return { ok: true, report: body.report, printed: body.printed === true, via: body.via, data: body.data }
  if (body.reason) return { ok: false, reason: body.reason }
  return unexpected(status, body)
}

/** Turns training mode on or off for this register (a manager must be signed in). */
export async function setTrainingMode(deviceId: string, on: boolean): Promise<void> {
  const { status, body } = await call('POST', '/register/training', { deviceId, on })
  if (status !== 200) unexpected(status, body)
}
