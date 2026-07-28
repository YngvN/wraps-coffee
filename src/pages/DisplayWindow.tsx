import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { DisplayControlsBar } from '../features/screens/DisplayControlsBar'
import { useAdminSession } from '../hooks/useAdminSession'
import { useDisplayMachineRegistration } from '../hooks/useDisplayMachineRegistration'
import { useDisplayMachines } from '../hooks/useDisplayMachines'
import type { DisplayMachine } from '../types/displayMachine'
import './DisplayWindow.scss'

const DEVICE_ID_STORAGE_KEY = 'wrapsCoffeeDisplayWindowId'
const LABEL_STORAGE_KEY = 'wrapsCoffeeDisplayWindowLabel'
const MONITOR_ID = 'display-window'
const LABEL_PATTERN = /^Display (\d+)$/

/** The next `"Display N"` name — one past the highest `N` already reported by any currently-known `url`-connection machine, or `1` if none match. Best-effort (reads whatever's synced by the moment a new window mounts) rather than a guaranteed-unique server-assigned counter — purely cosmetic, so a rare collision just means two windows happen to share a name, not a broken assignment. */
function computeNextDisplayLabel(machines: DisplayMachine[]): string {
  const highest = machines
    .filter((machine) => machine.connectionType === 'url')
    .map((machine) => Number(machine.label.match(LABEL_PATTERN)?.[1]))
    .filter((n) => !Number.isNaN(n))
    .reduce((max, n) => Math.max(max, n), 0)
  return `Display ${highest + 1}`
}

/**
 * The page a Display window (opened via Display Manager's own "+ Add
 * Display" button, see `DisplayManagerView.tsx`) sits on — a stand-in for
 * one physical monitor, waiting to be assigned a Screen. Registers itself as
 * a `connectionType: 'url'` `DisplayMachine` (see `useDisplayMachineRegistration`)
 * exactly like `/display-connect` does, just identified by a
 * `sessionStorage`-persisted id (unique per opened window, unlike
 * `/display-connect`'s `localStorage` one — several Display windows opened
 * from the same browser must never collide onto one shared identity) and
 * showing a plain centered name instead of the bouncing standby screensaver.
 * `useAdminSession` primes this window's own copy of `syncClient.ts`'s auth
 * token from this same-origin browser's already-logged-in session, which is
 * what lets `DisplayControlsBar`'s own screen-selector write straight to
 * `admin.displayMachines` without any further plumbing.
 */
export function DisplayWindow() {
  useAdminSession()
  const [machines] = useDisplayMachines()
  const [label] = useState(() => {
    const cached = window.sessionStorage.getItem(LABEL_STORAGE_KEY)
    if (cached) return cached
    const computed = computeNextDisplayLabel(machines)
    window.sessionStorage.setItem(LABEL_STORAGE_KEY, computed)
    return computed
  })
  const { deviceId, assignedScreenID } = useDisplayMachineRegistration({
    idStorage: 'sessionStorage',
    idStorageKey: DEVICE_ID_STORAGE_KEY,
    connectionType: 'url',
    label,
    monitorId: MONITOR_ID,
    monitorLabel: label,
  })

  if (assignedScreenID) {
    return <Navigate to={`/screens/${assignedScreenID}?unattended=1&displayMachineId=${deviceId}&monitorId=${MONITOR_ID}`} replace />
  }

  return (
    <div className="display-window">
      <span className="display-window__label">{label}</span>
      <DisplayControlsBar machineID={deviceId} monitorId={MONITOR_ID} />
    </div>
  )
}
