import type { ChangeEvent, DragEvent } from 'react'
import { useEffect, useRef, useState } from 'react'
import { useAdminSession } from '../hooks/useAdminSession'
import { useLanguage } from '../i18n'
import { deleteUpload, isOwnUploadUrl } from '../lib/localServer'
import { dismissUpload, retryUpload, startUpload, useUpload } from '../lib/uploadManager'
import { getThumbnailUrl } from '../utils/responsiveImage'
import { Input } from './Input'
import { StoredImagePickerModal } from './StoredImagePickerModal'
import './ImageUploadField.scss'

interface ImageUploadFieldProps {
  id: string
  value: string
  onChange: (url: string) => void
  /**
   * Also accepts video files, uploaded through the server's transcode
   * pipeline (`server/videoUploads.ts`) instead of the plain image path —
   * off by default so a consumer whose own render path is still a bare
   * `<img>` doesn't silently accept a video it has nowhere to actually show.
   * Only the Screens video slide field passes this today.
   */
  acceptVideo?: boolean
}

/** Every video is always canonicalized to `.mp4` server-side, so this is an unambiguous way to tell a stored value's own kind from its URL alone, with no extra metadata field on this generic field. */
function isVideoUrl(url: string): boolean {
  return url.toLowerCase().endsWith('.mp4')
}

/**
 * Three ways to set an image (or, with `acceptVideo`, a video too): upload a
 * new file (dragged-and-dropped anywhere on this field, or picked via the
 * file dialog), reuse one already stored on the server (the "Use stored"
 * picker), or paste an external URL (hidden behind "Use URL" until needed,
 * since most edits use one of the other two). An upload also generates
 * compressed `-small`/`-thumb` variants server-side for an image, or a
 * transcoded MP4 + poster frame for a video — see "Image upload/storage" in
 * the sync-server plan and `server/videoUploads.ts`. Replacing a value that
 * pointed at this same server's own upload deletes the old file (fire and
 * forget); an external URL is never touched. Uploads run through the global
 * `uploadManager` rather than this field's own local state, so a large
 * video keeps transferring (with its progress still visible) even if this
 * field itself unmounts mid-upload — e.g. switching form tabs.
 */
export function ImageUploadField({ id, value, onChange, acceptVideo }: ImageUploadFieldProps) {
  const { t } = useLanguage()
  const { session } = useAdminSession()
  const [uploadId, setUploadId] = useState<string | undefined>()
  const [showUrlInput, setShowUrlInput] = useState(false)
  const [showPicker, setShowPicker] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  // Nested elements (the preview image, the buttons) each fire their own
  // drag enter/leave as the pointer crosses them — a counter (rather than a
  // boolean) is what keeps the drop overlay from flickering.
  const dragDepth = useRef(0)
  // The value this field held right before the in-flight upload started —
  // captured so the effect below can delete the old own-server file once the
  // new one is ready, without depending on `value` (which changes the moment
  // `onChange` fires) inside its own dependency array.
  const previousValueRef = useRef('')

  // Once `dismissUpload` below removes this id from the global store,
  // `useUpload` naturally starts returning `undefined` for it on its own —
  // `uploadId` itself is left stale rather than reset, since a stale id that
  // no longer resolves to anything is harmless, and a *new* upload always
  // overwrites it via `handleFile` anyway.
  const tracked = useUpload(uploadId)

  useEffect(() => {
    if (!tracked || tracked.status !== 'ready' || !tracked.result) return
    onChange(tracked.result.url)
    const previousValue = previousValueRef.current
    if (session && previousValue && isOwnUploadUrl(previousValue)) void deleteUpload(previousValue, session.token)
    dismissUpload(tracked.id)
  }, [tracked, onChange, session])

  const handleFile = (file: File) => {
    if (!session) return
    const isVideo = file.type.startsWith('video/')
    previousValueRef.current = value
    setUploadId(startUpload(file, isVideo ? 'video' : 'image', session.token))
  }

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) handleFile(file)
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
    if (file && (file.type.startsWith('image/') || (acceptVideo && file.type.startsWith('video/')))) handleFile(file)
  }

  const handleRemove = () => {
    const previousValue = value
    onChange('')
    if (session && previousValue && isOwnUploadUrl(previousValue)) void deleteUpload(previousValue, session.token)
  }

  const handleRetry = () => {
    if (tracked && session) retryUpload(tracked.id, session.token)
  }

  // Once a value is set, the set-a-value actions give way to "Replace"
  // (still opens the file dialog) and "Remove" — dragging a new file onto
  // the field also still replaces it directly (the drop handlers above
  // aren't gated on this). While actively editing a pasted URL
  // (`showUrlInput`), the full action row stays visible even after `value`
  // gets a first character, so typing one in doesn't yank the input out
  // from under the admin mid-edit.
  const hasValue = Boolean(value)
  const isUploading = tracked?.status === 'uploading'
  const isProcessing = tracked?.status === 'processing'
  const isFailed = tracked?.status === 'failed'
  const busy = isUploading || isProcessing

  const fileLabel = (
    <label className={`image-upload-field__file-label${busy || !session ? ' image-upload-field__file-label--disabled' : ''}`}>
      {isUploading
        ? t('imageUpload.uploadingPercent', { percent: Math.round(tracked.progress * 100) })
        : isProcessing
          ? t('imageUpload.processingVideo')
          : hasValue
            ? t('imageUpload.replaceButton')
            : acceptVideo
              ? t('imageUpload.uploadButtonMedia')
              : t('imageUpload.uploadButton')}
      <input type="file" accept={acceptVideo ? 'image/*,video/*' : 'image/*'} onChange={handleFileChange} disabled={busy || !session} />
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
      {hasValue && !showUrlInput ? (
        <div className="image-upload-field__row">
          <div className="image-upload-field__preview-wrap">
            <img src={isVideoUrl(value) ? getThumbnailUrl(value) : value} alt="" className="image-upload-field__preview" />
            <p className="image-upload-field__replace-hint">{t('imageUpload.dragToReplace')}</p>
          </div>
          <div className="image-upload-field__actions">
            {fileLabel}
            <button
              type="button"
              className="image-upload-field__action-button image-upload-field__action-button--remove"
              onClick={handleRemove}
              disabled={busy}
            >
              {t('imageUpload.removeButton')}
            </button>
          </div>
        </div>
      ) : (
        <div className="image-upload-field__dropzone">
          <p className="image-upload-field__dropzone-hint">{acceptVideo ? t('imageUpload.dropHintMedia') : t('imageUpload.dropHint')}</p>
          {acceptVideo && <p className="image-upload-field__hint">{t('imageUpload.sizeLimitMedia')}</p>}
          <div className="image-upload-field__actions">
            {fileLabel}
            <button type="button" className="image-upload-field__action-button" onClick={() => setShowPicker(true)} disabled={!session || busy}>
              {t('imageUpload.useStoredButton')}
            </button>
            <button type="button" className="image-upload-field__action-button" onClick={() => setShowUrlInput((shown) => !shown)} disabled={busy}>
              {t('imageUpload.useUrlButton')}
            </button>
          </div>
          {showUrlInput && <Input id={id} value={value} onChange={(event) => onChange(event.target.value)} />}
        </div>
      )}

      {isUploading && (
        <div className="image-upload-field__progress" role="progressbar" aria-valuenow={Math.round(tracked.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
          <div className="image-upload-field__progress-bar" style={{ width: `${Math.round(tracked.progress * 100)}%` }} />
        </div>
      )}

      {isDragging && (
        <div className="image-upload-field__drop-overlay">
          <p>{acceptVideo ? t('imageUpload.dropHintMedia') : t('imageUpload.dropHint')}</p>
        </div>
      )}

      {!session && <p className="image-upload-field__hint">{t('imageUpload.noSession')}</p>}
      {isFailed && (
        <div className="image-upload-field__error-row">
          <p className="input-field__error">{tracked?.errorMessage || t('imageUpload.videoFailedFallback')}</p>
          {/* Only a video has a server-side staged source to retry from — a failed image upload just needs picking the file again via the upload button above. */}
          {tracked?.kind === 'video' && (
            <button type="button" className="image-upload-field__action-button" onClick={handleRetry}>
              {t('imageUpload.retryButton')}
            </button>
          )}
        </div>
      )}

      <StoredImagePickerModal
        open={showPicker}
        onClose={() => setShowPicker(false)}
        onSelect={(url) => {
          onChange(url)
          setShowPicker(false)
        }}
        acceptVideo={acceptVideo}
      />
    </div>
  )
}
