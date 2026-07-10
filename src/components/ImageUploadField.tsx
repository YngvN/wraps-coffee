import type { ChangeEvent, DragEvent } from 'react'
import { useRef, useState } from 'react'
import { useAdminSession } from '../hooks/useAdminSession'
import { useLanguage } from '../i18n'
import { deleteUpload, isOwnUploadUrl, SessionExpiredError, uploadImage } from '../lib/localServer'
import { Input } from './Input'
import { StoredImagePickerModal } from './StoredImagePickerModal'
import './ImageUploadField.scss'

interface ImageUploadFieldProps {
  id: string
  value: string
  onChange: (url: string) => void
}

/**
 * Three ways to set an image: upload a new file (dragged-and-dropped
 * anywhere on this field, or picked via the file dialog), reuse one already
 * stored on the server (the "Use stored image" picker), or paste an
 * external URL (hidden behind "Use URL" until needed, since most edits use
 * one of the other two). An upload also generates compressed `-small`/
 * `-thumb` variants server-side — see "Image upload/storage" in the
 * sync-server plan. Replacing a value that pointed at this same server's
 * own upload deletes the old file (fire and forget); an external URL is
 * never touched.
 */
export function ImageUploadField({ id, value, onChange }: ImageUploadFieldProps) {
  const { t } = useLanguage()
  const { session, clearSession } = useAdminSession()
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showUrlInput, setShowUrlInput] = useState(false)
  const [showPicker, setShowPicker] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  // Nested elements (the preview image, the buttons) each fire their own
  // drag enter/leave as the pointer crosses them — a counter (rather than a
  // boolean) is what keeps the drop overlay from flickering.
  const dragDepth = useRef(0)

  const handleFile = async (file: File) => {
    if (!session) return

    setError(null)
    setUploading(true)
    try {
      const previousValue = value
      const url = await uploadImage(file, session.token)
      onChange(url)
      if (previousValue && isOwnUploadUrl(previousValue)) void deleteUpload(previousValue, session.token)
    } catch (err) {
      if (err instanceof SessionExpiredError) {
        setError(t('imageUpload.sessionExpired'))
        clearSession()
      } else {
        setError(err instanceof Error ? err.message : t('imageUpload.error'))
      }
    } finally {
      setUploading(false)
    }
  }

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) void handleFile(file)
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
    const file = event.dataTransfer.files[0]
    if (file?.type.startsWith('image/')) void handleFile(file)
  }

  const handleRemove = () => {
    const previousValue = value
    onChange('')
    if (session && previousValue && isOwnUploadUrl(previousValue)) void deleteUpload(previousValue, session.token)
  }

  // Once an image is set, the set-an-image actions give way to "Replace"
  // (still opens the file dialog) and "Remove" — dragging a new file onto
  // the field also still replaces it directly (the drop handlers above
  // aren't gated on this). While actively editing a pasted URL
  // (`showUrlInput`), the full action row stays visible even after `value`
  // gets a first character, so typing one in doesn't yank the input out
  // from under the admin mid-edit.
  const hasImage = Boolean(value)

  const fileLabel = (
    <label className={`image-upload-field__file-label${uploading || !session ? ' image-upload-field__file-label--disabled' : ''}`}>
      {uploading ? t('imageUpload.uploading') : hasImage ? t('imageUpload.replaceButton') : t('imageUpload.uploadButton')}
      <input type="file" accept="image/*" onChange={handleFileChange} disabled={uploading || !session} />
    </label>
  )

  return (
    <div
      className={`image-upload-field${isDragging ? ' image-upload-field--dragging' : ''}`}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {hasImage && !showUrlInput ? (
        <div className="image-upload-field__row">
          <div className="image-upload-field__preview-wrap">
            <img src={value} alt="" className="image-upload-field__preview" />
            <p className="image-upload-field__replace-hint">{t('imageUpload.dragToReplace')}</p>
          </div>
          <div className="image-upload-field__actions">
            {fileLabel}
            <button type="button" className="image-upload-field__action-button image-upload-field__action-button--remove" onClick={handleRemove}>
              {t('imageUpload.removeButton')}
            </button>
          </div>
        </div>
      ) : (
        <div className="image-upload-field__dropzone">
          <p className="image-upload-field__dropzone-hint">{t('imageUpload.dropHint')}</p>
          <div className="image-upload-field__actions">
            {fileLabel}
            <button type="button" className="image-upload-field__action-button" onClick={() => setShowPicker(true)} disabled={!session}>
              {t('imageUpload.useStoredButton')}
            </button>
            <button type="button" className="image-upload-field__action-button" onClick={() => setShowUrlInput((shown) => !shown)}>
              {t('imageUpload.useUrlButton')}
            </button>
          </div>
          {showUrlInput && <Input id={id} value={value} onChange={(event) => onChange(event.target.value)} />}
        </div>
      )}

      {isDragging && (
        <div className="image-upload-field__drop-overlay">
          <p>{t('imageUpload.dropHint')}</p>
        </div>
      )}

      {!session && <p className="image-upload-field__hint">{t('imageUpload.noSession')}</p>}
      {error && <p className="input-field__error">{error}</p>}

      <StoredImagePickerModal
        open={showPicker}
        onClose={() => setShowPicker(false)}
        onSelect={(url) => {
          onChange(url)
          setShowPicker(false)
        }}
      />
    </div>
  )
}
