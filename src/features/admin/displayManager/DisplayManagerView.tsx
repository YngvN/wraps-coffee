import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Alert, Badge, Button, Card, CollapsibleSection, PlusIcon, StatusDot, TranslatedText } from '../../../components'
import { useAdminSession } from '../../../hooks/useAdminSession'
import { useClockFormatPreference } from '../../../hooks/useClockFormatPreference'
import { useDateFormatPreference } from '../../../hooks/useDateFormatPreference'
import { useDisplayMachineCloseRequests } from '../../../hooks/useDisplayMachineCloseRequests'
import { useDisplayMachines } from '../../../hooks/useDisplayMachines'
import { useDisplayPairingRequests } from '../../../hooks/useDisplayPairingRequests'
import { useDisplayScreenOverride } from '../../../hooks/useDisplayScreenOverride'
import { useDisplayUpdateState } from '../../../hooks/useDisplayUpdateState'
import { useNow } from '../../../hooks/useNow'
import { useScreens } from '../../../hooks/useScreens'
import { useScrollToAndHighlight } from '../../../hooks/useScrollToAndHighlight'
import { useLanguage } from '../../../i18n'
import { approveDisplayPairing, getUpdatesStatus, setUpdateRollback } from '../../../lib/localServer'
import { type DisplayMachine, type DisplayMaxImagePx, type DisplayRenderWidth, type DisplayUpdateProgressStatus } from '../../../types/displayMachine'
import { formatDateTime } from '../../../utils/clockFormat'
import { resolveDisplayConnectionStatus } from '../../../utils/displayConnection'
import { resolveDisplayUpdateState, type DisplayUpdateState, type UpdatesHubStatus } from '../../../utils/displayUpdateState'
import { connectionStatusDot } from './connectionStatusDot'
import { DisplayCard } from './DisplayCard'
import { DisplayDetailsModal, type DisplayUpdatePanel } from './DisplayDetailsModal'
import { PublishApkControl } from './PublishApkControl'
import { resolveDisplayedScreen } from './resolveDisplayedScreen'
import { useBulkUpdateRunner, type QueuedUpdate } from './updateQueue'
import './DisplayManagerView.scss'

/**
 * Maps a resolved `DisplayUpdateState` to the plain-language line the admin
 * actually reads, plus (only where it changes what they must physically do)
 * a note about the device's own capability.
 *
 * Update *tiers* are deliberately not shown any more. "Tier 1 · OTA only"
 * described this codebase's internal capability model, not anything an
 * admin can act on — and the hub already picks the right mechanism per
 * machine server-side (`pushUpdateTriggersForNewEntries` in
 * `server/index.ts`), so the tier was decoration on a decision nobody makes
 * by hand. What survives is the part that does change behaviour: a Tier 3
 * device needs someone to press Confirm on the TV, and a Tier 1 device that
 * is natively stale can't be updated remotely at all.
 */
function updateStateCopy(state: DisplayUpdateState): { labelId: string; capabilityNoteId: string | null } {
  switch (state) {
    case 'current':
      return { labelId: 'admin.displayManager.updateStateCurrent', capabilityNoteId: null }
    case 'ota-available':
    case 'apk-available':
      return { labelId: 'admin.displayManager.updateStateAvailable', capabilityNoteId: null }
    case 'apk-prompted':
      return { labelId: 'admin.displayManager.updateStateAvailable', capabilityNoteId: 'admin.displayManager.updateNeedsDeviceTap' }
    case 'usb-required':
      return { labelId: 'admin.displayManager.updateStateUsbRequired', capabilityNoteId: 'admin.displayManager.updateUsbHint' }
    case 'unknown':
      return { labelId: 'admin.displayManager.updateStateUnknown', capabilityNoteId: null }
    case 'offline':
      return { labelId: 'admin.displayManager.updateStateOffline', capabilityNoteId: null }
  }
}

/**
 * Builds the `QueuedUpdate` a machine's own Update click (or a bulk run
 * including it) should write, from its already-resolved
 * `DisplayUpdateState` — `null` for any state with no real action (already
 * current, offline, unresolvable, or `usb-required`, which by definition
 * has no remote mechanism). `ota-available` targets the bundle published
 * for this machine's own `runtimeVersion`; `apk-available`/`apk-prompted`
 * both target the hub's current native `versionCode` (the mechanism
 * difference between silent-Tier-2 and prompted-Tier-3 is decided
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
 * `POST /display-machines/heartbeat`), shown as a grid of compact cards.
 * Each card is a miniature of what that display is actually putting on
 * screen (see `DisplayScreenPreview`) plus a colour-coded connection dot;
 * clicking one opens `DisplayDetailsModal`, which holds everything
 * editable — the name, a screen assignment per monitor, the two per-unit
 * resolution ceilings, the update action and Remove.
 *
 * A monitor with no Screen assigned shows the bouncing-company-name standby
 * screensaver (see `DisplayStandby`) until one is picked. Its own "+ Add
 * Display" row opens a new `DisplayWindow.tsx` window, which registers
 * itself here the same way any other display does. A mobile device that's
 * heartbeated in but not yet approved shows up passively — no "look for
 * displays" step needed — in the "Pending approval" section above the grid
 * (see `useDisplayPairingRequests`), each card showing its own `#suffix`
 * (the pending request's own `machineID`, last 4 characters) that also
 * appears on the TV's own `PairingScreen` so an admin can cross-check the
 * dashboard card against the physical device before clicking Approve — the
 * one-click button is the entire approval flow, no PIN/QR involved. Once
 * approved it becomes a real entry in the grid below.
 */
export function DisplayManagerView() {
  const { t, language } = useLanguage()
  const { session } = useAdminSession()
  const [machines, setMachines] = useDisplayMachines()
  const [, setCloseRequests] = useDisplayMachineCloseRequests()
  const [pairingRequests] = useDisplayPairingRequests()
  const [screens] = useScreens()
  const [searchParams, setSearchParams] = useSearchParams()
  const [clockFormat] = useClockFormatPreference()
  const [dateFormat] = useDateFormatPreference()
  /** Drives the connection dots: without a ticker a display that goes quiet keeps its green dot until something unrelated happens to re-render this view. */
  const now = useNow()
  /** Guards the deep-link effect below so it only ever highlights the target pending card once — `pairingRequests` is synced data that may not have loaded its real snapshot yet on first render, same posture as `UsersView`'s own deep-link effect. */
  const consumedDeepLinkRef = useRef(false)
  const { registerRef: registerPendingRef, triggerHighlight: triggerPendingHighlight } = useScrollToAndHighlight()
  /** Guards the `?updateMachineId=` deep-link effect below, same reasoning as `consumedDeepLinkRef` above but independent — the two params can't consume each other's ref. */
  const consumedUpdateDeepLinkRef = useRef(false)
  const { registerRef: registerMachineRef, triggerHighlight: triggerMachineHighlight } = useScrollToAndHighlight()

  const [approvingMachineId, setApprovingMachineId] = useState<string | null>(null)
  const [approveError, setApproveError] = useState<string | null>(null)
  const [approveNotice, setApproveNotice] = useState<string | null>(null)

  /** Which display's details sheet is open, by `machineID`. Also what the `?updateMachineId=` deep link opens. */
  const [openMachineId, setOpenMachineId] = useState<string | null>(null)

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

  /** Writes/replaces a `DisplayUpdateProgress` entry per queued machine and (via `applyUpdate`'s own diff in `server/index.ts`) is what actually causes the hub to push the right message (`check-update` or `install-update`, decided server-side from the machine's own `updateTier` — see `pushUpdateTriggersForNewEntries`'s own doc comment there) to each one. Shared by the single per-machine Update button and the bulk queue below. */
  const startUpdatesFor = (entries: QueuedUpdate[]) => {
    setUpdateProgress((current) => {
      const startedAt = new Date().toISOString()
      const withoutEntries = current.filter((entry) => !entries.some((queued) => queued.machineID === entry.machineID))
      const newEntries = entries.map((entry) => ({ machineID: entry.machineID, status: 'awaiting-heartbeat' as const, startedAt, ...('targetUpdateId' in entry ? { targetUpdateId: entry.targetUpdateId } : { targetVersionCode: entry.targetVersionCode }) }))
      return [...withoutEntries, ...newEntries]
    })
  }

  /**
   * Drops one machine's own progress entry. A `update-failed` entry is written in place by the hub's
   * own 10-minute sweep and never removed (`startUpdateFailureSweep` in `server/index.ts`), so
   * without this the only way to clear a failed badge was a later successful run — leaving a display
   * that has since been fixed by hand looking permanently broken.
   */
  const dismissUpdateEntry = (machineID: string) => {
    setUpdateProgress((current) => current.filter((entry) => entry.machineID !== machineID))
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

  /** Formats a heartbeat/override timestamp against the store's own date and clock preferences — every other admin surface does, and this view used to call `toLocaleString()` directly and ignore them. */
  const formatTimestamp = (iso: string) => {
    const date = new Date(iso)
    return Number.isFinite(date.getTime()) ? formatDateTime(date, language, clockFormat, dateFormat) : t('admin.displayManager.lastSeenNever')
  }

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
   * URL of the form `/admin/dashboard/displays?pendingMachineId=<id>`. This effect only ever touches
   * `pendingMachineId`, the same "each view strips only its own param" convention every other deep-linkable view
   * follows. If the request was already approved or expired by the time this runs, it's simply never found — same
   * accepted behavior every other synced-data deep link in this codebase already has for a since-deleted target.
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
   * Deep-link support: `?updateMachineId=<id>` now **opens that machine's own details sheet** as well as
   * highlighting its card, since everything the link is meant to reach (its version, update state and Update
   * button) moved into the modal — the `admin-deep-links` convention is to open the target's own sub-state
   * rather than only scroll to it when one exists. Same independent `consumedUpdateDeepLinkRef`/
   * `registerMachineRef` pair as `?pendingMachineId=` above so the two can't interfere. The param name is
   * unchanged because `useGlobalSearchIndex.tsx` builds it. `setState` goes through `queueMicrotask` per this
   * codebase's `react-hooks/set-state-in-effect` rule.
   */
  useEffect(() => {
    if (consumedUpdateDeepLinkRef.current) return
    const updateMachineId = searchParams.get('updateMachineId')
    const machine = updateMachineId ? machines.find((candidate) => candidate.machineID === updateMachineId) : undefined
    if (!machine) return
    consumedUpdateDeepLinkRef.current = true
    queueMicrotask(() => setOpenMachineId(machine.machineID))
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

  /** Writes this unit's own CSS layout width. Same "lives where the heartbeat can't reach it" reasoning (and same string-to-number parsing) as `handleMaxImagePxChange` directly above — `mergeDisplayMachineHeartbeat` carries `renderWidthPx` over explicitly too. */
  const handleRenderWidthPxChange = (machineID: string, value: string) => {
    const renderWidthPx = (value === 'auto' ? 'auto' : Number(value)) as DisplayRenderWidth
    updateMachine(machineID, (machine) => ({ ...machine, renderWidthPx }))
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
    setOpenMachineId(null)
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
  // own doc comment). Recomputed against `now` so a display going offline drops out of a rollout.
  const actionableEntries: QueuedUpdate[] = useMemo(
    () =>
      machines.flatMap((machine) => {
        const state = resolveDisplayUpdateState(machine, updatesHubStatus, now)
        if (!state) return []
        const queued = queuedUpdateFor(machine, state, updatesHubStatus)
        return queued ? [queued] : []
      }),
    [machines, updatesHubStatus, now],
  )

  const currentApk = updatesHubStatus?.currentApk ?? null
  const currentApkRolledBack = currentApk ? (updatesHubStatus?.rolledBackRuntimeVersions.includes(currentApk.runtimeVersion) ?? false) : false

  /** Builds the update section for one machine's details sheet — `null` for a display with no resolvable update state at all (every `electron`/`url` display, and any machine before the hub status has loaded). */
  const buildUpdatePanel = (machine: DisplayMachine): DisplayUpdatePanel | null => {
    if (machine.connectionType !== 'mobile') return null
    const progressEntry = updateProgress.find((entry) => entry.machineID === machine.machineID)
    if (progressEntry) {
      const failed = progressEntry.status === 'update-failed'
      return {
        stateText: t(progressLabelId(progressEntry.status)),
        capabilityNote: null,
        busy: !failed,
        failedText: failed ? t('admin.displayManager.updateFailedHint') : null,
        onDismissFailure: failed ? () => dismissUpdateEntry(machine.machineID) : undefined,
      }
    }
    const state = resolveDisplayUpdateState(machine, updatesHubStatus, now)
    if (!state) return null
    const { labelId, capabilityNoteId } = updateStateCopy(state)
    const queuedUpdate = queuedUpdateFor(machine, state, updatesHubStatus)
    return {
      stateText: t(labelId),
      capabilityNote: capabilityNoteId ? t(capabilityNoteId) : null,
      busy: false,
      failedText: null,
      onUpdate: queuedUpdate ? () => startUpdatesFor([queuedUpdate]) : undefined,
    }
  }

  const openMachine = openMachineId ? (machines.find((machine) => machine.machineID === openMachineId) ?? null) : null
  const openMachineOverride = openMachine ? screenOverrides.find((entry) => entry.machineID === openMachine.machineID) : undefined

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
        {/* Without a published APK the hub has nothing to compare a display against, so every update
            control below would silently render nothing at all. Say so instead — a fresh install has
            no bundles and no APK, and an empty section reads as "no updates needed". */}
        {!currentApk && <p className="display-manager-view__no-build">{t('admin.displayManager.noPublishedBuild')}</p>}
        {currentApk && actionableEntries.length > 0 &&
          (bulkRunning ? (
            <Button type="button" variant="secondary" onClick={abortBulkUpdate}>
              {t('admin.displayManager.updateAllAbortButton')}
            </Button>
          ) : (
            <Button type="button" onClick={() => startBulkUpdate(actionableEntries)}>
              {t('admin.displayManager.updateAllButton', { count: actionableEntries.length })}
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
          <div className="display-manager-view__grid">
            {pairingRequests.map((request) => {
              const pendingDot = connectionStatusDot(resolveDisplayConnectionStatus(request.lastSeenAt, now))
              return (
              <Card key={request.machineID} ref={registerPendingRef(request.machineID)} className="display-manager-view__pending-card">
                <div className="display-manager-view__pending-card-header">
                  <StatusDot status={pendingDot.dot} label={t(pendingDot.labelId)} />
                  <span className="display-manager-view__pending-label">{request.label}</span>
                  <span className="display-manager-view__id-suffix">#{request.machineID.slice(-4)}</span>
                </div>
                <Badge variant="warning">{t('admin.displayManager.pendingBadge')}</Badge>
                <p className="display-manager-view__last-seen">{t('admin.displayManager.lastSeen', { date: formatTimestamp(request.lastSeenAt) })}</p>
                <Button type="button" onClick={() => void handleApprove(request.machineID)} disabled={approvingMachineId === request.machineID}>
                  {t('admin.displayManager.approveButton')}
                </Button>
              </Card>
              )
            })}
          </div>
        </section>
      )}

      {machines.length === 0 ? (
        <p className="display-manager-view__empty">{t('admin.displayManager.empty')}</p>
      ) : (
        <div className="display-manager-view__grid">
          {machines.map((machine) => {
            const connectionStatus = resolveDisplayConnectionStatus(machine.lastSeenAt, now)
            const firstMonitor = machine.monitors[0]
            const updatePanel = buildUpdatePanel(machine)
            return (
              <DisplayCard
                key={machine.machineID}
                ref={registerMachineRef(machine.machineID)}
                machine={machine}
                connectionStatus={connectionStatus}
                displayedScreen={firstMonitor ? resolveDisplayedScreen(machine, firstMonitor, screens, screenOverrides) : null}
                lastSeenText={formatTimestamp(machine.lastSeenAt)}
                updateStateText={updatePanel?.stateText ?? null}
                onOpenDetails={() => setOpenMachineId(machine.machineID)}
              />
            )
          })}
        </div>
      )}

      {openMachine && (
        <DisplayDetailsModal
          machine={openMachine}
          screens={screens}
          overrides={screenOverrides}
          connectionStatus={resolveDisplayConnectionStatus(openMachine.lastSeenAt, now)}
          lastSeenText={formatTimestamp(openMachine.lastSeenAt)}
          overrideSetAtText={openMachineOverride ? formatTimestamp(openMachineOverride.setAt) : null}
          versionText={
            openMachine.connectionType === 'mobile'
              ? openMachine.versionName
                ? t('admin.displayManager.versionLabel', { versionName: openMachine.versionName })
                : t('admin.displayManager.versionUnknown')
              : null
          }
          updatePanel={buildUpdatePanel(openMachine)}
          onClose={() => setOpenMachineId(null)}
          onLabelChange={(customLabel) => handleLabelChange(openMachine.machineID, customLabel)}
          onAssign={(monitorId, screenId) => handleAssign(openMachine.machineID, monitorId, screenId)}
          onMaxImagePxChange={(value) => handleMaxImagePxChange(openMachine.machineID, value)}
          onRenderWidthPxChange={(value) => handleRenderWidthPxChange(openMachine.machineID, value)}
          onReturnToAssigned={() => handleReturnToAssigned(openMachine.machineID)}
          onRemove={() => handleRemove(openMachine.machineID)}
        />
      )}
    </div>
  )
}
