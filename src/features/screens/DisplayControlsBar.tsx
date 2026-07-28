import { DashboardWindowControls } from '../admin/layout/DashboardWindowControls'
import { useDisplayMachines } from '../../hooks/useDisplayMachines'
import { useScreens } from '../../hooks/useScreens'
import { useLanguage } from '../../i18n'
import './DisplayControlsBar.scss'

interface DisplayControlsBarProps {
  /** Which `DisplayMachine`/monitor this bar's own screen-selector reads/writes — see `useDisplayMachineRegistration`'s `deviceId`/`monitorId`. */
  machineID: string
  monitorId: string
  /** Fades the whole bar (selector + window controls together, as one unit) without unmounting it — for a caller auto-hiding this after mouse/touch inactivity (see `useIdleVisibility`). Left `false` (the default) for `DisplayWindow`'s own waiting state, which keeps this permanently visible since there's nothing else on screen and the selector is the only way to assign it. */
  hidden?: boolean
}

/**
 * Top-right container combining this display's own name (its `DisplayMachine`
 * label — "Display N" by default, see `DisplayWindow.tsx`), a "show available
 * screens" selector (screen names only), and the existing
 * `DashboardWindowControls` (minimize/fullscreen/close inside Electron, a
 * plain fullscreen button in a browser tab — reused as-is rather than
 * reimplemented, since a Display window's own window-chrome needs are
 * identical). Assigning a Screen here writes straight to the same synced
 * `admin.displayMachines` key `DisplayManagerView` itself writes to, so
 * either place immediately reflects the other.
 */
export function DisplayControlsBar({ machineID, monitorId, hidden = false }: DisplayControlsBarProps) {
  const { t } = useLanguage()
  const [machines, setMachines] = useDisplayMachines()
  const [screens] = useScreens()

  const machine = machines.find((candidate) => candidate.machineID === machineID)
  const assignedScreenID = machine?.monitors.find((monitor) => monitor.id === monitorId)?.assignedScreenID ?? ''

  const handleAssign = (screenId: string) => {
    setMachines((current) =>
      current.map((candidate) =>
        candidate.machineID !== machineID
          ? candidate
          : { ...candidate, monitors: candidate.monitors.map((monitor) => (monitor.id !== monitorId ? monitor : { ...monitor, assignedScreenID: screenId || null })) },
      ),
    )
  }

  return (
    <div className={`display-controls-bar${hidden ? ' display-controls-bar--hidden' : ''}`}>
      {machine && <span className="display-controls-bar__label">{machine.customLabel ?? machine.label}</span>}
      <select
        className="display-controls-bar__select"
        aria-label={t('displayWindow.showScreensLabel')}
        value={assignedScreenID}
        onChange={(event) => handleAssign(event.target.value)}
      >
        <option value="">{t('admin.displayManager.unassignedOption')}</option>
        {screens.map((screen) => (
          <option key={screen.screenID} value={screen.screenID}>
            {screen.name}
          </option>
        ))}
      </select>
      <DashboardWindowControls variant="inline" />
    </div>
  )
}
