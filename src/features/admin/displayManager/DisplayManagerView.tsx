import { QRCodeSVG } from 'qrcode.react'
import { useEffect, useState } from 'react'
import { Alert, BackButton, Button, Card, CloseIcon, Input, Modal, PlusIcon, TranslatedText } from '../../../components'
import { useAdminSession } from '../../../hooks/useAdminSession'
import { useDisplayMachineCloseRequests } from '../../../hooks/useDisplayMachineCloseRequests'
import { useDisplayMachines } from '../../../hooks/useDisplayMachines'
import { useDisplayPairingRequests } from '../../../hooks/useDisplayPairingRequests'
import { useScreens } from '../../../hooks/useScreens'
import { useLanguage } from '../../../i18n'
import { goBack } from '../../../lib/backStack'
import { approveDisplayPairing, getServerInfo } from '../../../lib/localServer'
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
 * same way any other display does; "Pair a mobile display" instead shows a
 * QR code for the ADHDisplay Companion app to scan. A mobile device that's
 * heartbeated in but not yet approved shows up in its own "Pairing
 * requests" section above the machines grid instead of in the grid itself
 * (see `useDisplayPairingRequests`) — approving one there (typing its PIN)
 * is what turns it into a real entry below. Rendered from `ScreensView` as a
 * submenu, not a route of its own — its own Back level (returning to the
 * Screens list) is registered by `ScreensView` itself, not here.
 */
export function DisplayManagerView() {
  const { t } = useLanguage()
  const { session } = useAdminSession()
  const [machines, setMachines] = useDisplayMachines()
  const [, setCloseRequests] = useDisplayMachineCloseRequests()
  const [pairingRequests] = useDisplayPairingRequests()
  const [screens] = useScreens()

  const [pinDrafts, setPinDrafts] = useState<Record<string, string>>({})
  const [approvingMachineId, setApprovingMachineId] = useState<string | null>(null)
  const [approveError, setApproveError] = useState<string | null>(null)
  const [approveNotice, setApproveNotice] = useState<string | null>(null)

  // Purely client-side "PIN refreshed" detection (see this component's own
  // doc comment) — no server field for it, since the server already tells us
  // the current PIN on every heartbeat broadcast; this just remembers the
  // previous one per machineID long enough to notice it changed (PIN_TTL_MS
  // lapsed and the device rolled a fresh one) rather than an admin mistaking
  // a rotated PIN for a wrong one. Derived during render itself — the "adjust
  // state when a prop changes" pattern from the React docs, using state (not
  // a ref, which this codebase's lint config disallows reading/writing
  // during render) to remember what was already compared, guarded so it only
  // runs once per actual change rather than in a useEffect (a synchronous
  // setState in an effect body is exactly the extra-render round-trip this
  // pattern is meant to avoid).
  const [previousPins, setPreviousPins] = useState<Record<string, string>>({})
  const [refreshedPinIds, setRefreshedPinIds] = useState<Record<string, boolean>>({})
  const pairingPinsKey = pairingRequests.map((request) => `${request.machineID}:${request.pin}`).join('|')
  const [lastPairingPinsKey, setLastPairingPinsKey] = useState<string | null>(null)
  if (lastPairingPinsKey !== pairingPinsKey) {
    setLastPairingPinsKey(pairingPinsKey)
    const nextPreviousPins: Record<string, string> = {}
    const changed: Record<string, boolean> = {}
    for (const request of pairingRequests) {
      const previousPin = previousPins[request.machineID]
      if (previousPin && previousPin !== request.pin) changed[request.machineID] = true
      nextPreviousPins[request.machineID] = request.pin
    }
    setPreviousPins(nextPreviousPins)
    if (Object.keys(changed).length > 0) setRefreshedPinIds((current) => ({ ...current, ...changed }))
  }

  const [showPairModal, setShowPairModal] = useState(false)
  const [pairServerInfo, setPairServerInfo] = useState<{ lanIp: string | null; wsPort: number; contentPort: number } | null>(null)
  const [pairServerInfoFailed, setPairServerInfoFailed] = useState(false)

  useEffect(() => {
    if (!showPairModal) return
    let cancelled = false
    getServerInfo()
      .then((info) => {
        if (cancelled) return
        setPairServerInfo(info)
        setPairServerInfoFailed(false)
      })
      .catch(() => {
        if (!cancelled) setPairServerInfoFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [showPairModal])

  // Ticks every 30s purely to re-render the pairing cards' own "requested
  // Xm ago" text — Date.now() can't be called directly during render (an
  // impure call), so this state value stands in for "now" there instead.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (pairingRequests.length === 0) return
    const interval = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(interval)
  }, [pairingRequests.length])

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
   * 'mobile'`, so removing it here blocks the device from re-joining
   * without a fresh PIN — unlike `electron`/`url`, which can always rejoin.
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
    const pin = (pinDrafts[machineID] ?? '').trim()
    if (!pin) return
    setApprovingMachineId(machineID)
    setApproveError(null)
    setApproveNotice(null)
    try {
      const { approvedLabel } = await approveDisplayPairing(session.token, machineID, pin)
      setApproveNotice(t('admin.displayManager.pairingApproved', { label: approvedLabel }))
      setPinDrafts((current) => {
        const next = { ...current }
        delete next[machineID]
        return next
      })
    } catch (err) {
      setApproveError(err instanceof Error ? err.message : t('admin.displayManager.pairingApproveError'))
    } finally {
      setApprovingMachineId(null)
    }
  }

  const pairPayload =
    pairServerInfo?.lanIp != null
      ? `adhdisplay-companion-pair://v1?host=${encodeURIComponent(pairServerInfo.lanIp)}&wsPort=${pairServerInfo.wsPort}&contentPort=${pairServerInfo.contentPort}`
      : null

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
      <button type="button" className="display-manager-view__add-row" onClick={() => setShowPairModal(true)}>
        <PlusIcon />
        {t('admin.displayManager.pairMobileButton')}
      </button>

      {(pairingRequests.length > 0 || approveNotice || approveError) && (
        <div className="display-manager-view__pairing-section">
          {pairingRequests.length > 0 && <h2 className="display-manager-view__pairing-title">{t('admin.displayManager.pairingSectionTitle')}</h2>}
          {/* Rendered outside the `pairingRequests.length > 0` gate above (unlike the title/list) so approving
              the *only* pending request doesn't make this message vanish the instant the list empties out —
              this is exactly what's supposed to make a cross-match approval (a different device than the one
              clicked) visible, so it can't be allowed to disappear before an admin has a chance to read it. */}
          {approveNotice && <Alert variant="success">{approveNotice}</Alert>}
          {approveError && <Alert variant="error">{approveError}</Alert>}
          {pairingRequests.length > 0 && (
            <div className="display-manager-view__pairing-requests">
              {pairingRequests.map((request) => (
                <Card key={request.machineID} className="display-manager-view__pairing-card">
                  <div className="display-manager-view__pairing-card-header">
                    <span className="display-manager-view__pairing-label">{request.label}</span>
                    <span className="display-manager-view__pairing-requested-at">
                      {t('admin.displayManager.pairingRequestedAgo', { minutes: Math.max(0, Math.round((now - new Date(request.createdAt).getTime()) / 60000)) })}
                    </span>
                  </div>
                  <div className="display-manager-view__pairing-pin-row">
                    <span className="display-manager-view__pairing-pin">{request.pin}</span>
                    {refreshedPinIds[request.machineID] && (
                      <span className="display-manager-view__pairing-pin-refreshed">{t('admin.displayManager.pinRefreshed')}</span>
                    )}
                  </div>
                  <div className="display-manager-view__pairing-approve-row">
                    <Input
                      id={`pairing-pin-${request.machineID}`}
                      label={t('admin.displayManager.pinInputLabel')}
                      value={pinDrafts[request.machineID] ?? ''}
                      onChange={(event) => setPinDrafts((current) => ({ ...current, [request.machineID]: event.target.value }))}
                      inputMode="numeric"
                    />
                    <Button
                      type="button"
                      onClick={() => void handleApprove(request.machineID)}
                      disabled={approvingMachineId === request.machineID || !(pinDrafts[request.machineID] ?? '').trim()}
                    >
                      {t('admin.displayManager.approveButton')}
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
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

      <Modal open={showPairModal} onClose={() => setShowPairModal(false)} title={t('admin.displayManager.pairModalTitle')} transparentOnSliderDrag={false}>
        <p className="display-manager-view__pair-modal-description">{t('admin.displayManager.pairModalDescription')}</p>
        {pairServerInfoFailed && <Alert variant="error">{t('admin.displayManager.pairModalError')}</Alert>}
        {pairPayload && (
          <>
            <div className="display-manager-view__pair-qr">
              <QRCodeSVG value={pairPayload} bgColor="transparent" fgColor="currentColor" />
            </div>
            <p className="display-manager-view__pair-manual">
              {t('admin.displayManager.pairManualEntry', { host: pairServerInfo?.lanIp ?? '', wsPort: String(pairServerInfo?.wsPort ?? ''), contentPort: String(pairServerInfo?.contentPort ?? '') })}
            </p>
          </>
        )}
      </Modal>
    </div>
  )
}
