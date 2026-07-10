import { useEffect, useState } from 'react'
import { useAdminSession } from '../hooks/useAdminSession'
import { useLanguage } from '../i18n'
import { listUploads, SessionExpiredError, type UploadedImage } from '../lib/localServer'
import { getThumbnailUrl } from '../utils/responsiveImage'
import { Alert } from './Alert'
import { Modal } from './Modal'
import { Spinner } from './Spinner'
import './StoredImagePickerModal.scss'

interface StoredImagePickerModalProps {
  open: boolean
  onClose: () => void
  onSelect: (url: string) => void
}

/**
 * Bottom-sheet grid of every image already stored on the local server, so
 * an admin can reuse one (e.g. the same background across several slides)
 * instead of uploading a duplicate — opened from `ImageUploadField`'s "Use
 * stored image" button. Re-fetches the list every time it opens, so a very
 * recent upload elsewhere already shows up.
 */
export function StoredImagePickerModal({ open, onClose, onSelect }: StoredImagePickerModalProps) {
  const { t } = useLanguage()
  const { session, clearSession } = useAdminSession()
  const [images, setImages] = useState<UploadedImage[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !session) return
    let cancelled = false

    listUploads(session.token)
      .then((result) => {
        if (cancelled) return
        setImages(result)
        setError(null)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setImages(null)
        if (err instanceof SessionExpiredError) {
          setError(t('imageUpload.sessionExpired'))
          clearSession()
        } else {
          setError(t('admin.imageLibrary.error'))
        }
      })

    return () => {
      cancelled = true
    }
  }, [open, session, t, clearSession])

  return (
    <Modal open={open} onClose={onClose} title={t('imageUpload.useStoredButton')}>
      {error && <Alert variant="error">{error}</Alert>}
      {!error && images === null && <Spinner />}
      {!error && images?.length === 0 && <Alert variant="info">{t('admin.imageLibrary.empty')}</Alert>}
      {images && images.length > 0 && (
        <ul className="stored-image-picker__grid">
          {images.map((image) => (
            <li key={image.filename}>
              <button type="button" className="stored-image-picker__item" onClick={() => onSelect(image.url)}>
                <img src={getThumbnailUrl(image.url)} alt="" loading="lazy" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}
