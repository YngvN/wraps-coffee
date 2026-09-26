import { useCallback, useEffect, useState } from 'react'
import { useIdleTimer } from '../../../hooks/useIdleTimer'
import { onRegisterSignedOut, setRegisterSessionToken } from '../../../lib/registerHttp'
import { signInStaff, signOutStaff, type SignedInStaff, type SignInRefusal } from '../../../lib/registerSessionApi'
import type { RegisterSettings } from './useRegisterSettings'

/** Why a sign-in didn't work, for the PIN pad to say so. `offline`: the server couldn't be reached. */
export type SignInFailure = { reason: SignInRefusal | 'offline'; retryAfterMs?: number }

/** Who is signed in on this register, and how to change that. */
export interface RegisterSession {
  staff: SignedInStaff | null
  isManager: boolean
  /** Signs `staffId` in, with `pin` or by name alone. Resolves `null` on success, else why not. */
  signIn: (staffId: string, pin?: string) => Promise<SignInFailure | null>
  signOut: () => void
}

/**
 * The register's signed-in staff member (see `server/register/sessions.ts` for the rules). Nobody is
 * signed in after a page load. Signs out after `settings.logoutMinutes` without a touch, a key press or
 * a scan, and whenever the server says the session has ended (it ran out there, or an admin changed the
 * member), so the register falls back to its staff list. The cart stays; whoever signs in next takes
 * it over, and `cartItems` lets the server journal that.
 */
export function useRegisterSession(deviceId: string | null, settings: RegisterSettings, cartItems: number): RegisterSession {
  const [staff, setStaff] = useState<SignedInStaff | null>(null)

  useEffect(() => {
    setRegisterSessionToken(null)
    return onRegisterSignedOut(() => setStaff(null))
  }, [])

  const signOut = useCallback(
    (reason: 'manual' | 'idle' = 'manual') => {
      setStaff(null)
      if (deviceId) void signOutStaff(deviceId, reason)
      else setRegisterSessionToken(null)
    },
    [deviceId],
  )

  const idle = useIdleTimer(settings.logoutMinutes * 60_000, staff !== null)
  useEffect(() => {
    // After the render that noticed it, like the codebase's other effect-driven state changes.
    if (idle) queueMicrotask(() => signOut('idle'))
  }, [idle, signOut])

  const signIn = async (staffId: string, pin?: string): Promise<SignInFailure | null> => {
    if (!deviceId) return { reason: 'unknownStaff' }
    try {
      const result = await signInStaff(deviceId, { staffId, pin, pinEveryTime: settings.pinEveryTime, idleMinutes: settings.logoutMinutes, cartItems })
      if (!result.ok) return { reason: result.reason, retryAfterMs: result.retryAfterMs }
      setStaff(result.staff)
      return null
    } catch {
      return { reason: 'offline' }
    }
  }

  return { staff, isManager: staff?.role === 'manager', signIn, signOut: () => signOut('manual') }
}
