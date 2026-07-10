import { useCallback, useEffect, useState } from 'react'
import { logout as logoutRequest } from '../lib/localServer'
import { setAuthToken } from '../lib/syncClient'
import type { AdminSession } from '../types/sync'

const STORAGE_KEY = 'admin.session'

function readStoredSession(): AdminSession | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as AdminSession) : null
  } catch {
    return null
  }
}

/**
 * The current admin's session (token/username/role/allowedSections), backed
 * by `localStorage` so it survives a reload. `null` means no one is logged
 * in. Kept in sync across tabs of the same browser via the native `storage`
 * event, same pattern as `useLocalStorage`.
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
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return
      setSession(event.newValue ? (JSON.parse(event.newValue) as AdminSession) : null)
    }
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [])

  const setActiveSession = useCallback((next: AdminSession) => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    setSession(next)
  }, [])

  const clearSession = useCallback(() => {
    const current = readStoredSession()
    window.localStorage.removeItem(STORAGE_KEY)
    setSession(null)
    if (current) void logoutRequest(current.token)
  }, [])

  return { session, setActiveSession, clearSession }
}
