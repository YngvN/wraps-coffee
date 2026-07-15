import type { ChangeEvent } from 'react'
import { useEffect, useState } from 'react'
import { Button } from '../../../components'
import { useAdminSession } from '../../../hooks/useAdminSession'
import { useLanguage } from '../../../i18n'
import { createBackup, getBackupStatus, restoreBackupFromZip, restoreFromBackupFolder, SessionExpiredError } from '../../../lib/localServer'
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

  useEffect(() => {
    if (!session) return
    getBackupStatus(session.token)
      .then(setStatus)
      .catch(() => setError(t('admin.settings.backup.statusError')))
      .finally(() => setIsLoadingStatus(false))
  }, [session, t])

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
    </div>
  )
}
