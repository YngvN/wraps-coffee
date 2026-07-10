import { useEffect, useState } from 'react'
import { publish, subscribe } from '../lib/syncClient'
import { SYNCED_KEYS, type SyncedKey } from '../types/sync'

function isSyncedKey(key: string): key is SyncedKey {
  return (SYNCED_KEYS as readonly string[]).includes(key)
}

/** Session tier first (fast, warm within this tab's lifetime), falling back to the durable local tier — needed so a fresh tab still works with the local server unreachable. */
function readStored<T>(key: string, initialValue: T): T {
  try {
    const fromSession = window.sessionStorage.getItem(key)
    if (fromSession !== null) return JSON.parse(fromSession) as T
    const fromLocal = window.localStorage.getItem(key)
    return fromLocal !== null ? (JSON.parse(fromLocal) as T) : initialValue
  } catch {
    return initialValue
  }
}

function writeStored(key: string, value: unknown) {
  const serialized = JSON.stringify(value)
  try {
    window.sessionStorage.setItem(key, serialized)
  } catch {
    // Ignore write errors (e.g. storage full or unavailable)
  }
  try {
    window.localStorage.setItem(key, serialized)
  } catch {
    // Ignore write errors (e.g. storage full or unavailable)
  }
}

/**
 * Reads/writes a value under `key`, backed by a fast `sessionStorage` tier
 * over a durable `localStorage` one. When `key` is one of `SYNCED_KEYS`,
 * also subscribes to live cross-device updates from the local LAN server
 * (see `syncClient.ts`) and publishes local writes back up to it — every
 * other key behaves exactly as before, local-browser-only.
 */
export function useLocalStorage<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(() => readStored(key, initialValue))

  // Keeps other tabs/windows *of this same browser* in sync: the `storage`
  // event fires only in tabs other than the one that wrote the change, so
  // this can't loop with `setStoredValue` below. Still relevant even for a
  // synced key — it's what makes two same-browser tabs feel instant, ahead
  // of the WS round-trip to the server and back.
  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== key || event.storageArea !== window.localStorage) return
      try {
        const parsed = event.newValue ? (JSON.parse(event.newValue) as T) : initialValue
        writeStored(key, parsed)
        setValue(parsed)
      } catch {
        // Ignore malformed external writes
      }
    }

    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [key, initialValue])

  // Cross-device sync via the local LAN server, for synced keys only.
  useEffect(() => {
    if (!isSyncedKey(key)) return
    return subscribe(key, (incoming) => {
      // `undefined` is never a legitimate JSON value — seeing it here means
      // the server's own stored entry for this key is itself corrupt (e.g.
      // a key added to `SYNCED_KEYS` before its default was wired up in
      // `server/store.ts`, seeding a `{ seeded: true }` entry with no
      // `value` at all). Ignoring it keeps this hook on its last-known-good
      // value instead of crashing every consumer that reads into it.
      if (incoming === undefined) {
        console.warn(`[sync] ignored an undefined update for "${key}" — the server's own stored value for this key looks corrupt.`)
        return
      }
      writeStored(key, incoming)
      setValue(incoming as T)
    })
  }, [key])

  /**
   * Accepts a plain value, or (matching React's own `setState`) an updater
   * function computing the next value from the current one. The updater
   * form reads that "current" value fresh from storage rather than from
   * this hook instance's own `value` — needed because two separate
   * `useLocalStorage(key, ...)` calls for the same key (e.g. `ScreensView`
   * and `ScreenForm` each calling `useScreens()`) each keep their own React
   * state, only reconciled via the debounced round-trip through the sync
   * server. A plain-value `setStoredValue(screens.map(...))` built from a
   * stale instance's own `screens` can silently clobber a write another
   * instance just made moments earlier (e.g. `ScreenForm`'s own unmount
   * cleanup undoing the very Save that triggered it) — computing from a
   * fresh storage read instead avoids that regardless of which instance's
   * state lagged behind.
   */
  const setStoredValue = (update: T | ((current: T) => T)) => {
    const newValue = typeof update === 'function' ? (update as (current: T) => T)(readStored(key, initialValue)) : update
    setValue(newValue)
    writeStored(key, newValue)
    if (isSyncedKey(key)) publish(key, newValue)
  }

  return [value, setStoredValue] as const
}
