/**
 * Signing in and out on a register tablet (see `sessions.ts` for the rules):
 * - `GET  /register/staff?deviceId=&pinEveryTime=` — the staff list the register shows as its login
 *   screen: active members with a PIN, and whether each must type it right now;
 * - `POST /register/sign-in` — `{ deviceId, staffId, pin?, pinEveryTime, idleMinutes, cartItems }` →
 *   `{ sessionToken, staff }`. `cartItems` is how many lines the tablet's cart holds: when someone else
 *   was signed in before, that cart is now theirs, and the takeover is journaled;
 * - `POST /register/sign-out` — `{ deviceId, sessionToken, reason: 'manual' | 'idle' }`.
 *
 * Every sign-in and sign-out is journaled with the register and the staff member.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { sendJson } from '../http'
import { checkDevice, currentSession, type RegisterAccess } from './access'
import { withJsonBody } from './routeHelpers'
import type { StaffMember } from './staff'

export interface SignInRouteDeps extends RegisterAccess {
  readStaff: () => StaffMember[]
}

const SIGN_IN_STATUS: Record<string, number> = { unknownStaff: 404, inactive: 403, noPin: 403, pinRequired: 401, wrongPin: 401, lockedOut: 429 }

/** Handles a sign-in route; `false` for anything else. */
export function handleSignInRoute(req: IncomingMessage, res: ServerResponse, url: URL, deps: SignInRouteDeps): boolean {
  const path = url.pathname

  if (req.method === 'GET' && path === '/register/staff') {
    const deviceId = url.searchParams.get('deviceId')
    if (!checkDevice(res, deps, deviceId)) return true
    const register = deps.cashRegister(deviceId).number
    const pinEveryTime = url.searchParams.get('pinEveryTime') === '1'
    const staff = deps
      .readStaff()
      .filter((member) => member.active && member.pin)
      .sort((a, b) => a.name.localeCompare(b.name, 'nb'))
      .map((member) => ({ id: member.id, name: member.name, role: member.role, needsPin: deps.sessions.needsPin(member.id, register, pinEveryTime) }))
    sendJson(res, 200, { staff })
    return true
  }

  if (req.method === 'POST' && path === '/register/sign-in') {
    withJsonBody(req, res, (body) => {
      if (!checkDevice(res, deps, body.deviceId)) return
      const deviceId = body.deviceId
      const register = deps.cashRegister(deviceId).number
      // A session that already ran out is ended (and journaled) as idle first, so only a live one counts as replaced.
      const stale = deps.sessions.peek(deviceId)
      if (stale) currentSession(deps, deviceId, stale.token)
      const before = deps.sessions.peek(deviceId)
      const result = deps.sessions.signIn({
        deviceId,
        register,
        member: deps.readStaff().find((member) => member.id === body.staffId),
        pin: body.pin,
        pinEveryTime: body.pinEveryTime === true,
        idleMinutes: body.idleMinutes,
      })
      if (!result.ok) return sendJson(res, SIGN_IN_STATUS[result.reason] ?? 400, { reason: result.reason, retryAfterMs: result.retryAfterMs })
      const { session } = result
      if (before) deps.journal.append({ register, actor: before.staffId, type: 'signOut', data: { name: before.name, reason: 'replaced' } })
      deps.journal.append({ register, actor: session.staffId, type: 'signIn', data: { name: session.name, method: result.method } })
      const cartItems = typeof body.cartItems === 'number' && body.cartItems > 0 ? body.cartItems : 0
      if (cartItems > 0 && result.previousStaffId && result.previousStaffId !== session.staffId) {
        deps.journal.append({ register, actor: session.staffId, type: 'cartTakeover', data: { fromStaffId: result.previousStaffId, lines: cartItems } })
      }
      sendJson(res, 200, { sessionToken: session.token, staff: { id: session.staffId, name: session.name, role: session.role } })
    })
    return true
  }

  if (req.method === 'POST' && path === '/register/sign-out') {
    withJsonBody(req, res, (body) => {
      if (!checkDevice(res, deps, body.deviceId)) return
      const session = currentSession(deps, body.deviceId, body.sessionToken)
      if (session) {
        deps.sessions.signOut(body.deviceId)
        deps.journal.append({
          register: session.register,
          actor: session.staffId,
          type: 'signOut',
          data: { name: session.name, reason: body.reason === 'idle' ? 'idle' : 'manual' },
        })
      }
      sendJson(res, 200, { ok: true })
    })
    return true
  }

  return false
}
