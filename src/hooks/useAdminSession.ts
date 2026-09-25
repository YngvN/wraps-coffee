import { useCallback, useEffect, useState } from 'react'
import { logout as logoutRequest } from '../lib/localServer'
import { setAuthToken } from '../lib/syncClient'
import type { AdminSession } from '../types/sync'

const STORAGE_KEY = 'admin.session'

/**
 * Reads the stored session — this tab's `sessionStorage` first (a login with
 * "Stay signed in" unchecked), then `localStorage` (a remembered login).
 * Only one of the two is ever written at a time, see `setActiveSession`.
 */
function readStoredSession(): AdminSession | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY) ?? window.localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as AdminSession) : null
  } catch {
    return null
  }
}

/**
 * The current admin's session (token/username/role/allowedSections). `null`
 * means no one is logged in. A remembered login lives in `localStorage`, so
 * it survives a reload and a browser restart and is shared by every tab; an
 * unremembered one lives in this tab's `sessionStorage`, so it ends when the
 * tab/browser closes and a newly opened tab asks for a login again. Kept in
 * sync across tabs of the same browser via the native `storage` event, same
 * pattern as `useLocalStorage`.
 */
export function useAdminSession() {
  const [session, setSession] = useState<AdminSession | null>(readStoredSession)

  // Keeps `syncClient.ts`'s cached token in step with the session, however
  // it changes — initial mount, a fresh login, logout, or another tab of
  // this same browser logging in/out (via the `storage` listener below).
  useEffect(() => {
    setAuthToken(session?.token ?? null)
  }, [session])

  useEffect(() => {
    // Re-reads rather than trusting `event.newValue`: another tab clearing its
    // remembered session must not log this tab out of its own tab-only one.
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return
      setSession(readStoredSession())
    }
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [])

  /** Stores a fresh login — in `localStorage` when `remember` is true (the default), else only in this tab's `sessionStorage`. Clears the other tier so an older login can't resurface from it. */
  const setActiveSession = useCallback((next: AdminSession, remember = true) => {
    const serialized = JSON.stringify(next)
    if (remember) {
      window.sessionStorage.removeItem(STORAGE_KEY)
      window.localStorage.setItem(STORAGE_KEY, serialized)
    } else {
      window.localStorage.removeItem(STORAGE_KEY)
      window.sessionStorage.setItem(STORAGE_KEY, serialized)
    }
    setSession(next)
  }, [])

  const clearSession = useCallback(() => {
    const current = readStoredSession()
    window.localStorage.removeItem(STORAGE_KEY)
    window.sessionStorage.removeItem(STORAGE_KEY)
    setSession(null)
    if (current) void logoutRequest(current.token)
  }, [])

  return { session, setActiveSession, clearSession }
}
