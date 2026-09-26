/**
 * Admin routes for the register staff list and the journal's health, used from Settings → Register
 * (sessions that may manage store settings):
 * - `GET  /register/admin/staff` — every staff member, without PIN hashes;
 * - `POST /register/admin/staff` — `{ name, pin, role?, employeeNumber? }` adds one;
 * - `POST /register/admin/staff/:id` — `{ name?, employeeNumber?, role?, active?, pin? }` changes one.
 *   A new PIN, a new role or deactivating signs that member out of every register at once;
 * - `GET  /register/admin/journal` — `{ entries, problems, checkedAt }`: the journal's size and the
 *   problems found by the last check (at startup, or `POST /register/admin/journal/verify`);
 * - `GET  /register/admin/z-reports` — every Z report from the journal, newest first;
 * - `POST /register/admin/z-reports/:seq/print` — prints one again on the default printer, marked KOPI.
 *
 * Every change to the staff list is journaled with the admin who made it (never the PIN).
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { DashboardSection } from '../../src/types/sync'
import { bearerToken, sendJson } from '../http'
import type { Journal, JournalProblem } from '../journal/journal'
import { withJsonBody } from './routeHelpers'
import type { StaffSessions } from './sessions'
import { createStaff, toSummary, updateStaff, type StaffStore } from './staff'

export interface StaffAdminRouteDeps {
  /** Prints a Z report (the journal entry `seq`) again as a copy on the default printer; `false` when there's no such report or printer. */
  reprintZReport: (seq: number, printedBy: string) => Promise<'printed' | 'notFound' | 'noPrinter' | 'printerFailed'>
  sessionMay: (token: string, section: DashboardSection) => boolean
  /** The dashboard username behind a session token, for the journal. */
  sessionUser: (token: string) => string | null
  staff: StaffStore
  sessions: StaffSessions
  journal: Journal
  /** The last journal check's result, kept by the server. */
  journalHealth: () => { problems: JournalProblem[]; checkedAt: string }
  /** Runs a full journal check now and remembers it. */
  verifyJournal: () => { problems: JournalProblem[]; checkedAt: string }
}

const STAFF_ERROR_MESSAGES: Record<string, string> = {
  noName: 'Give the staff member a name',
  badRole: 'The role must be staff or manager',
  badPin: 'The PIN must be exactly 4 digits',
  duplicateEmployeeNumber: 'Another staff member has that employee number',
  unknownStaff: 'No such staff member',
}

/** Handles a staff or journal admin route; `false` for anything else. */
export function handleStaffAdminRoute(req: IncomingMessage, res: ServerResponse, url: URL, deps: StaffAdminRouteDeps): boolean {
  const path = url.pathname
  if (!path.startsWith('/register/admin/')) return false
  const token = bearerToken(req) ?? ''
  if (!deps.sessionMay(token, 'store')) {
    sendJson(res, 403, { error: 'Only accounts that can manage store settings can manage register staff' })
    return true
  }
  const actor = `admin:${deps.sessionUser(token) ?? 'unknown'}`

  if (path === '/register/admin/staff' && req.method === 'GET') {
    sendJson(res, 200, { staff: deps.staff.read().map(toSummary) })
    return true
  }

  if (path === '/register/admin/staff' && req.method === 'POST') {
    withJsonBody(req, res, (body) => {
      const result = createStaff(deps.staff, body)
      if (!result.ok) return sendJson(res, 400, { reason: result.reason, error: STAFF_ERROR_MESSAGES[result.reason] })
      const { member } = result
      deps.journal.append({
        register: null,
        actor,
        type: 'staffChange',
        data: { action: 'created', staffId: member.id, name: member.name, role: member.role, employeeNumber: member.employeeNumber },
      })
      sendJson(res, 201, { member: toSummary(member) })
    })
    return true
  }

  const match = /^\/register\/admin\/staff\/([^/]+)$/.exec(path)
  if (match && req.method === 'POST') {
    withJsonBody(req, res, (body) => {
      const id = decodeURIComponent(match[1])
      const result = updateStaff(deps.staff, id, body)
      if (!result.ok) return sendJson(res, result.reason === 'unknownStaff' ? 404 : 400, { reason: result.reason, error: STAFF_ERROR_MESSAGES[result.reason] })
      const { member, before } = result
      const changed: string[] = (['name', 'employeeNumber', 'role', 'active'] as const).filter((field) => member[field] !== before[field])
      if (body.pin !== undefined) changed.push('pin')
      if (changed.length > 0) {
        deps.journal.append({
          register: null,
          actor,
          type: 'staffChange',
          data: { action: 'updated', staffId: id, name: member.name, changed, role: member.role, active: member.active },
        })
      }
      if (body.pin !== undefined || member.role !== before.role || member.active !== before.active) {
        for (const session of deps.sessions.endAllFor(id)) {
          deps.journal.append({ register: session.register, actor: session.staffId, type: 'signOut', data: { name: session.name, reason: 'staffChanged' } })
        }
      }
      sendJson(res, 200, { member: toSummary(member) })
    })
    return true
  }

  if (path === '/register/admin/z-reports' && req.method === 'GET') {
    const reports = deps.journal
      .read()
      .filter((entry) => entry.type === 'zReport')
      .reverse()
      .map((entry) => ({ seq: entry.seq, at: entry.at, register: entry.register, number: entry.data.number, report: entry.data.report }))
    sendJson(res, 200, { reports })
    return true
  }

  const reprint = /^\/register\/admin\/z-reports\/(\d+)\/print$/.exec(path)
  if (reprint && req.method === 'POST') {
    void deps.reprintZReport(Number(reprint[1]), deps.sessionUser(token) ?? 'admin').then((result) =>
      sendJson(res, result === 'printed' ? 200 : result === 'notFound' ? 404 : result === 'noPrinter' ? 409 : 502, { result }),
    )
    return true
  }

  if (path === '/register/admin/journal' && req.method === 'GET') {
    const health = deps.journalHealth()
    sendJson(res, 200, { entries: deps.journal.length, problems: health.problems, checkedAt: health.checkedAt })
    return true
  }

  if (path === '/register/admin/journal/verify' && req.method === 'POST') {
    const health = deps.verifyJournal()
    sendJson(res, 200, { entries: deps.journal.length, problems: health.problems, checkedAt: health.checkedAt })
    return true
  }

  return false
}
