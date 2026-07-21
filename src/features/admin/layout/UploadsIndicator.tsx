import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLanguage } from '../../../i18n'
import { useUploads } from '../../../lib/uploadManager'
import { UploadIcon } from './AdminNavIcons'
import './NotificationsDropdown.scss'

/**
 * Top navbar's own upload-arrow dropdown — every upload the global
 * `uploadManager` is currently tracking (network-transfer progress, then
 * "Processing…" for a video's server-side transcode), regardless of which
 * page or form originally started it. Exists specifically so a large video
 * upload keeps visibly progressing while the admin navigates elsewhere —
 * see `uploadManager.ts`'s own module doc comment. Hidden entirely once
 * nothing is uploading/processing (finished uploads are dismissed by
 * whichever field consumed their result, see `ImageUploadField`).
 */
export function UploadsIndicator() {
  const { t } = useLanguage()
  const uploads = useUploads().filter((upload) => upload.status === 'uploading' || upload.status === 'processing')
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handlePointerDown = (event: MouseEvent) => {
      if (containerRef.current?.contains(event.target as Node)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [open])

  if (uploads.length === 0) return null

  return (
    <div className="notifications-dropdown" ref={containerRef}>
      <button
        type="button"
        className="admin-top-navbar__icon-link"
        onClick={() => setOpen((current) => !current)}
        aria-label={t('admin.uploadsIndicator.title', { count: uploads.length })}
        title={t('admin.uploadsIndicator.title', { count: uploads.length })}
      >
        <UploadIcon />
        <span className="notifications-dropdown__badge">{uploads.length}</span>
      </button>

      {open && (
        <div className="notifications-dropdown__panel">
          <div className="notifications-dropdown__header">{t('admin.uploadsIndicator.title', { count: uploads.length })}</div>
          <ul className="notifications-dropdown__list">
            {uploads.map((upload) => (
              <li key={upload.id}>
                <Link to="/admin/dashboard/media" onClick={() => setOpen(false)}>
                  <span className="notifications-dropdown__item-title">{upload.fileName}</span>
                  <span className="notifications-dropdown__item-meta">
                    {upload.status === 'uploading' ? t('admin.uploadsIndicator.uploadingPercent', { percent: Math.round(upload.progress * 100) }) : t('admin.uploadsIndicator.processing')}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
