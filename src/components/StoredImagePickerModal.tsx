import { useEffect, useState } from 'react'
import { useAdminSession } from '../hooks/useAdminSession'
import { useLanguage } from '../i18n'
import { listUploads, SessionExpiredError, type UploadedMedia } from '../lib/localServer'
import { getThumbnailUrl } from '../utils/responsiveImage'
import { Alert } from './Alert'
import { Modal } from './Modal'
import { Spinner } from './Spinner'
import './StoredImagePickerModal.scss'

interface StoredImagePickerModalProps {
  open: boolean
  onClose: () => void
  onSelect: (url: string) => void
  /** Shows videos too (a small play badge marks them) and lets one be picked — off by default, matching `ImageUploadField`'s own `acceptVideo`. Videos still mid-transcode are shown but not selectable. */
  acceptVideo?: boolean
}

/**
 * Bottom-sheet grid of every image (and, with `acceptVideo`, video) already
 * stored on the local server, so an admin can reuse one (e.g. the same
 * background across several slides) instead of uploading a duplicate —
 * opened from `ImageUploadField`'s "Use stored" button. Re-fetches the list
 * every time it opens, so a very recent upload elsewhere already shows up.
 */
export function StoredImagePickerModal({ open, onClose, onSelect, acceptVideo }: StoredImagePickerModalProps) {
  const { t } = useLanguage()
  const { session, clearSession } = useAdminSession()
  const [images, setImages] = useState<UploadedMedia[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !session) return
    let cancelled = false

    listUploads(session.token)
      .then((result) => {
        if (cancelled) return
        setImages(result.filter((item) => acceptVideo || item.kind === 'image'))
        setError(null)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setImages(null)
        if (err instanceof SessionExpiredError) {
          setError(t('imageUpload.sessionExpired'))
          clearSession()
        } else {
          setError(t('admin.mediaLibrary.error'))
        }
      })

    return () => {
      cancelled = true
    }
  }, [open, session, acceptVideo, t, clearSession])

  return (
    <Modal open={open} onClose={onClose} title={t('imageUpload.useStoredButton')}>
      {error && <Alert variant="error">{error}</Alert>}
      {!error && images === null && <Spinner />}
      {!error && images?.length === 0 && <Alert variant="info">{t('admin.mediaLibrary.empty')}</Alert>}
      {images && images.length > 0 && (
        <ul className="stored-image-picker__grid">
          {images.map((image) => {
            const selectable = image.status !== 'processing' && image.status !== 'failed'
            return (
              <li key={image.filename}>
                <button
                  type="button"
                  className="stored-image-picker__item"
                  onClick={() => selectable && onSelect(image.url)}
                  disabled={!selectable}
                  aria-label={image.displayName || image.filename}
                >
                  <img src={getThumbnailUrl(image.url)} alt="" loading="lazy" />
                  {image.kind === 'video' && selectable && <span className="stored-image-picker__video-badge">▶</span>}
                  {!selectable && (
                    <span className="stored-image-picker__pending-overlay">
                      {image.status === 'processing' ? <Spinner /> : t('admin.mediaLibrary.failedBadge')}
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </Modal>
  )
}
