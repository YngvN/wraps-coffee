import { useEffect, useRef, useState } from 'react'
import { registerDisplayHeartbeat } from '../lib/localServer'
import type { DisplayConnectionType } from '../types/displayMachine'
import { generateId } from '../utils/id'
import { useDisplayMachineCloseRequests } from './useDisplayMachineCloseRequests'
import { useDisplayMachines } from './useDisplayMachines'

const HEARTBEAT_INTERVAL_MS = 20_000

/** Reads `key` from the given storage tier, creating and persisting a fresh id there on first read — `localStorage` (shared across every same-origin tab/window) for a device that should keep the same identity forever, `sessionStorage` (unique per browsing context) for a window that should get its own identity even when opened from an already-registered tab/window. */
function readOrCreateId(storage: Storage, key: string): string {
  const existing = storage.getItem(key)
  if (existing) return existing
  const created = generateId()
  storage.setItem(key, created)
  return created
}

interface UseDisplayMachineRegistrationOptions {
  /** `'localStorage'` for an identity that should persist across every tab/window of this browser (e.g. `/display-connect`, one tab = one device); `'sessionStorage'` for an identity unique to this one window (e.g. a Display window opened via `window.open()` — `localStorage` would collide with every other same-origin window). */
  idStorage: 'localStorage' | 'sessionStorage'
  idStorageKey: string
  connectionType: DisplayConnectionType
  /** Re-sent verbatim on every heartbeat tick — the server's own `mergeDisplayMachineHeartbeat` always overwrites the stored label with whatever the most recent heartbeat says, so this should reflect whatever this caller wants displayed, not necessarily what an admin may have renamed it to in Display Manager. */
  label: string
  monitorId: string
  monitorLabel: string
}

interface UseDisplayMachineRegistrationResult {
  /** This device/window's own machine id — stable for as long as the chosen storage tier keeps it around. */
  deviceId: string
  /** The Screen currently assigned to this device's one monitor (see `monitorId`), or `null` while unassigned. Reflects the live synced `admin.displayMachines` list, so it updates the moment an admin assigns/unassigns it from Display Manager or from this same window's own selector. */
  assignedScreenID: string | null
}

/**
 * Registers this browser tab/window as a `DisplayMachine` (see
 * `POST /display-machines/heartbeat`) reporting exactly one synthetic
 * monitor, and reads back its live Screen assignment — the shared logic
 * behind both `DisplayConnect.tsx` (a plain browser tab acting as a display)
 * and `DisplayWindow.tsx` (an admin-launched window standing in for one
 * physical monitor), which differ only in which storage tier backs their id
 * and what they render while waiting/assigned.
 */
export function useDisplayMachineRegistration({
  idStorage,
  idStorageKey,
  connectionType,
  label,
  monitorId,
  monitorLabel,
}: UseDisplayMachineRegistrationOptions): UseDisplayMachineRegistrationResult {
  const [deviceId] = useState(() => readOrCreateId(idStorage === 'localStorage' ? window.localStorage : window.sessionStorage, idStorageKey))
  const [machines, setMachines] = useDisplayMachines()
  const [closeRequests, setCloseRequests] = useDisplayMachineCloseRequests()
  const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    const heartbeat = () =>
      void registerDisplayHeartbeat({
        machineID: deviceId,
        label,
        connectionType,
        monitors: [{ id: monitorId, label: monitorLabel }],
      })
    heartbeat()
    heartbeatIntervalRef.current = setInterval(heartbeat, HEARTBEAT_INTERVAL_MS)
    return () => {
      if (heartbeatIntervalRef.current !== null) clearInterval(heartbeatIntervalRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `connectionType`/`label`/`monitorId`/`monitorLabel` are each fixed for a given caller's lifetime (DisplayConnect/DisplayWindow don't change them after mount); re-running the effect on every render of a caller that recomputes `label` fresh each time would restart the heartbeat interval for no reason.
  }, [deviceId])

  const closeRequested = closeRequests.includes(deviceId)
  /**
   * Remote-close: reacts to an admin's own "X" in Display Manager (see
   * `useDisplayMachineCloseRequests`) by stopping this window's own
   * heartbeat *first* (so it can't immediately heartbeat itself back into
   * `admin.displayMachines` moments after being asked to close — the exact
   * race that made deleting a still-active entry loop before this existed),
   * removing its own entry, pruning its own id back out of the close-request
   * list, and only then closing the window. `window.close()` reliably works
   * here specifically because a Display window is always opened via
   * `window.open()`; for a plain `/display-connect` tab a user navigated to
   * directly (not script-opened), it's a harmless no-op — the browser
   * simply won't act on it, matching why `DashboardWindowControls` hides its
   * own close button outside Electron for the same underlying reason.
   */
  useEffect(() => {
    if (!closeRequested) return
    if (heartbeatIntervalRef.current !== null) {
      clearInterval(heartbeatIntervalRef.current)
      heartbeatIntervalRef.current = null
    }
    setMachines((current) => current.filter((machine) => machine.machineID !== deviceId))
    setCloseRequests((current) => current.filter((id) => id !== deviceId))
    window.close()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `setMachines`/`setCloseRequests` are `useLocalStorage`'s own setters, a fresh function reference every render — depending on them directly would re-run this effect on every unrelated render; both always operate on a fresh read of storage internally (see `useLocalStorage.ts`'s own updater-form handling), so they're safe to omit here.
  }, [closeRequested, deviceId])

  const assignedScreenID = machines.find((machine) => machine.machineID === deviceId)?.monitors.find((monitor) => monitor.id === monitorId)?.assignedScreenID ?? null

  return { deviceId, assignedScreenID }
}
