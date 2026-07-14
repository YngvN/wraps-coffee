import { useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { Alert, Spinner, TranslatedText } from '../../../components'
import { useAdminSession } from '../../../hooks/useAdminSession'
import { useDateFormatPreference } from '../../../hooks/useDateFormatPreference'
import { useLanguage } from '../../../i18n'
import { listUploads, SessionExpiredError, uploadImage, type UploadedImage } from '../../../lib/localServer'
import { formatDate } from '../../../utils/dateFormat'
import { getThumbnailUrl } from '../../../utils/responsiveImage'
import './ImageLibraryView.scss'

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Grid of every image currently stored on the local server — thumbnails
 * only (via `?size=thumb`), filename, size, and upload date. Images can be
 * added either via the "+ Add image" button or by dragging files anywhere
 * onto this view; both go through the same upload path as the admin edit
 * forms' own `ImageUploadField`. No delete/rename/"where is this used"
 * affordance yet — see "Image Library" in the sync-server plan for why
 * that's deliberately follow-up work, not this pass.
 */
export function ImageLibraryView() {
  const { t } = useLanguage()
  const [dateFormat] = useDateFormatPreference()
  const { session, clearSession } = useAdminSession()
  const [images, setImages] = useState<UploadedImage[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  // Nested elements inside the drop zone each fire their own drag
  // enter/leave as the pointer crosses them — a plain counter (rather than a
  // boolean) is what keeps the drop overlay from flickering while dragging
  // over the grid's own children.
  const dragDepth = useRef(0)

  const refresh = useCallback(() => {
    if (!session) return
    listUploads(session.token)
      .then(setImages)
      .catch((err: unknown) => {
        if (err instanceof SessionExpiredError) {
          setError(t('imageUpload.sessionExpired'))
          clearSession()
        } else {
          setError(t('admin.imageLibrary.error'))
        }
      })
  }, [session, t, clearSession])

  useEffect(() => {
    refresh()
  }, [refresh])

  const uploadFiles = async (files: FileList | File[]) => {
    if (!session) return
    const imageFiles = Array.from(files).filter((file) => file.type.startsWith('image/'))
    if (imageFiles.length === 0) return

    setUploadError(null)
    setUploading(true)
    try {
      for (const file of imageFiles) {
        await uploadImage(file, session.token)
      }
      refresh()
    } catch (err) {
      if (err instanceof SessionExpiredError) {
        setUploadError(t('imageUpload.sessionExpired'))
        clearSession()
      } else {
        setUploadError(err instanceof Error ? err.message : t('admin.imageLibrary.uploadError'))
      }
    } finally {
      setUploading(false)
    }
  }

  const handleFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    event.target.value = ''
    if (files) void uploadFiles(files)
  }

  const handleDragEnter = (event: DragEvent) => {
    event.preventDefault()
    dragDepth.current += 1
    setIsDragging(true)
  }

  const handleDragOver = (event: DragEvent) => {
    event.preventDefault()
  }

  const handleDragLeave = (event: DragEvent) => {
    event.preventDefault()
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) setIsDragging(false)
  }

  const handleDrop = (event: DragEvent) => {
    event.preventDefault()
    dragDepth.current = 0
    setIsDragging(false)
    if (event.dataTransfer.files.length > 0) void uploadFiles(event.dataTransfer.files)
  }

  return (
    <div
      className={`image-library${isDragging ? ' image-library--dragging' : ''}`}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="image-library__header">
        <TranslatedText as="h1" id="admin.imageLibrary.title" />
        <label className={`image-library__add-button${uploading || !session ? ' image-library__add-button--disabled' : ''}`}>
          {uploading ? t('imageUpload.uploading') : `+ ${t('admin.imageLibrary.addButton')}`}
          <input type="file" accept="image/*" multiple onChange={handleFileInputChange} disabled={uploading || !session} />
        </label>
      </div>
      <TranslatedText as="p" id="admin.imageLibrary.description" className="admin-page-description" />

      {isDragging && (
        <div className="image-library__drop-overlay">
          <p>{t('admin.imageLibrary.dropHint')}</p>
        </div>
      )}

      {error && <Alert variant="error">{error}</Alert>}
      {uploadError && <Alert variant="error">{uploadError}</Alert>}
      {!error && images === null && <Spinner />}
      {!error && images?.length === 0 && !uploading && <Alert variant="info">{t('admin.imageLibrary.empty')}</Alert>}

      {images && images.length > 0 && (
        <ul className="image-library__grid">
          {images.map((image) => (
            <li key={image.filename} className="image-library__item">
              <img src={getThumbnailUrl(image.url)} alt="" className="image-library__thumb" loading="lazy" />
              <span className="image-library__filename">{image.filename}</span>
              <span className="image-library__meta">
                {formatSize(image.sizeBytes)} · {formatDate(new Date(image.uploadedAt), dateFormat)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
