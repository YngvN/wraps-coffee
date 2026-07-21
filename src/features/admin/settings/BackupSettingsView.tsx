import type { ChangeEvent } from 'react'
import { useEffect, useState } from 'react'
import { Button } from '../../../components'
import { useAdminSession } from '../../../hooks/useAdminSession'
import { useLanguage } from '../../../i18n'
import {
  applyCleanup,
  createBackup,
  getBackupStatus,
  getCleanupPreview,
  restoreBackupFromZip,
  restoreFromBackupFolder,
  SessionExpiredError,
  type CleanupPreview,
} from '../../../lib/localServer'
import './BackupSettingsView.scss'

/**
 * Everything the local server persists (every synced key, user accounts, and
 * uploaded images) is continuously mirrored to a sibling `WrapsCoffeeBackup`
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
      link.download = `wrapscoffee-backup-${new Date().toISOString().slice(0, 10)}.zip`
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
      setCleanupMessage(t('admin.settings.backup.cleanup.success', { count: deletedCount }))
      refreshCleanupPreview()
    } catch (err) {
      if (!handleSessionExpired(err)) setCleanupError(err instanceof Error ? err.message : t('admin.settings.backup.cleanup.applyError'))
    } finally {
      setIsApplyingCleanup(false)
    }
  }

  return (
    <div className="backup-settings">
      <div className="backup-settings__section">
        <h2>{t('admin.settings.backup.createTitle')}</h2>
        <p className="backup-settings__hint">{t('admin.settings.backup.createHint')}</p>
        <Button type="button" onClick={() => void handleCreateBackup()} disabled={isCreating}>
          {isCreating ? t('admin.settings.backup.creatingLabel') : t('admin.settings.backup.createButton')}
        </Button>
      </div>

      <div className="backup-settings__section">
        <h2>{t('admin.settings.backup.restoreTitle')}</h2>
        <p className="backup-settings__hint">{t('admin.settings.backup.restoreHint')}</p>

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
        <h2>{t('admin.settings.backup.cleanup.title')}</h2>
        <p className="backup-settings__hint">
          {t('admin.settings.backup.cleanup.hint', { retentionDays: cleanupPreview?.retentionDays ?? 180, staleDays: cleanupPreview?.displayMachineStaleDays ?? 30 })}
        </p>

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
    </div>
  )
}
