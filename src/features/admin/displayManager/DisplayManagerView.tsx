import { BackButton, Card, Input, TranslatedText } from '../../../components'
import { useDisplayMachines } from '../../../hooks/useDisplayMachines'
import { useScreens } from '../../../hooks/useScreens'
import { useLanguage } from '../../../i18n'
import { goBack } from '../../../lib/backStack'
import type { DisplayMachine } from '../../../types/displayMachine'
import './DisplayManagerView.scss'

/**
 * Every machine (an Electron kiosk managing its own detected monitors) or
 * browser tab (`/display-connect`) that has ever heartbeated in (see
 * `POST /display-machines/heartbeat`), each with its own monitors and a
 * Screen-assignment selector per monitor. A monitor with no Screen assigned
 * shows the bouncing-company-name standby screensaver instead (see
 * `DisplayStandby`) until one is picked here. Rendered from `ScreensView` as
 * a submenu, not a route of its own — its own Back level (returning to the
 * Screens list) is registered by `ScreensView` itself, not here.
 */
export function DisplayManagerView() {
  const { t } = useLanguage()
  const [machines, setMachines] = useDisplayMachines()
  const [screens] = useScreens()

  const updateMachine = (machineID: string, update: (machine: DisplayMachine) => DisplayMachine) => {
    setMachines((current) => current.map((machine) => (machine.machineID === machineID ? update(machine) : machine)))
  }

  const handleLabelChange = (machineID: string, label: string) => {
    updateMachine(machineID, (machine) => ({ ...machine, label }))
  }

  const handleAssign = (machineID: string, monitorId: string, screenId: string) => {
    updateMachine(machineID, (machine) => ({
      ...machine,
      monitors: machine.monitors.map((monitor) => (monitor.id === monitorId ? { ...monitor, assignedScreenID: screenId || null } : monitor)),
    }))
  }

  return (
    <div className="display-manager-view">
      <div className="display-manager-view__header">
        <BackButton onClick={goBack}>{t('admin.common.backTo', { destination: t('admin.screens.title') })}</BackButton>
        <TranslatedText as="h1" id="admin.displayManager.title" />
      </div>
      <TranslatedText as="p" id="admin.displayManager.description" className="admin-page-description" />

      {machines.length === 0 ? (
        <p className="display-manager-view__empty">{t('admin.displayManager.empty')}</p>
      ) : (
        <div className="display-manager-view__machines">
          {machines.map((machine) => (
            <Card key={machine.machineID}>
              <div className="display-manager-view__machine-header">
                <Input
                  id={`machine-label-${machine.machineID}`}
                  value={machine.label}
                  onChange={(event) => handleLabelChange(machine.machineID, event.target.value)}
                />
                <span className={`display-manager-view__badge display-manager-view__badge--${machine.connectionType}`}>
                  {t(machine.connectionType === 'url' ? 'admin.displayManager.viaUrlBadge' : 'admin.displayManager.electronBadge')}
                </span>
              </div>
              <p className="display-manager-view__last-seen">{t('admin.displayManager.lastSeen', { date: new Date(machine.lastSeenAt).toLocaleString() })}</p>
              <ul className="display-manager-view__monitors">
                {machine.monitors.map((monitor) => (
                  <li key={monitor.id} className="display-manager-view__monitor">
                    <span className="display-manager-view__monitor-label">{monitor.label}</span>
                    <select
                      className="display-manager-view__monitor-select"
                      value={monitor.assignedScreenID ?? ''}
                      onChange={(event) => handleAssign(machine.machineID, monitor.id, event.target.value)}
                    >
                      <option value="">{t('admin.displayManager.unassignedOption')}</option>
                      {screens.map((screen) => (
                        <option key={screen.screenID} value={screen.screenID}>
                          {screen.name}
                        </option>
                      ))}
                    </select>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
