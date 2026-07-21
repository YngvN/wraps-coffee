import { useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent, type KeyboardEvent } from 'react'
import { Alert, EditIcon, RedoIcon, Spinner, TranslatedText, TrashIcon } from '../../../components'
import { useAdminSession } from '../../../hooks/useAdminSession'
import { useDateFormatPreference } from '../../../hooks/useDateFormatPreference'
import { useLanguage } from '../../../i18n'
import { deleteUpload, getStorageUsage, listUploads, renameUpload, SessionExpiredError, type UploadedMedia } from '../../../lib/localServer'
import { retryUpload, startUpload, useUploads } from '../../../lib/uploadManager'
import { formatDate } from '../../../utils/dateFormat'
import { getThumbnailUrl } from '../../../utils/responsiveImage'
import { MediaViewerModal } from './MediaViewerModal'
import './MediaLibraryView.scss'

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

/**
 * Grid of every image/video currently stored on the local server —
 * thumbnails/posters only (via `?size=thumb`), filename or a user-given
 * label, size, and upload date, plus rename/delete actions. Media can be
 * added either via the "+ Add" button or by dragging files anywhere onto
 * this view; both start the same global `uploadManager` transfer
 * `ImageUploadField` uses, so a large video keeps uploading (its progress
 * shown inline here, and in the top navbar's own indicator) even if the
 * admin navigates elsewhere mid-transfer. A video's tile shows a
 * "Processing…" spinner while its server-side transcode runs (this view
 * re-polls the list every few seconds while any entry is still processing,
 * covering the case where the transcode was already running before this
 * view was even opened), and a Retry action if it failed.
 */
export function MediaLibraryView() {
  const { t } = useLanguage()
  const [dateFormat] = useDateFormatPreference()
  const { session, clearSession } = useAdminSession()
  const [items, setItems] = useState<UploadedMedia[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [storage, setStorage] = useState<{ usedBytes: number; availableBytes: number } | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [renamingFilename, setRenamingFilename] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  /** Which entry the lightbox (see `MediaViewerModal`) is currently showing, as an index into `viewableItems` below — `undefined` while closed. */
  const [viewerIndex, setViewerIndex] = useState<number | undefined>(undefined)
  // Nested elements inside the drop zone each fire their own drag
  // enter/leave as the pointer crosses them — a plain counter (rather than a
  // boolean) is what keeps the drop overlay from flickering while dragging
  // over the grid's own children.
  const dragDepth = useRef(0)

  const activeUploads = useUploads().filter((upload) => upload.status === 'uploading' || upload.status === 'processing' || upload.status === 'failed')

  const refresh = useCallback(() => {
    if (!session) return
    listUploads(session.token)
      .then(setItems)
      .catch((err: unknown) => {
        if (err instanceof SessionExpiredError) {
          setError(t('imageUpload.sessionExpired'))
          clearSession()
        } else {
          setError(t('admin.mediaLibrary.error'))
        }
      })
    getStorageUsage(session.token)
      .then(setStorage)
      .catch(() => {
        // Non-critical — the grid still works without a storage summary.
      })
  }, [session, t, clearSession])

  useEffect(() => {
    refresh()
  }, [refresh])

  // A video already mid-transcode when this view was opened (so no locally
  // tracked upload exists for it) still needs its status to resolve —
  // re-poll while any listed entry is still processing.
  useEffect(() => {
    if (!items?.some((item) => item.status === 'processing')) return
    const interval = setInterval(refresh, 3000)
    return () => clearInterval(interval)
  }, [items, refresh])

  // Once a tracked upload this view started (or any upload anywhere) finishes,
  // refresh the persisted list so it shows up as a real entry.
  const readyUploadIds = useUploads()
    .filter((upload) => upload.status === 'ready')
    .map((upload) => upload.id)
    .join(',')
  useEffect(() => {
    if (readyUploadIds) refresh()
  }, [readyUploadIds, refresh])

  const uploadFiles = (files: FileList | File[]) => {
    if (!session) return
    for (const file of Array.from(files)) {
      if (file.type.startsWith('image/')) startUpload(file, 'image', session.token)
      else if (file.type.startsWith('video/')) startUpload(file, 'video', session.token)
    }
  }

  const handleFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    event.target.value = ''
    if (files) uploadFiles(files)
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
    if (event.dataTransfer.files.length > 0) uploadFiles(event.dataTransfer.files)
  }

  const handleDelete = (item: UploadedMedia) => {
    if (!session || !window.confirm(t('admin.common.confirmDelete'))) return
    void deleteUpload(item.url, session.token).then(refresh)
  }

  const startRename = (item: UploadedMedia) => {
    setRenamingFilename(item.filename)
    setRenameValue(item.displayName ?? '')
  }

  const commitRename = (filename: string) => {
    if (session) void renameUpload(filename, renameValue.trim(), session.token).then(refresh)
    setRenamingFilename(null)
  }

  const handleRenameKeyDown = (event: KeyboardEvent<HTMLInputElement>, filename: string) => {
    if (event.key === 'Enter') commitRename(filename)
    else if (event.key === 'Escape') setRenamingFilename(null)
  }

  // Only a "ready" entry (no `status` at all) has real, playable content —
  // a still-processing or failed one has nothing worth opening the lightbox
  // for, so it's excluded here rather than the viewer having to special-case
  // a non-viewable item mid-navigation.
  const viewableItems = (items ?? []).filter((item) => item.status === undefined)
  const openViewer = (item: UploadedMedia) => setViewerIndex(viewableItems.findIndex((candidate) => candidate.filename === item.filename))

  return (
    <div
      className={`media-library${isDragging ? ' media-library--dragging' : ''}`}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="media-library__header">
        <TranslatedText as="h1" id="admin.mediaLibrary.title" />
        <label className={`media-library__add-button${!session ? ' media-library__add-button--disabled' : ''}`}>
          {`+ ${t('admin.mediaLibrary.addButton')}`}
          <input type="file" accept="image/*,video/*" multiple onChange={handleFileInputChange} disabled={!session} />
        </label>
      </div>
      <TranslatedText as="p" id="admin.mediaLibrary.description" className="admin-page-description" />
      {storage && (
        <p className="media-library__storage-summary">
          {t('admin.mediaLibrary.storageSummary', { used: formatSize(storage.usedBytes), available: formatSize(storage.availableBytes) })}
        </p>
      )}

      {isDragging && (
        <div className="media-library__drop-overlay">
          <p>{t('admin.mediaLibrary.dropHint')}</p>
        </div>
      )}

      {error && <Alert variant="error">{error}</Alert>}
      {!error && items === null && <Spinner />}
      {!error && items?.length === 0 && activeUploads.length === 0 && <Alert variant="info">{t('admin.mediaLibrary.empty')}</Alert>}

      {(activeUploads.length > 0 || (items && items.length > 0)) && (
        <ul className="media-library__grid">
          {activeUploads.map((upload) => (
            <li key={upload.id} className="media-library__item media-library__item--pending">
              <div className="media-library__thumb media-library__thumb--pending">
                {upload.status === 'uploading' && (
                  <span>{t('imageUpload.uploadingPercent', { percent: Math.round(upload.progress * 100) })}</span>
                )}
                {upload.status === 'processing' && <Spinner />}
                {upload.status === 'failed' && (
                  <>
                    <span className="media-library__failed-text">{upload.errorMessage || t('imageUpload.videoFailedFallback')}</span>
                    {/* Only a video has a server-side staged source to retry from — a failed image upload just needs re-picking the file. */}
                    {session && upload.kind === 'video' && (
                      <button type="button" className="media-library__retry-button" onClick={() => retryUpload(upload.id, session.token)}>
                        <RedoIcon />
                        {t('imageUpload.retryButton')}
                      </button>
                    )}
                  </>
                )}
              </div>
              <span className="media-library__filename">{upload.fileName}</span>
            </li>
          ))}

          {items?.map((item) => (
            <li key={item.filename} className="media-library__item">
              <div className="media-library__thumb-wrap">
                {item.status === undefined ? (
                  <button type="button" className="media-library__thumb-button" onClick={() => openViewer(item)} aria-label={item.displayName || item.filename}>
                    <img src={getThumbnailUrl(item.url)} alt="" className="media-library__thumb" loading="lazy" />
                    {item.kind === 'video' && <span className="media-library__video-badge">▶</span>}
                  </button>
                ) : (
                  <>
                    <img src={getThumbnailUrl(item.url)} alt="" className="media-library__thumb" loading="lazy" />
                    {item.kind === 'video' && <span className="media-library__video-badge">▶</span>}
                  </>
                )}
              </div>

              {renamingFilename === item.filename ? (
                <input
                  className="media-library__rename-input"
                  autoFocus
                  value={renameValue}
                  onChange={(event) => setRenameValue(event.target.value)}
                  onBlur={() => commitRename(item.filename)}
                  onKeyDown={(event) => handleRenameKeyDown(event, item.filename)}
                />
              ) : (
                <span className="media-library__filename">{item.displayName || item.filename}</span>
              )}

              <span className="media-library__meta">
                {formatSize(item.sizeBytes)} · {formatDate(new Date(item.uploadedAt), dateFormat)}
              </span>

              <div className="media-library__item-actions">
                <button type="button" className="media-library__icon-button" onClick={() => startRename(item)} aria-label={t('admin.common.edit')}>
                  <EditIcon />
                </button>
                <button type="button" className="media-library__icon-button media-library__icon-button--danger" onClick={() => handleDelete(item)} aria-label={t('admin.common.delete')}>
                  <TrashIcon />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <MediaViewerModal items={viewableItems} index={viewerIndex} onClose={() => setViewerIndex(undefined)} onNavigate={setViewerIndex} />
    </div>
  )
}
