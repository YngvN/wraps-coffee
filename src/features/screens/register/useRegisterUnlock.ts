import { useCallback, useEffect, useRef, useState } from 'react'
import { lockRegister, unlockRegister } from '../../../lib/registerApi'

/** The register locks itself after this long without anything done while unlocked — the same idle limit the server enforces on the token. */
export const REGISTER_IDLE_LOCK_MS = 2 * 60_000

/** Why a PIN attempt failed, for the PIN pad to say so. */
export type UnlockFailure = { reason: 'noPin' | 'wrongPin' | 'lockedOut' | 'offline'; retryAfterMs?: number }

/** What the register needs from its staff lock. */
export interface RegisterUnlock {
  unlocked: boolean
  /** Whether the PIN pad is showing. */
  prompting: boolean
  /** The live token (marks the register as just used), opening the PIN pad first when locked. Resolves `null` if staff cancel. */
  requireUnlock: () => Promise<string | null>
  /** Tries a PIN from the PIN pad. Resolves `null` on success, else why it failed. */
  submitPin: (pin: string) => Promise<UnlockFailure | null>
  cancelPrompt: () => void
  lock: () => void
}

/**
 * The register's staff lock on the page side: holds the unlock token the server issued for the right
 * PIN, opens the PIN pad whenever a locked action needs it, and locks again after
 * `REGISTER_IDLE_LOCK_MS` of no use. A reload always starts locked (the token is never stored).
 */
export function useRegisterUnlock(deviceId: string | null): RegisterUnlock {
  const [token, setToken] = useState<string | null>(null)
  const [lastUsed, setLastUsed] = useState(0)
  const [prompting, setPrompting] = useState(false)
  const pending = useRef<((token: string | null) => void) | null>(null)

  const lock = useCallback(() => {
    setToken(null)
    if (deviceId) void lockRegister(deviceId)
  }, [deviceId])

  useEffect(() => {
    if (!token) return
    const timer = setTimeout(lock, Math.max(0, lastUsed + REGISTER_IDLE_LOCK_MS - Date.now()))
    return () => clearTimeout(timer)
  }, [token, lastUsed, lock])

  const requireUnlock = useCallback(() => {
    if (token) {
      setLastUsed(Date.now())
      return Promise.resolve(token)
    }
    setPrompting(true)
    return new Promise<string | null>((resolve) => {
      pending.current?.(null)
      pending.current = resolve
    })
  }, [token])

  const settle = (value: string | null) => {
    setPrompting(false)
    pending.current?.(value)
    pending.current = null
  }

  const submitPin = async (pin: string): Promise<UnlockFailure | null> => {
    if (!deviceId) return { reason: 'noPin' }
    try {
      const result = await unlockRegister(deviceId, pin)
      if (!result.ok) return { reason: result.reason, retryAfterMs: result.retryAfterMs }
      setToken(result.token)
      setLastUsed(Date.now())
      settle(result.token)
      return null
    } catch {
      return { reason: 'offline' }
    }
  }

  return { unlocked: token !== null, prompting, requireUnlock, submitPin, cancelPrompt: () => settle(null), lock }
}
