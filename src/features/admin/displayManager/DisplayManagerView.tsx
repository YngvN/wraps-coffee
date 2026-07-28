import { BackButton, Button, Card, CloseIcon, Input, PlusIcon, TranslatedText } from '../../../components'
import { useDisplayMachineCloseRequests } from '../../../hooks/useDisplayMachineCloseRequests'
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
 * `DisplayStandby`) until one is picked here. Its own "+ Add Display" row
 * opens a new `DisplayWindow.tsx` window, which registers itself here the
 * same way any other display does. Rendered from `ScreensView` as a
 * submenu, not a route of its own — its own Back level (returning to the
 * Screens list) is registered by `ScreensView` itself, not here.
 */
export function DisplayManagerView() {
  const { t } = useLanguage()
  const [machines, setMachines] = useDisplayMachines()
  const [, setCloseRequests] = useDisplayMachineCloseRequests()
  const [screens] = useScreens()

  const updateMachine = (machineID: string, update: (machine: DisplayMachine) => DisplayMachine) => {
    setMachines((current) => current.map((machine) => (machine.machineID === machineID ? update(machine) : machine)))
  }

  /** Writes to `customLabel`, never `label` itself — `label` is this machine's own self-reported name, silently overwritten by its own next heartbeat (see `DisplayMachine`'s own doc comment), so a rename typed here has to live somewhere the heartbeat never touches to actually stick. */
  const handleLabelChange = (machineID: string, customLabel: string) => {
    updateMachine(machineID, (machine) => ({ ...machine, customLabel }))
  }

  const handleAssign = (machineID: string, monitorId: string, screenId: string) => {
    updateMachine(machineID, (machine) => ({
      ...machine,
      monitors: machine.monitors.map((monitor) => (monitor.id === monitorId ? { ...monitor, assignedScreenID: screenId || null } : monitor)),
    }))
  }

  /**
   * Forgets a machine entirely (e.g. a stale/duplicate Display window entry
   * left over from a closed tab, or a machine that's been decommissioned),
   * AND asks it to close itself if it's still actually open (see
   * `useDisplayMachineCloseRequests`, watched by every live `DisplayConnect`/
   * `DisplayWindow` tab via `useDisplayMachineRegistration`) — a still-live
   * window closes itself (stopping its own heartbeat first, so it can't
   * immediately heartbeat this entry back into existence) rather than just
   * reappearing here moments later. If nothing's actually listening (the
   * request matches no live window), it's just a harmless, small leftover
   * entry in `admin.displayMachineCloseRequests`.
   */
  const handleRemove = (machineID: string) => {
    if (!window.confirm(t('admin.common.confirmDelete'))) return
    setMachines((current) => current.filter((machine) => machine.machineID !== machineID))
    setCloseRequests((current) => (current.includes(machineID) ? current : [...current, machineID]))
  }

  /** Opens a new window standing in for one physical monitor, waiting to be assigned a Screen — see `DisplayWindow.tsx`. A relative URL, deliberately unlike the Screens list's own "Open"/"Editor" links (those are meant to be pasted onto a *different* device; a Display window represents an extra monitor on *this* machine, so it should stay on whatever origin the dashboard itself is already on). */
  const openDisplayWindow = () => {
    window.open('/display-window', '_blank')
  }

  return (
    <div className="display-manager-view">
      <div className="display-manager-view__header">
        <BackButton onClick={goBack}>{t('admin.common.backTo', { destination: t('admin.screens.title') })}</BackButton>
        <TranslatedText as="h1" id="admin.displayManager.title" />
      </div>
      <TranslatedText as="p" id="admin.displayManager.description" className="admin-page-description" />

      <button type="button" className="display-manager-view__add-row" onClick={openDisplayWindow}>
        <PlusIcon />
        {t('admin.displayManager.addDisplayButton')}
      </button>

      {machines.length === 0 ? (
        <p className="display-manager-view__empty">{t('admin.displayManager.empty')}</p>
      ) : (
        <div className="display-manager-view__machines">
          {machines.map((machine) => (
            <Card key={machine.machineID}>
              <div className="display-manager-view__machine-header">
                <Input
                  id={`machine-label-${machine.machineID}`}
                  value={machine.customLabel ?? machine.label}
                  onChange={(event) => handleLabelChange(machine.machineID, event.target.value)}
                />
                <span className={`display-manager-view__badge display-manager-view__badge--${machine.connectionType}`}>
                  {t(machine.connectionType === 'url' ? 'admin.displayManager.viaUrlBadge' : 'admin.displayManager.electronBadge')}
                </span>
                <Button
                  type="button"
                  variant="secondary"
                  className="display-manager-view__remove-button"
                  onClick={() => handleRemove(machine.machineID)}
                  aria-label={t('admin.common.delete')}
                  title={t('admin.common.delete')}
                >
                  <CloseIcon />
                </Button>
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
