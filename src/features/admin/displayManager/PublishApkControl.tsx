import type { ChangeEvent } from 'react'
import { useState } from 'react'
import { Alert, Button, Input } from '../../../components'
import { useAdminSession } from '../../../hooks/useAdminSession'
import { useLanguage } from '../../../i18n'
import { publishApk } from '../../../lib/localServer'
import type { UpdatesHubStatus } from '../../../utils/displayUpdateState'
import './PublishApkControl.scss'

interface PublishApkControlProps {
  updatesHubStatus: UpdatesHubStatus | null
  /** Called once a publish succeeds — the caller re-fetches `updatesHubStatus` so the new `currentApk` shows immediately, same as any other write in this view. */
  onPublished: () => void
}

const FILENAME_PATTERN = /^adhdisplay-companion-(\d+\.\d+\.\d+)-(\d+)\.apk$/

/** Same formula `adhdisplay-companion/scripts/build-tv-apk.js` and `server/updates.ts` both use — kept in sync by hand across all three (each lives in its own module boundary) so a mismatch gets flagged here, client-side, before the admin even clicks Publish, not just server-side after the transfer. */
function computeVersionCode(versionName: string): number | null {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(versionName)
  if (!match) return null
  const [, major, minor, patch] = match.map(Number)
  if (minor >= 100 || patch >= 100) return null
  return major * 10000 + minor * 100 + patch
}

/**
 * Publishes a new Tier 2/3 native build (`build-tv-apk.js`'s own `dist/` output) onto this hub —
 * the admin-facing counterpart to `publishApk` in `src/lib/localServer.ts`, which does the actual
 * upload against `POST /updates/apk` in `server/updates.ts`. Filename-derived `versionName`/
 * `versionCode` are pre-filled but editable (a rename shouldn't silently break publishing), and
 * cross-checked against each other client-side the same way the server re-checks them itself.
 * `runtimeVersion` is pre-filled from the currently-published OTA manifest's own runtime version
 * when there's exactly one candidate — hand-pasting this value wrong doesn't fail at publish time,
 * it fails silently weeks later when Tier 1 updates stop reaching devices on that build, which is
 * exactly the class of bug this whole feature took real debugging to uncover.
 */
export function PublishApkControl({ updatesHubStatus, onPublished }: PublishApkControlProps) {
  const { t } = useLanguage()
  const { session } = useAdminSession()
  const [file, setFile] = useState<File | null>(null)
  const [versionName, setVersionName] = useState('')
  const [versionCode, setVersionCode] = useState<number | null>(null)
  const [runtimeVersion, setRuntimeVersion] = useState('')
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const otaRuntimeVersions = Object.keys(updatesHubStatus?.currentUpdateIdByRuntimeVersion ?? {})
  const parsedVersionCode = versionName ? computeVersionCode(versionName) : null
  const filenameMismatch = Boolean(versionName && versionCode !== null && parsedVersionCode !== versionCode)
  const noMatchingOtaBundle = runtimeVersion.length > 0 && !otaRuntimeVersions.includes(runtimeVersion)

  const handleFile = (selected: File) => {
    setFile(selected)
    setError(null)
    setSuccess(null)
    const match = FILENAME_PATTERN.exec(selected.name)
    if (match) {
      setVersionName(match[1])
      setVersionCode(Number(match[2]))
    } else {
      setVersionName('')
      setVersionCode(null)
    }
    if (!runtimeVersion && otaRuntimeVersions.length === 1) setRuntimeVersion(otaRuntimeVersions[0])
  }

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0]
    event.target.value = ''
    if (selected) handleFile(selected)
  }

  const handlePublish = async () => {
    if (!session || !file || versionCode === null || !versionName || !runtimeVersion) return
    setProgress(0)
    setError(null)
    setSuccess(null)
    try {
      await publishApk(file, versionCode, versionName, runtimeVersion, session.token, setProgress)
      setSuccess(t('admin.displayManager.publishApk.success', { versionName }))
      setFile(null)
      setVersionName('')
      setVersionCode(null)
      onPublished()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('admin.displayManager.publishApk.error'))
    } finally {
      setProgress(null)
    }
  }

  const canPublish = Boolean(session && file && versionCode !== null && versionName && runtimeVersion && !filenameMismatch && progress === null)

  return (
    <div className="publish-apk-control">
      {error && <Alert variant="error">{error}</Alert>}
      {success && <Alert variant="success">{success}</Alert>}
      <label className={`publish-apk-control__file-label${progress !== null ? ' publish-apk-control__file-label--disabled' : ''}`}>
        {file ? file.name : t('admin.displayManager.publishApk.chooseFile')}
        <input type="file" accept=".apk" onChange={handleFileChange} disabled={progress !== null} />
      </label>

      {file && (
        <div className="publish-apk-control__fields">
          <Input
            id="publish-apk-version-name"
            label={t('admin.displayManager.publishApk.versionNameLabel')}
            value={versionName}
            onChange={(event) => setVersionName(event.target.value)}
          />
          <Input
            id="publish-apk-version-code"
            type="number"
            label={t('admin.displayManager.publishApk.versionCodeLabel')}
            value={versionCode ?? ''}
            onChange={(event) => setVersionCode(event.target.value ? Number(event.target.value) : null)}
          />
          <Input
            id="publish-apk-runtime-version"
            label={t('admin.displayManager.publishApk.runtimeVersionLabel')}
            value={runtimeVersion}
            onChange={(event) => setRuntimeVersion(event.target.value)}
          />

          {filenameMismatch && <p className="publish-apk-control__warning">{t('admin.displayManager.publishApk.filenameMismatchWarning')}</p>}
          {noMatchingOtaBundle && <p className="publish-apk-control__warning">{t('admin.displayManager.publishApk.noOtaBundleWarning')}</p>}

          {progress !== null && (
            <div className="publish-apk-control__progress" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
              <div className="publish-apk-control__progress-bar" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
          )}

          <Button type="button" disabled={!canPublish} onClick={() => void handlePublish()}>
            {progress !== null
              ? t('admin.displayManager.publishApk.publishingPercent', { percent: Math.round(progress * 100) })
              : t('admin.displayManager.publishApk.publishButton')}
          </Button>
        </div>
      )}
    </div>
  )
}
