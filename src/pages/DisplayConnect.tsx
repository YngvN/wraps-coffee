import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { FullscreenToggle } from '../features/screens/FullscreenToggle'
import { ScreenToolbar } from '../features/screens/ScreenToolbar'
import { useDisplayMachines } from '../hooks/useDisplayMachines'
import { registerDisplayHeartbeat } from '../lib/localServer'
import { DisplayStandby } from './DisplayStandby'

const DEVICE_ID_STORAGE_KEY = 'wrapsCoffeeDisplayDeviceId'
const HEARTBEAT_INTERVAL_MS = 20_000
/** A `url`-connection machine only ever has itself to report — this browser tab — so it always reports exactly one synthetic "monitor" under this fixed id. */
const MONITOR_ID = 'browser-tab'

function readOrCreateDeviceId(): string {
  const existing = window.localStorage.getItem(DEVICE_ID_STORAGE_KEY)
  if (existing) return existing
  const created = crypto.randomUUID()
  window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, created)
  return created
}

/**
 * "Add a display via URL" — lets a plain browser tab (a smart TV's browser,
 * a tablet, anything with no Electron involved) register itself as a
 * Display Manager target, tagged `connectionType: 'url'` so it shows up
 * badged differently from an Electron-detected monitor. Identified by a
 * `localStorage`-persisted id rather than a real machine/monitor id, since
 * there's no Electron main process here to generate/store one in
 * `display-role.json`. Shows the standby screensaver (plus a manual
 * fullscreen button — this tab has no OS-level kiosk mode to fall back on)
 * until a Screen is assigned, then hands off to `ScreenDisplay` itself.
 */
export function DisplayConnect() {
  const [deviceId] = useState(readOrCreateDeviceId)
  const [machines] = useDisplayMachines()

  useEffect(() => {
    const heartbeat = () =>
      void registerDisplayHeartbeat({
        machineID: deviceId,
        label: `Browser (${window.navigator.userAgent.split(' ')[0]})`,
        connectionType: 'url',
        monitors: [{ id: MONITOR_ID, label: 'Browser tab' }],
      })
    heartbeat()
    const interval = setInterval(heartbeat, HEARTBEAT_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [deviceId])

  const assignedScreenID = machines.find((machine) => machine.machineID === deviceId)?.monitors.find((monitor) => monitor.id === MONITOR_ID)?.assignedScreenID

  if (assignedScreenID) {
    return <Navigate to={`/screens/${assignedScreenID}?unattended=1&showFullscreenButton=1`} replace />
  }

  return (
    <>
      <DisplayStandby />
      <ScreenToolbar>
        <FullscreenToggle />
      </ScreenToolbar>
    </>
  )
}
