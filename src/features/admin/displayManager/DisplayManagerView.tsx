import { useState } from 'react'
import { Alert, BackButton, Button, Card, CloseIcon, Input, PlusIcon, TranslatedText } from '../../../components'
import { useAdminSession } from '../../../hooks/useAdminSession'
import { useDisplayMachineCloseRequests } from '../../../hooks/useDisplayMachineCloseRequests'
import { useDisplayMachines } from '../../../hooks/useDisplayMachines'
import { useDisplayPairingRequests } from '../../../hooks/useDisplayPairingRequests'
import { useScreens } from '../../../hooks/useScreens'
import { useLanguage } from '../../../i18n'
import { goBack } from '../../../lib/backStack'
import { approveDisplayPairing } from '../../../lib/localServer'
import type { DisplayConnectionType, DisplayMachine } from '../../../types/displayMachine'
import './DisplayManagerView.scss'

/** i18n key for a machine's own connection-type badge — extends the same convention `admin.displayManager.electronBadge`/`viaUrlBadge` already had to a third `mobile` (ADHDisplay Companion) case. */
function connectionBadgeId(connectionType: DisplayConnectionType): string {
  if (connectionType === 'mobile') return 'admin.displayManager.mobileBadge'
  if (connectionType === 'url') return 'admin.displayManager.viaUrlBadge'
  return 'admin.displayManager.electronBadge'
}

/**
 * Every machine (an Electron kiosk managing its own detected monitors), a
 * plain browser tab (`/display-connect`), or a paired ADHDisplay Companion
 * app instance that has ever heartbeated in (see
 * `POST /display-machines/heartbeat`), each with its own monitors and a
 * Screen-assignment selector per monitor. A monitor with no Screen assigned
 * shows the bouncing-company-name standby screensaver instead (see
 * `DisplayStandby`) until one is picked here. Its own "+ Add Display" row
 * opens a new `DisplayWindow.tsx` window, which registers itself here the
 * same way any other display does. A mobile device that's heartbeated in
 * but not yet approved shows up passively — no "look for displays" step
 * needed — in the "Pending approval" section above the machines grid (see
 * `useDisplayPairingRequests`), each card showing its own `#suffix` (the
 * pending request's own `machineID`, last 4 characters) that also appears
 * on the TV's own `PairingScreen` so an admin can cross-check the dashboard
 * card against the physical device before clicking Approve — the one-click
 * button is the entire approval flow, no PIN/QR involved. Once approved it
 * becomes a real entry in the machines grid below. Rendered from
 * `ScreensView` as a submenu, not a route of its own — its own Back level
 * (returning to the Screens list) is registered by `ScreensView` itself,
 * not here.
 */
export function DisplayManagerView() {
  const { t } = useLanguage()
  const { session } = useAdminSession()
  const [machines, setMachines] = useDisplayMachines()
  const [, setCloseRequests] = useDisplayMachineCloseRequests()
  const [pairingRequests] = useDisplayPairingRequests()
  const [screens] = useScreens()

  const [approvingMachineId, setApprovingMachineId] = useState<string | null>(null)
  const [approveError, setApproveError] = useState<string | null>(null)
  const [approveNotice, setApproveNotice] = useState<string | null>(null)

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
   * entry in `admin.displayMachineCloseRequests`. For a `mobile` machine,
   * this doubles as real revocation: the heartbeat route requires an
   * already-approved `admin.displayMachines` entry for `connectionType:
   * 'mobile'`, so removing it here blocks the device from re-joining until
   * an admin approves it again from scratch — unlike `electron`/`url`,
   * which can always rejoin.
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

  const handleApprove = async (machineID: string) => {
    if (!session) return
    setApprovingMachineId(machineID)
    setApproveError(null)
    setApproveNotice(null)
    try {
      const { approvedLabel } = await approveDisplayPairing(session.token, machineID)
      setApproveNotice(t('admin.displayManager.pairingApproved', { label: approvedLabel }))
    } catch (err) {
      setApproveError(err instanceof Error ? err.message : t('admin.displayManager.pairingApproveError'))
    } finally {
      setApprovingMachineId(null)
    }
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

      {pairingRequests.length > 0 && (
        <section className="display-manager-view__pending">
          <h2 className="display-manager-view__pending-title">{t('admin.displayManager.pendingSectionTitle')}</h2>
          {approveNotice && <Alert variant="success">{approveNotice}</Alert>}
          {approveError && <Alert variant="error">{approveError}</Alert>}
          <div className="display-manager-view__pending-cards">
            {pairingRequests.map((request) => (
              <Card key={request.machineID} className="display-manager-view__pending-card">
                <div className="display-manager-view__pending-card-header">
                  <span className="display-manager-view__pending-label">{request.label}</span>
                  <span className="display-manager-view__id-suffix">#{request.machineID.slice(-4)}</span>
                </div>
                <span className="display-manager-view__badge display-manager-view__badge--pending">
                  {t('admin.displayManager.pendingBadge')}
                </span>
                <p className="display-manager-view__last-seen">
                  {t('admin.displayManager.lastSeen', { date: new Date(request.lastSeenAt).toLocaleString() })}
                </p>
                <Button
                  type="button"
                  onClick={() => void handleApprove(request.machineID)}
                  disabled={approvingMachineId === request.machineID}
                >
                  {t('admin.displayManager.approveButton')}
                </Button>
              </Card>
            ))}
          </div>
        </section>
      )}

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
                  {t(connectionBadgeId(machine.connectionType))}
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
