import { useEffect, useState } from 'react'
import { Button, Modal } from '../../../components'
import { useAdminSession } from '../../../hooks/useAdminSession'
import { useLanguage } from '../../../i18n'
import {
  getScreensSnapshotsForScreen,
  restoreScreensSnapshotForScreen,
  ScreensSnapshotDraftConflictError,
  type ScreensSnapshotInfo,
} from '../../../lib/localServer'
import type { ScreenConfig } from '../../../types/screen'
import './ScreenRestoreSnapshotModal.scss'

interface ScreenRestoreSnapshotModalProps {
  screen: ScreenConfig
  onClose: () => void
  /** Called after a successful restore — the caller reloads/refreshes its own `screens` list (the sync layer already pushes the change to every connected tab/device, this is purely so this admin's own open form/list reflects it without waiting on that round trip). */
  onRestored: () => void
}

/**
 * Per-screen counterpart to Settings → Backup's own whole-array "Screens
 * history" restore — reached from `ScreenCard`'s own restore button. Lists
 * only the retained daily/weekly snapshots in which *this one screen*
 * genuinely differs from its current live state (server-filtered, see
 * `getScreensSnapshotsForScreen`), and restoring only ever overwrites this
 * screen's own entry — every other screen on the list stays untouched,
 * unlike the whole-array flow.
 */
export function ScreenRestoreSnapshotModal({ screen, onClose, onRestored }: ScreenRestoreSnapshotModalProps) {
  const { t } = useLanguage()
  const { session } = useAdminSession()
  const [snapshots, setSnapshots] = useState<ScreensSnapshotInfo[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [restoringId, setRestoringId] = useState<string | null>(null)
  /** Set when the server reports this screen has an unpublished draft that a restore would discard — the admin has to explicitly confirm (re-calling with `force`) rather than it being silently clobbered. */
  const [draftConflict, setDraftConflict] = useState<ScreensSnapshotInfo | null>(null)

  useEffect(() => {
    if (!session) return
    getScreensSnapshotsForScreen(session.token, screen.screenID)
      .then(setSnapshots)
      .catch(() => setError(t('admin.screens.restoreSnapshotLoadError')))
    // Only ever needs to load once per screen — a snapshot list doesn't change while this modal is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, screen.screenID])

  const handleRestore = async (snapshot: ScreensSnapshotInfo, force?: boolean) => {
    if (!session) return
    setRestoringId(snapshot.id)
    setError(null)
    try {
      await restoreScreensSnapshotForScreen(session.token, snapshot.tier, snapshot.id, screen.screenID, force)
      setDraftConflict(null)
      onRestored()
      onClose()
    } catch (err) {
      if (err instanceof ScreensSnapshotDraftConflictError) setDraftConflict(snapshot)
      else setError(err instanceof Error ? err.message : t('admin.screens.restoreSnapshotError'))
    } finally {
      setRestoringId(null)
    }
  }

  return (
    <Modal open onClose={onClose} title={t('admin.screens.restoreSnapshotModalTitle', { name: screen.name })}>
      <div className="screen-restore-snapshot-modal">
        <p className="screen-restore-snapshot-modal__hint">{t('admin.screens.restoreSnapshotHint')}</p>

        {snapshots === null && !error && <p className="screen-restore-snapshot-modal__hint">{t('admin.screens.restoreSnapshotLoading')}</p>}
        {snapshots?.length === 0 && <p className="screen-restore-snapshot-modal__hint">{t('admin.screens.restoreSnapshotEmpty')}</p>}

        {snapshots && snapshots.length > 0 && (
          <ul className="screen-restore-snapshot-modal__list">
            {snapshots.map((snapshot) => (
              <li key={`${snapshot.tier}-${snapshot.id}`} className="screen-restore-snapshot-modal__row">
                <span>
                  {t(snapshot.tier === 'daily' ? 'admin.settings.backup.screensHistory.dailyLabel' : 'admin.settings.backup.screensHistory.weeklyLabel')} —{' '}
                  {new Date(snapshot.capturedAt).toLocaleString()}
                </span>
                <Button type="button" variant="secondary" onClick={() => void handleRestore(snapshot)} disabled={restoringId !== null}>
                  {restoringId === snapshot.id ? t('admin.settings.backup.screensHistory.restoringLabel') : t('admin.settings.backup.screensHistory.restoreButton')}
                </Button>
              </li>
            ))}
          </ul>
        )}

        {draftConflict && (
          <div className="screen-restore-snapshot-modal__conflict">
            <p>{t('admin.screens.restoreSnapshotDraftWarning')}</p>
            <div className="screen-restore-snapshot-modal__conflict-actions">
              <Button type="button" variant="secondary" onClick={() => setDraftConflict(null)} disabled={restoringId !== null}>
                {t('admin.common.cancel')}
              </Button>
              <Button type="button" onClick={() => void handleRestore(draftConflict, true)} disabled={restoringId !== null}>
                {t('admin.screens.restoreSnapshotForceButton')}
              </Button>
            </div>
          </div>
        )}

        <p className="screen-restore-snapshot-modal__hint">{t('admin.settings.backup.screensHistory.imageQualityNote')}</p>

        {error && <p className="screen-restore-snapshot-modal__error">{error}</p>}
      </div>
    </Modal>
  )
}
