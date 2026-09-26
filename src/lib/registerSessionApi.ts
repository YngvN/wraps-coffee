/**
 * Signing staff in and out on a register tablet (`server/register/signInRoutes.ts`). The session token
 * that comes back is kept by `registerHttp.ts` and sent with every register request after that.
 */
import { call, query, setRegisterSessionToken, unexpected } from './registerHttp'

export type StaffRole = 'staff' | 'manager'

/** A name on the register's login screen. `needsPin`: they must type their PIN to sign in right now. */
export interface RegisterStaffEntry {
  id: string
  name: string
  role: StaffRole
  needsPin: boolean
}

/** The signed-in staff member. */
export interface SignedInStaff {
  id: string
  name: string
  role: StaffRole
}

export type SignInRefusal = 'unknownStaff' | 'inactive' | 'noPin' | 'pinRequired' | 'wrongPin' | 'lockedOut'

/** The staff who can sign in on this register, alphabetically. */
export async function fetchRegisterStaff(deviceId: string, pinEveryTime: boolean): Promise<RegisterStaffEntry[]> {
  const { status, body } = await call<{ staff?: RegisterStaffEntry[] }>('GET', `/register/staff?${query(deviceId)}&pinEveryTime=${pinEveryTime ? 1 : 0}`)
  return status === 200 && body.staff ? body.staff : unexpected(status, body)
}

/** Signs `staffId` in (with `pin`, or by name alone when their PIN was given today). On success the session token is kept for every later request. */
export async function signInStaff(
  deviceId: string,
  request: { staffId: string; pin?: string; pinEveryTime: boolean; idleMinutes: number; cartItems: number },
): Promise<{ ok: true; staff: SignedInStaff } | { ok: false; reason: SignInRefusal; retryAfterMs?: number }> {
  const { status, body } = await call<{ sessionToken?: string; staff?: SignedInStaff; reason?: SignInRefusal; retryAfterMs?: number }>('POST', '/register/sign-in', {
    deviceId,
    ...request,
  })
  if (status === 200 && body.sessionToken && body.staff) {
    setRegisterSessionToken(body.sessionToken)
    return { ok: true, staff: body.staff }
  }
  if (body.reason) return { ok: false, reason: body.reason, retryAfterMs: body.retryAfterMs }
  return unexpected(status, body)
}

/** Signs the current staff member out (`idle` when the tablet's logout timer did it). Best effort: the server's own idle limit ends it anyway. */
export async function signOutStaff(deviceId: string, reason: 'manual' | 'idle'): Promise<void> {
  await call('POST', '/register/sign-out', { deviceId, reason }).catch(() => undefined)
  setRegisterSessionToken(null)
}
