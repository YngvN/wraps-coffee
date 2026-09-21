import type { ChangeEvent } from 'react'
import { useEffect, useState } from 'react'
import { Button, HelpTip, Modal } from '../../../components'
import { useAdminSession } from '../../../hooks/useAdminSession'
import { useLanguage } from '../../../i18n'
import {
  applyCleanup,
  createBackup,
  getBackupStatus,
  getCleanupPreview,
  getScreensSnapshotDiff,
  getScreensSnapshots,
  restoreBackupFromZip,
  restoreFromBackupFolder,
  restoreScreensSnapshot,
  SessionExpiredError,
  type CleanupPreview,
  type ScreenDiffEntry,
  type ScreensSnapshotInfo,
} from '../../../lib/localServer'
import './BackupSettingsView.scss'

/** `1.2 MB`-style formatting for a byte count — small enough, and used in few enough places, that this repo hasn't pulled it into a shared `src/utils/` helper (see `MediaLibraryView.tsx`'s own local copy of the same thing). */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Everything the local server persists (every synced key, user accounts, and
 * uploaded images) is continuously mirrored to a sibling `ADHDisplayBackup`
 * folder next to the app's own install folder (see `server/backup.ts`) —
 * that happens automatically, with nothing to configure here. This view is
 * the manual side of it: download a point-in-time zip snapshot, or restore
 * from either that same sibling folder or an uploaded zip if something's
 * gone wrong with the live data. `admin`/`subadmin` only, reached from
 * Settings → Backup.
 */
export function BackupSettingsView() {
  const { t } = useLanguage()
  const { session, clearSession } = useAdminSession()
  const [status, setStatus] = useState<{ folderBackupAvailable: boolean; updatedAt: string | null } | null>(null)
  const [isLoadingStatus, setIsLoadingStatus] = useState(true)
  const [isCreating, setIsCreating] = useState(false)
  const [isRestoring, setIsRestoring] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const [cleanupPreview, setCleanupPreview] = useState<CleanupPreview | null>(null)
  const [isLoadingCleanup, setIsLoadingCleanup] = useState(true)
  const [isApplyingCleanup, setIsApplyingCleanup] = useState(false)
  const [cleanupError, setCleanupError] = useState<string | null>(null)
  const [cleanupMessage, setCleanupMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!session) return
    getBackupStatus(session.token)
      .then(setStatus)
      .catch(() => setError(t('admin.settings.backup.statusError')))
      .finally(() => setIsLoadingStatus(false))
  }, [session, t])

  useEffect(() => {
    if (!session) return
    getCleanupPreview(session.token)
      .then(setCleanupPreview)
      .catch(() => setCleanupError(t('admin.settings.backup.cleanup.previewError')))
      .finally(() => setIsLoadingCleanup(false))
  }, [session, t])

  /** Re-fetches the preview after a successful "delete" — called from a plain event handler (`handleApplyCleanup`), not an effect, so (unlike the mount-time fetch above) it's fine to flip `isLoadingCleanup` back to `true` synchronously right before it. */
  const refreshCleanupPreview = () => {
    if (!session) return
    setIsLoadingCleanup(true)
    getCleanupPreview(session.token)
      .then(setCleanupPreview)
      .catch(() => setCleanupError(t('admin.settings.backup.cleanup.previewError')))
      .finally(() => setIsLoadingCleanup(false))
  }

  const handleSessionExpired = (err: unknown): boolean => {
    if (err instanceof SessionExpiredError) {
      setError(t('admin.settings.backup.sessionExpired'))
      clearSession()
      return true
    }
    return false
  }

  const handleCreateBackup = async () => {
    if (!session) return
    setError(null)
    setMessage(null)
    setIsCreating(true)
    try {
      const blob = await createBackup(session.token)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `adhdisplay-backup-${new Date().toISOString().slice(0, 10)}.zip`
      link.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      if (!handleSessionExpired(err)) setError(err instanceof Error ? err.message : t('admin.settings.backup.createError'))
    } finally {
      setIsCreating(false)
    }
  }

  const handleRestoreFromFolder = async () => {
    if (!session || !window.confirm(t('admin.settings.backup.restoreConfirm'))) return
    setError(null)
    setMessage(null)
    setIsRestoring(true)
    try {
      await restoreFromBackupFolder(session.token)
      setMessage(t('admin.settings.backup.restoreSuccess'))
    } catch (err) {
      if (!handleSessionExpired(err)) setError(err instanceof Error ? err.message : t('admin.settings.backup.restoreError'))
    } finally {
      setIsRestoring(false)
    }
  }

  const handleRestoreFromZip = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !session || !window.confirm(t('admin.settings.backup.restoreConfirm'))) return
    setError(null)
    setMessage(null)
    setIsRestoring(true)
    try {
      await restoreBackupFromZip(session.token, file)
      setMessage(t('admin.settings.backup.restoreSuccess'))
    } catch (err) {
      if (!handleSessionExpired(err)) setError(err instanceof Error ? err.message : t('admin.settings.backup.restoreError'))
    } finally {
      setIsRestoring(false)
    }
  }

  const cleanupItemCount = cleanupPreview
    ? cleanupPreview.orders.length + cleanupPreview.messages.length + cleanupPreview.messageBoardPosts.length + cleanupPreview.displayMachines.length + cleanupPreview.images.length
    : 0

  const handleApplyCleanup = async () => {
    if (!session || !cleanupPreview) return
    if (!window.confirm(t('admin.settings.backup.cleanup.confirm', { count: cleanupItemCount }))) return
    setCleanupError(null)
    setCleanupMessage(null)
    setIsApplyingCleanup(true)
    try {
      const result = await applyCleanup(session.token, {
        orderIds: cleanupPreview.orders.map((order) => order.id),
        messageIds: cleanupPreview.messages.map((cleanupMessageItem) => cleanupMessageItem.id),
        messageBoardPostIds: cleanupPreview.messageBoardPosts.map((post) => post.id),
        displayMachineIds: cleanupPreview.displayMachines.map((machine) => machine.machineID),
        imageFilenames: cleanupPreview.images.map((image) => image.filename),
      })
      const deletedCount = result.deletedOrders + result.deletedMessages + result.deletedMessageBoardPosts + result.deletedDisplayMachines + result.deletedImages
      const successMessage =
        result.pinnedImages > 0
          ? `${t('admin.settings.backup.cleanup.success', { count: deletedCount })} ${t('admin.settings.backup.cleanup.pinnedNote', { count: result.pinnedImages, size: formatBytes(result.pinnedImageBytes) })}`
          : t('admin.settings.backup.cleanup.success', { count: deletedCount })
      setCleanupMessage(successMessage)
      refreshCleanupPreview()
    } catch (err) {
      if (!handleSessionExpired(err)) setCleanupError(err instanceof Error ? err.message : t('admin.settings.backup.cleanup.applyError'))
    } finally {
      setIsApplyingCleanup(false)
    }
  }

  // --- Screens history (daily/weekly admin.screens snapshots, see server/screensSnapshots.ts) ---

  const [snapshots, setSnapshots] = useState<ScreensSnapshotInfo[]>([])
  const [isLoadingSnapshots, setIsLoadingSnapshots] = useState(true)
  const [snapshotsError, setSnapshotsError] = useState<string | null>(null)
  const [snapshotsMessage, setSnapshotsMessage] = useState<string | null>(null)
  const [restoreTarget, setRestoreTarget] = useState<ScreensSnapshotInfo | null>(null)
  const [restoreDiff, setRestoreDiff] = useState<ScreenDiffEntry[] | null>(null)
  const [isLoadingDiff, setIsLoadingDiff] = useState(false)
  const [isRestoringSnapshot, setIsRestoringSnapshot] = useState(false)

  useEffect(() => {
    if (!session) return
    getScreensSnapshots(session.token)
      .then(setSnapshots)
      .catch(() => setSnapshotsError(t('admin.settings.backup.screensHistory.loadError')))
      .finally(() => setIsLoadingSnapshots(false))
  }, [session, t])

  /** Re-fetches after a successful restore — same "called from an event handler, fine to flip loading back to true synchronously" posture as `refreshCleanupPreview` above. */
  const refreshSnapshots = () => {
    if (!session) return
    setIsLoadingSnapshots(true)
    getScreensSnapshots(session.token)
      .then(setSnapshots)
      .catch(() => setSnapshotsError(t('admin.settings.backup.screensHistory.loadError')))
      .finally(() => setIsLoadingSnapshots(false))
  }

  const openRestorePicker = (snapshot: ScreensSnapshotInfo) => {
    if (!session) return
    setRestoreTarget(snapshot)
    setRestoreDiff(null)
    setSnapshotsError(null)
    setIsLoadingDiff(true)
    getScreensSnapshotDiff(session.token, snapshot.tier, snapshot.id)
      .then(setRestoreDiff)
      .catch(() => {
        setSnapshotsError(t('admin.settings.backup.screensHistory.loadError'))
        setRestoreTarget(null)
      })
      .finally(() => setIsLoadingDiff(false))
  }

  const handleConfirmRestoreSnapshot = async () => {
    if (!session || !restoreTarget) return
    setIsRestoringSnapshot(true)
    setSnapshotsError(null)
    setSnapshotsMessage(null)
    try {
      await restoreScreensSnapshot(session.token, restoreTarget.tier, restoreTarget.id)
      setSnapshotsMessage(t('admin.settings.backup.screensHistory.restoreSuccess'))
      setRestoreTarget(null)
      setRestoreDiff(null)
      refreshSnapshots()
    } catch (err) {
      if (!handleSessionExpired(err)) setSnapshotsError(err instanceof Error ? err.message : t('admin.settings.backup.screensHistory.restoreError'))
    } finally {
      setIsRestoringSnapshot(false)
    }
  }

  const diffStatusLabel = (status: ScreenDiffEntry['status']) => {
    if (status === 'changed') return t('admin.settings.backup.screensHistory.diffChanged')
    if (status === 'onlyInSnapshot') return t('admin.settings.backup.screensHistory.diffOnlyInSnapshot')
    return t('admin.settings.backup.screensHistory.diffOnlyInLive')
  }

  return (
    <div className="backup-settings">
      <div className="backup-settings__section">
        <h2>
          {t('admin.settings.backup.createTitle')} <HelpTip text={t('admin.settings.backup.createHint')} />
        </h2>
        <Button type="button" onClick={() => void handleCreateBackup()} disabled={isCreating}>
          {isCreating ? t('admin.settings.backup.creatingLabel') : t('admin.settings.backup.createButton')}
        </Button>
      </div>

      <div className="backup-settings__section">
        <h2>
          {t('admin.settings.backup.restoreTitle')} <HelpTip text={t('admin.settings.backup.restoreHint')} />
        </h2>

        {!isLoadingStatus && status?.folderBackupAvailable && (
          <div className="backup-settings__restore-option">
            <Button type="button" variant="secondary" onClick={() => void handleRestoreFromFolder()} disabled={isRestoring}>
              {t('admin.settings.backup.restoreFromFolderButton')}
            </Button>
            {status.updatedAt && <span className="backup-settings__updated-at">{t('admin.settings.backup.folderUpdatedAt', { date: new Date(status.updatedAt).toLocaleString() })}</span>}
          </div>
        )}

        <div className="backup-settings__restore-option">
          <label className={`backup-settings__file-label${isRestoring ? ' backup-settings__file-label--disabled' : ''}`}>
            {t('admin.settings.backup.restoreFromZipButton')}
            <input type="file" accept="application/zip,.zip" onChange={(event) => void handleRestoreFromZip(event)} disabled={isRestoring} />
          </label>
        </div>
      </div>

      {error && <p className="backup-settings__error">{error}</p>}
      {message && <p className="backup-settings__message">{message}</p>}

      <div className="backup-settings__section">
        <h2>
          {t('admin.settings.backup.cleanup.title')}{' '}
          <HelpTip text={t('admin.settings.backup.cleanup.hint', { retentionDays: cleanupPreview?.retentionDays ?? 180, staleDays: cleanupPreview?.displayMachineStaleDays ?? 30 })} />
        </h2>

        {!isLoadingCleanup && cleanupPreview && cleanupItemCount === 0 && <p className="backup-settings__hint">{t('admin.settings.backup.cleanup.emptyMessage')}</p>}

        {!isLoadingCleanup && cleanupPreview && cleanupItemCount > 0 && (
          <ul className="backup-settings__cleanup-list">
            {cleanupPreview.orders.length > 0 && <li>{t('admin.settings.backup.cleanup.ordersLine', { count: cleanupPreview.orders.length })}</li>}
            {cleanupPreview.messages.length > 0 && <li>{t('admin.settings.backup.cleanup.messagesLine', { count: cleanupPreview.messages.length })}</li>}
            {cleanupPreview.messageBoardPosts.length > 0 && <li>{t('admin.settings.backup.cleanup.messageBoardPostsLine', { count: cleanupPreview.messageBoardPosts.length })}</li>}
            {cleanupPreview.displayMachines.length > 0 && <li>{t('admin.settings.backup.cleanup.displayMachinesLine', { count: cleanupPreview.displayMachines.length })}</li>}
            {cleanupPreview.images.length > 0 && <li>{t('admin.settings.backup.cleanup.imagesLine', { count: cleanupPreview.images.length })}</li>}
          </ul>
        )}

        {cleanupPreview && cleanupItemCount > 0 && (
          <Button type="button" variant="secondary" onClick={() => void handleApplyCleanup()} disabled={isApplyingCleanup}>
            {isApplyingCleanup ? t('admin.settings.backup.cleanup.deletingLabel') : t('admin.settings.backup.cleanup.deleteButton', { count: cleanupItemCount })}
          </Button>
        )}

        {cleanupError && <p className="backup-settings__error">{cleanupError}</p>}
        {cleanupMessage && <p className="backup-settings__message">{cleanupMessage}</p>}
      </div>

      <div className="backup-settings__section">
        <h2>
          {t('admin.settings.backup.screensHistory.title')} <HelpTip text={t('admin.settings.backup.screensHistory.hint')} />
        </h2>

        {!isLoadingSnapshots && snapshots.length === 0 && <p className="backup-settings__hint">{t('admin.settings.backup.screensHistory.emptyMessage')}</p>}

        {!isLoadingSnapshots && snapshots.length > 0 && (
          <ul className="backup-settings__cleanup-list backup-settings__snapshot-list">
            {snapshots.map((snapshot) => (
              <li key={`${snapshot.tier}-${snapshot.id}`} className="backup-settings__snapshot-row">
                <span>
                  {t(snapshot.tier === 'daily' ? 'admin.settings.backup.screensHistory.dailyLabel' : 'admin.settings.backup.screensHistory.weeklyLabel')} —{' '}
                  {new Date(snapshot.capturedAt).toLocaleString()} ({t('admin.settings.backup.screensHistory.screenCountLabel', { count: snapshot.screenCount })})
                </span>
                <Button type="button" variant="secondary" onClick={() => openRestorePicker(snapshot)} disabled={isRestoringSnapshot}>
                  {t('admin.settings.backup.screensHistory.restoreButton')}
                </Button>
              </li>
            ))}
          </ul>
        )}

        {snapshotsError && <p className="backup-settings__error">{snapshotsError}</p>}
        {snapshotsMessage && <p className="backup-settings__message">{snapshotsMessage}</p>}
      </div>

      {restoreTarget && (
        <Modal open onClose={() => (isRestoringSnapshot ? undefined : setRestoreTarget(null))} title={t('admin.settings.backup.screensHistory.restoreConfirmTitle')}>
          <div className="backup-settings__restore-confirm">
            <p>{t('admin.settings.backup.screensHistory.restoreConfirmIntro', { date: new Date(restoreTarget.capturedAt).toLocaleString() })}</p>

            {isLoadingDiff && <p className="backup-settings__hint">{t('admin.settings.backup.screensHistory.loadingDiff')}</p>}

            {!isLoadingDiff && restoreDiff && restoreDiff.length === 0 && <p className="backup-settings__hint">{t('admin.settings.backup.screensHistory.diffEmpty')}</p>}

            {!isLoadingDiff && restoreDiff && restoreDiff.length > 0 && (
              <ul className="backup-settings__cleanup-list">
                {restoreDiff.map((entry) => (
                  <li key={entry.screenID}>
                    {entry.name || entry.screenID} — {diffStatusLabel(entry.status)}
                  </li>
                ))}
              </ul>
            )}

            <p className="backup-settings__hint">{t('admin.settings.backup.screensHistory.imageQualityNote')}</p>

            <div className="backup-settings__actions">
              <Button type="button" variant="secondary" onClick={() => setRestoreTarget(null)} disabled={isRestoringSnapshot}>
                {t('admin.common.cancel')}
              </Button>
              <Button type="button" onClick={() => void handleConfirmRestoreSnapshot()} disabled={isRestoringSnapshot || isLoadingDiff}>
                {isRestoringSnapshot ? t('admin.settings.backup.screensHistory.restoringLabel') : t('admin.settings.backup.screensHistory.restoreConfirmButton')}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
