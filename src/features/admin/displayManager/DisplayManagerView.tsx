import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Alert, Badge, Button, Card, CloseIcon, CollapsibleSection, Input, PlusIcon, Spinner, TranslatedText } from '../../../components'
import { useAdminSession } from '../../../hooks/useAdminSession'
import { useDisplayMachineCloseRequests } from '../../../hooks/useDisplayMachineCloseRequests'
import { useDisplayMachines } from '../../../hooks/useDisplayMachines'
import { useDisplayPairingRequests } from '../../../hooks/useDisplayPairingRequests'
import { useDisplayScreenOverride } from '../../../hooks/useDisplayScreenOverride'
import { useDisplayUpdateState } from '../../../hooks/useDisplayUpdateState'
import { useScreens } from '../../../hooks/useScreens'
import { useScrollToAndHighlight } from '../../../hooks/useScrollToAndHighlight'
import { useLanguage } from '../../../i18n'
import { approveDisplayPairing, getUpdatesStatus, setUpdateRollback } from '../../../lib/localServer'
import { DISPLAY_MAX_IMAGE_PX_OPTIONS, type DisplayMachine, type DisplayMaxImagePx, type DisplayUpdateProgressStatus, type DisplayUpdateTier } from '../../../types/displayMachine'
import { resolveDisplayUpdateState, type DisplayUpdateState, type UpdatesHubStatus } from '../../../utils/displayUpdateState'
import { connectionBadgeId } from './connectionBadge'
import { PublishApkControl } from './PublishApkControl'
import { useBulkUpdateRunner, type QueuedUpdate } from './updateQueue'
import './DisplayManagerView.scss'

/**
 * Maps a `mobile` machine's own reported `updateTier` to a label + `Badge` variant, shown next to
 * its connection-type badge — without this, "Update to current" looks identical for a Tier 1 (OTA
 * only) and a Tier 3 (needs an on-device confirmation tap) device even though the hub already
 * picks a genuinely different mechanism per machine server-side (`pushUpdateTriggersForNewEntries`
 * in `server/index.ts`); this badge just makes that already-correct decision visible to the admin.
 * `undefined` (a pre-Update-Channel client that's never reported a tier at all) renders nothing.
 */
function updateTierBadge(tier: DisplayUpdateTier | undefined): { variant: 'neutral' | 'info' | 'warning'; labelId: string } | null {
  switch (tier) {
    case 1:
      return { variant: 'neutral', labelId: 'admin.displayManager.updateTierOta' }
    case 2:
      return { variant: 'info', labelId: 'admin.displayManager.updateTierSilent' }
    case 3:
      return { variant: 'warning', labelId: 'admin.displayManager.updateTierPrompted' }
    default:
      return null
  }
}

/**
 * Maps a resolved `DisplayUpdateState` (see `resolveDisplayUpdateState`) to
 * the shared `Badge` component's own severity variant and an i18n label key.
 * Several states share a variant (e.g. `ota-available`/`apk-available` are
 * both just "an update exists") since `Badge`'s variants are severity
 * buckets, not one-per-state — the label text is what actually distinguishes
 * them, not the color.
 */
function updateStateBadge(state: DisplayUpdateState): { variant: 'neutral' | 'success' | 'warning' | 'error' | 'info'; labelId: string } {
  switch (state) {
    case 'current':
      return { variant: 'success', labelId: 'admin.displayManager.updateStateCurrent' }
    case 'ota-available':
      return { variant: 'info', labelId: 'admin.displayManager.updateStateOtaAvailable' }
    case 'apk-available':
      return { variant: 'info', labelId: 'admin.displayManager.updateStateApkAvailable' }
    case 'apk-prompted':
      return { variant: 'warning', labelId: 'admin.displayManager.updateStateApkPrompted' }
    case 'usb-required':
      return { variant: 'error', labelId: 'admin.displayManager.updateStateUsbRequired' }
    case 'unknown':
      return { variant: 'neutral', labelId: 'admin.displayManager.updateStateUnknown' }
    case 'offline':
      return { variant: 'neutral', labelId: 'admin.displayManager.updateStateOffline' }
  }
}

/**
 * Builds the `QueuedUpdate` a machine's own "Update to current" click (or a
 * bulk-update run including it) should write, from its already-resolved
 * `DisplayUpdateState` — `null` for any state with no real action (already
 * current, offline, unresolvable). `ota-available` targets the bundle
 * published for this machine's own `runtimeVersion`; `apk-available`/
 * `apk-prompted` both target the hub's current native `versionCode` (the
 * mechanism difference between silent-Tier-2 and prompted-Tier-3 is decided
 * server-side from the machine's own `updateTier`, not by which of these
 * two states resolved — see `pushUpdateTriggersForNewEntries` in
 * `server/index.ts`).
 */
function queuedUpdateFor(machine: DisplayMachine, state: DisplayUpdateState, updatesHubStatus: UpdatesHubStatus | null): QueuedUpdate | null {
  if (state === 'ota-available') {
    const targetUpdateId = machine.runtimeVersion ? updatesHubStatus?.currentUpdateIdByRuntimeVersion[machine.runtimeVersion] : undefined
    return targetUpdateId ? { machineID: machine.machineID, targetUpdateId } : null
  }
  if (state === 'apk-available' || state === 'apk-prompted') {
    const targetVersionCode = updatesHubStatus?.currentApk?.versionCode
    return targetVersionCode !== undefined ? { machineID: machine.machineID, targetVersionCode } : null
  }
  return null
}

/** i18n key for one `DisplayUpdateProgress` entry's own status — see that type's own doc comment for why `downloading`/`installing` don't actually appear yet even for a Tier 2/3 (APK) run (no device-reported phase transitions wired, every push starts at `awaiting-heartbeat` directly). */
function progressLabelId(status: DisplayUpdateProgressStatus): string {
  switch (status) {
    case 'downloading':
      return 'admin.displayManager.progressDownloading'
    case 'installing':
      return 'admin.displayManager.progressInstalling'
    case 'awaiting-heartbeat':
      return 'admin.displayManager.progressAwaitingHeartbeat'
    case 'update-failed':
      return 'admin.displayManager.progressFailed'
  }
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
  const [searchParams, setSearchParams] = useSearchParams()
  /** Guards the deep-link effect below so it only ever highlights the target pending card once — `pairingRequests` is synced data that may not have loaded its real snapshot yet on first render, same posture as `UsersView`'s own deep-link effect. */
  const consumedDeepLinkRef = useRef(false)
  const { registerRef: registerPendingRef, triggerHighlight: triggerPendingHighlight } = useScrollToAndHighlight()
  /** Guards the `?updateMachineId=` deep-link effect below, same reasoning as `consumedDeepLinkRef` above but independent — the two params can't consume each other's ref. */
  const consumedUpdateDeepLinkRef = useRef(false)
  const { registerRef: registerMachineRef, triggerHighlight: triggerMachineHighlight } = useScrollToAndHighlight()

  const [approvingMachineId, setApprovingMachineId] = useState<string | null>(null)
  const [approveError, setApproveError] = useState<string | null>(null)
  const [approveNotice, setApproveNotice] = useState<string | null>(null)

  // The hub's own current-APK/current-bundle reference (see `resolveDisplayUpdateState`'s own doc
  // comment) — `null` until the first fetch resolves, in which case every machine's own resolved
  // state falls back to "nothing to show yet" rather than a guessed one. Refetched on the same
  // cadence as the companion app's own heartbeat (20s) so a badge doesn't sit stale for a long-open
  // dashboard tab; a failed fetch is silently retried next interval, same best-effort posture as
  // every other polling loop in this codebase.
  const [updatesHubStatus, setUpdatesHubStatus] = useState<UpdatesHubStatus | null>(null)
  /** Also called directly after a successful APK publish (`PublishApkControl`'s `onPublished`) so the new `currentApk` shows immediately, without waiting out the rest of this interval. */
  const refreshUpdatesHubStatus = useCallback(async () => {
    if (!session) return
    try {
      const status = await getUpdatesStatus(session.token)
      setUpdatesHubStatus(status)
    } catch {
      // Ignore — see this state's own doc comment above.
    }
  }, [session])
  useEffect(() => {
    queueMicrotask(() => void refreshUpdatesHubStatus())
    const interval = setInterval(() => void refreshUpdatesHubStatus(), 20_000)
    return () => clearInterval(interval)
  }, [refreshUpdatesHubStatus])

  const [updateProgress, setUpdateProgress] = useDisplayUpdateState()

  /** Writes/replaces a `DisplayUpdateProgress` entry per queued machine and (via `applyUpdate`'s own diff in `server/index.ts`) is what actually causes the hub to push the right message (`check-update` or `install-update`, decided server-side from the machine's own `updateTier` — see `pushUpdateTriggersForNewEntries`'s own doc comment there) to each one. Shared by the single per-machine "Update to current" button and the bulk queue below. */
  const startUpdatesFor = (entries: QueuedUpdate[]) => {
    setUpdateProgress((current) => {
      const startedAt = new Date().toISOString()
      const withoutEntries = current.filter((entry) => !entries.some((queued) => queued.machineID === entry.machineID))
      const newEntries = entries.map((entry) => ({ machineID: entry.machineID, status: 'awaiting-heartbeat' as const, startedAt, ...('targetUpdateId' in entry ? { targetUpdateId: entry.targetUpdateId } : { targetVersionCode: entry.targetVersionCode }) }))
      return [...withoutEntries, ...newEntries]
    })
  }

  const { running: bulkRunning, startBulkUpdate, abortBulkUpdate } = useBulkUpdateRunner(updateProgress, startUpdatesFor)

  const [rollbackBusy, setRollbackBusy] = useState(false)
  const [rollbackError, setRollbackError] = useState<string | null>(null)

  const handleRollback = async (runtimeVersion: string, rolledBack: boolean) => {
    if (!session) return
    setRollbackBusy(true)
    setRollbackError(null)
    try {
      await setUpdateRollback(session.token, runtimeVersion, rolledBack)
    } catch (err) {
      setRollbackError(err instanceof Error ? err.message : t('admin.displayManager.rollbackError'))
    } finally {
      setRollbackBusy(false)
    }
  }

  const [screenOverrides, setScreenOverrides] = useDisplayScreenOverride()

  /**
   * Clears a display's own remote-navigation override, returning it to its
   * normal admin-assigned screen (Remote Screen Navigation spec — required
   * by the D1 safety model, not optional: an override the admin can't see
   * or undo is an assignment change that silently doesn't apply). The hub's
   * own `applyUpdate` diff (`server/index.ts`) picks up the removal and
   * pushes the recomputed `effective-screen` on its own — nothing else to
   * do here beyond the write itself.
   */
  const handleReturnToAssigned = (machineID: string) => {
    setScreenOverrides((current) => current.filter((entry) => entry.machineID !== machineID))
  }

  /**
   * Deep-link support: `?pendingMachineId=<id>` scrolls to and highlights that pending card — reached via the
   * notification bell (`NotificationsDropdown`) or global search (`useGlobalSearchIndex`), both of which build a
   * URL of the form `/admin/dashboard/displays?pendingMachineId=<id>`. `ScreensView`'s own effect
   * consumes `displayManager` and opens this view; this effect only ever touches `pendingMachineId`, the same
   * "each view strips only its own param" convention every other deep-linkable view follows. If the request was
   * already approved or expired by the time this runs, it's simply never found — same accepted behavior every
   * other synced-data deep link in this codebase already has for a since-deleted target.
   */
  useEffect(() => {
    if (consumedDeepLinkRef.current) return
    const pendingMachineId = searchParams.get('pendingMachineId')
    const request = pendingMachineId ? pairingRequests.find((candidate) => candidate.machineID === pendingMachineId) : undefined
    if (!request) return
    consumedDeepLinkRef.current = true
    triggerPendingHighlight(request.machineID)
    setSearchParams((current) => {
      current.delete('pendingMachineId')
      return current
    })
  }, [pairingRequests, searchParams, setSearchParams, triggerPendingHighlight])

  /**
   * Deep-link support: `?updateMachineId=<id>` scrolls to and highlights that machine's own card in
   * the regular (already-approved) grid — same convention as `?pendingMachineId=` above, just
   * targeting a joined `DisplayMachine` instead of a still-pending request, via its own independent
   * `consumedUpdateDeepLinkRef`/`registerMachineRef` pair so the two deep links can't interfere with
   * each other. Reached from Display Manager's own entry in `useGlobalSearchIndex.tsx`.
   */
  useEffect(() => {
    if (consumedUpdateDeepLinkRef.current) return
    const updateMachineId = searchParams.get('updateMachineId')
    const machine = updateMachineId ? machines.find((candidate) => candidate.machineID === updateMachineId) : undefined
    if (!machine) return
    consumedUpdateDeepLinkRef.current = true
    triggerMachineHighlight(machine.machineID)
    setSearchParams((current) => {
      current.delete('updateMachineId')
      return current
    })
  }, [machines, searchParams, setSearchParams, triggerMachineHighlight])

  const updateMachine = (machineID: string, update: (machine: DisplayMachine) => DisplayMachine) => {
    setMachines((current) => current.map((machine) => (machine.machineID === machineID ? update(machine) : machine)))
  }

  /** Writes to `customLabel`, never `label` itself — `label` is this machine's own self-reported name, silently overwritten by its own next heartbeat (see `DisplayMachine`'s own doc comment), so a rename typed here has to live somewhere the heartbeat never touches to actually stick. */
  const handleLabelChange = (machineID: string, customLabel: string) => {
    updateMachine(machineID, (machine) => ({ ...machine, customLabel }))
  }

  /** Writes this unit's own image-resolution ceiling. Same "lives where the heartbeat can't reach it" reasoning as `handleLabelChange` — see `mergeDisplayMachineHeartbeat` in `server/index.ts`, which carries `maxImagePx` over explicitly. The `<select>` yields strings, so the numeric tiers are parsed back before storing; `'auto'` stays a string. */
  const handleMaxImagePxChange = (machineID: string, value: string) => {
    const maxImagePx = (value === 'auto' ? 'auto' : Number(value)) as DisplayMaxImagePx
    updateMachine(machineID, (machine) => ({ ...machine, maxImagePx }))
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

  // Every machine "Update all" would act on right now — any machine whose resolved state has a
  // real QueuedUpdate behind it (see queuedUpdateFor). Mixes OTA and APK targets freely; which
  // mechanism each one actually gets is decided per-machine, server-side (see startUpdatesFor's
  // own doc comment).
  const actionableEntries: QueuedUpdate[] = machines.flatMap((machine) => {
    const state = resolveDisplayUpdateState(machine, updatesHubStatus)
    if (!state) return []
    const queued = queuedUpdateFor(machine, state, updatesHubStatus)
    return queued ? [queued] : []
  })

  const currentApk = updatesHubStatus?.currentApk ?? null
  const currentApkRolledBack = currentApk ? (updatesHubStatus?.rolledBackRuntimeVersions.includes(currentApk.runtimeVersion) ?? false) : false

  return (
    <div className="display-manager-view">
      {/* No Back button: this is a top-level section of its own now, not a sub-view reached from Screens. */}
      <div className="display-manager-view__header">
        <TranslatedText as="h1" id="admin.displayManager.title" />
      </div>
      <TranslatedText as="p" id="admin.displayManager.description" className="admin-page-description" />

      <button type="button" className="display-manager-view__add-row" onClick={openDisplayWindow}>
        <PlusIcon />
        {t('admin.displayManager.addDisplayButton')}
      </button>

      <div className="display-manager-view__update-actions">
        {currentApk && actionableEntries.length > 0 &&
          (bulkRunning ? (
            <Button type="button" variant="secondary" onClick={abortBulkUpdate}>
              {t('admin.displayManager.updateAllAbortButton')}
            </Button>
          ) : (
            <Button type="button" onClick={() => startBulkUpdate(actionableEntries)}>
              {t('admin.displayManager.updateAllButton')}
            </Button>
          ))}
        {currentApk && (
          <CollapsibleSection label={t('admin.displayManager.rollbackSectionLabel')} hint={t('admin.displayManager.rollbackSectionHint')}>
            {rollbackError && <Alert variant="error">{rollbackError}</Alert>}
            {currentApkRolledBack ? (
              <>
                <p>{t('admin.displayManager.rollbackActiveNotice')}</p>
                <Button type="button" variant="secondary" disabled={rollbackBusy} onClick={() => void handleRollback(currentApk.runtimeVersion, false)}>
                  {t('admin.displayManager.rollbackUndoButton')}
                </Button>
              </>
            ) : (
              <Button type="button" variant="secondary" disabled={rollbackBusy} onClick={() => void handleRollback(currentApk.runtimeVersion, true)}>
                {t('admin.displayManager.rollbackButton')}
              </Button>
            )}
          </CollapsibleSection>
        )}
        {/* Not gated on currentApk existing — publishing the very first APK ever is exactly the case where currentApk is still null. */}
        <CollapsibleSection label={t('admin.displayManager.publishApk.sectionLabel')} hint={t('admin.displayManager.publishApk.sectionHint')}>
          <PublishApkControl updatesHubStatus={updatesHubStatus} onPublished={() => void refreshUpdatesHubStatus()} />
        </CollapsibleSection>
      </div>

      {pairingRequests.length > 0 && (
        <section className="display-manager-view__pending">
          <h2 className="display-manager-view__pending-title">{t('admin.displayManager.pendingSectionTitle')}</h2>
          {approveNotice && <Alert variant="success">{approveNotice}</Alert>}
          {approveError && <Alert variant="error">{approveError}</Alert>}
          <div className="display-manager-view__pending-cards">
            {pairingRequests.map((request) => (
              <Card key={request.machineID} ref={registerPendingRef(request.machineID)} className="display-manager-view__pending-card">
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
            <Card key={machine.machineID} ref={registerMachineRef(machine.machineID)}>
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
              {machine.connectionType === 'mobile' && (
                <p className="display-manager-view__version-row">
                  <span className="display-manager-view__version-text">
                    {machine.versionName ? t('admin.displayManager.versionLabel', { versionName: machine.versionName }) : t('admin.displayManager.versionUnknown')}
                  </span>
                  {(() => {
                    const tierBadge = updateTierBadge(machine.updateTier)
                    return tierBadge && <Badge variant={tierBadge.variant}>{t(tierBadge.labelId)}</Badge>
                  })()}
                  {(() => {
                    // A pending progress entry (this machine's own update in flight, or recently
                    // failed) takes over the badge slot entirely — the resolved state underneath it
                    // is stale by definition until the entry clears (see mergeDisplayMachineHeartbeat).
                    const progressEntry = updateProgress.find((entry) => entry.machineID === machine.machineID)
                    if (progressEntry) {
                      return (
                        <>
                          {progressEntry.status !== 'update-failed' && <Spinner size="sm" />}
                          <Badge variant={progressEntry.status === 'update-failed' ? 'error' : 'info'}>{t(progressLabelId(progressEntry.status))}</Badge>
                        </>
                      )
                    }
                    const state = resolveDisplayUpdateState(machine, updatesHubStatus)
                    if (!state) return null
                    const { variant, labelId } = updateStateBadge(state)
                    const queuedUpdate = queuedUpdateFor(machine, state, updatesHubStatus)
                    return (
                      <>
                        <Badge variant={variant}>{t(labelId)}</Badge>
                        {queuedUpdate && (
                          <Button
                            type="button"
                            variant="secondary"
                            className="display-manager-view__update-button"
                            onClick={() => startUpdatesFor([queuedUpdate])}
                          >
                            {t('admin.displayManager.updateButton')}
                          </Button>
                        )}
                      </>
                    )
                  })()}
                </p>
              )}
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

              <div className="display-manager-view__image-cap">
                <label className="display-manager-view__image-cap-label" htmlFor={`machine-max-image-${machine.machineID}`}>
                  {t('admin.displayManager.maxImagePxLabel')}
                </label>
                <select
                  id={`machine-max-image-${machine.machineID}`}
                  className="display-manager-view__monitor-select"
                  value={String(machine.maxImagePx ?? 'auto')}
                  onChange={(event) => handleMaxImagePxChange(machine.machineID, event.target.value)}
                >
                  {DISPLAY_MAX_IMAGE_PX_OPTIONS.map((option) => (
                    <option key={String(option)} value={String(option)}>
                      {option === 'auto' ? t('admin.displayManager.maxImagePxAuto') : t('admin.displayManager.maxImagePxValue', { px: String(option) })}
                    </option>
                  ))}
                </select>
                <p className="display-manager-view__image-cap-hint">{t('admin.displayManager.maxImagePxHint')}</p>
              </div>
              {machine.connectionType === 'mobile' &&
                (() => {
                  const override = screenOverrides.find((entry) => entry.machineID === machine.machineID)
                  if (!override) return null
                  const screenName = screens.find((screen) => screen.screenID === override.screenId)?.name ?? override.screenId
                  return (
                    <div className="display-manager-view__override-row">
                      <div className="display-manager-view__override-summary">
                        <Badge variant="warning">{t('admin.displayManager.overriddenBadge')}</Badge>
                        <span className="display-manager-view__override-text">
                          {t('admin.displayManager.overriddenTo', { screenName, date: new Date(override.setAt).toLocaleString() })}
                        </span>
                      </div>
                      <p className="display-manager-view__override-hint">{t('admin.displayManager.overriddenHint')}</p>
                      <Button type="button" variant="secondary" onClick={() => handleReturnToAssigned(machine.machineID)}>
                        {t('admin.displayManager.returnToAssignedButton')}
                      </Button>
                    </div>
                  )
                })()}
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
