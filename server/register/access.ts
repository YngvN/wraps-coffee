/**
 * Who may do what at a register. Every register route first checks the tablet (an approved machine
 * showing a Register pane, `deviceMayUseRegister`) and then, for anything that changes something, the
 * signed-in staff member's session token (`sessionToken` in the body). Manager-only actions also check
 * the role. A session found to have run out is ended and journaled here, so the journal shows when
 * each shift really ended.
 */
import type { ServerResponse } from 'node:http'
import { sendJson } from '../http'
import type { Journal } from '../journal/journal'
import type { CashRegister } from './registers'
import type { StaffSession, StaffSessions } from './sessions'

export interface RegisterAccess {
  deviceMayUseRegister: (deviceId: string) => boolean
  sessions: StaffSessions
  journal: Journal
  cashRegister: (deviceId: string) => CashRegister
}

/** 403s and returns `false` unless `deviceId` is an approved tablet showing a Register. */
export function checkDevice(res: ServerResponse, access: RegisterAccess, deviceId: unknown): deviceId is string {
  if (typeof deviceId === 'string' && access.deviceMayUseRegister(deviceId)) return true
  sendJson(res, 403, { error: 'This display is not allowed to use the register' })
  return false
}

/** The signed-in session for `deviceId` if `token` is its live token, or `null` (journaling a session that just ran out). */
export function currentSession(access: RegisterAccess, deviceId: string, token: unknown): StaffSession | null {
  return access.sessions.check(deviceId, token, (session, reason) =>
    access.journal.append({ register: session.register, actor: session.staffId, type: 'signOut', data: { name: session.name, reason } }),
  )
}

/**
 * The session allowed to do this, or `null` after answering 401 (nobody signed in, reason `signedOut`)
 * or 403 (not a manager, reason `managerOnly`).
 */
export function requireSession(res: ServerResponse, access: RegisterAccess, deviceId: string, token: unknown, role: 'staff' | 'manager' = 'staff'): StaffSession | null {
  const session = currentSession(access, deviceId, token)
  if (!session) {
    sendJson(res, 401, { error: 'Nobody is signed in on this register', reason: 'signedOut' })
    return null
  }
  if (role === 'manager' && session.role !== 'manager') {
    sendJson(res, 403, { error: 'Only a manager can do this', reason: 'managerOnly' })
    return null
  }
  return session
}
