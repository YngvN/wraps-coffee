import { Navigate } from 'react-router-dom'
import { FullscreenToggle } from '../features/screens/FullscreenToggle'
import { ScreenToolbar } from '../features/screens/ScreenToolbar'
import { useDisplayMachineRegistration } from '../hooks/useDisplayMachineRegistration'
import { DisplayStandby } from './DisplayStandby'

const DEVICE_ID_STORAGE_KEY = 'adhdisplayDeviceId'
/** A `url`-connection machine only ever has itself to report — this browser tab — so it always reports exactly one synthetic "monitor" under this fixed id. */
const MONITOR_ID = 'browser-tab'

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
  const { assignedScreenID } = useDisplayMachineRegistration({
    idStorage: 'localStorage',
    idStorageKey: DEVICE_ID_STORAGE_KEY,
    connectionType: 'url',
    label: `Browser (${window.navigator.userAgent.split(' ')[0]})`,
    monitorId: MONITOR_ID,
    monitorLabel: 'Browser tab',
  })

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
