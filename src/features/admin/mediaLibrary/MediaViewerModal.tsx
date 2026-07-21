import { AnimatePresence, motion } from 'framer-motion'
import { useEffect } from 'react'
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon } from '../../../components'
import { useLanguage } from '../../../i18n'
import type { UploadedMedia } from '../../../lib/localServer'
import './MediaViewerModal.scss'

interface MediaViewerModalProps {
  /** Every item that can be navigated to — already filtered down to viewable (non-processing/failed) entries by the caller, so every index here is always showable. */
  items: UploadedMedia[]
  /** Which of `items` is currently showing, or `undefined` to render nothing (closed). */
  index: number | undefined
  onClose: () => void
  onNavigate: (index: number) => void
}

/**
 * Fullscreen lightbox for a single Media Library item — deliberately not
 * built on the shared `Modal` (an iOS-style bottom sheet capped to a
 * readable width, meant for forms, not for showing a photo or video as
 * large as the viewport allows). A plain dark backdrop instead, the media
 * itself centered and left at its own natural aspect ratio, a close button,
 * and previous/next arrow buttons — also reachable via the ← / → keys.
 * Unlike the kiosk display's own `VideoSlide` (which must never restart a
 * playing video across a stage/resize/move), a video here plays with plain
 * native `<video controls>` and is expected to reset every time the admin
 * navigates to a different item — that's a deliberate "look at something
 * else" action, not an unrelated re-render to survive.
 */
export function MediaViewerModal({ items, index, onClose, onNavigate }: MediaViewerModalProps) {
  const { t } = useLanguage()
  const open = index !== undefined
  const item = index !== undefined ? items[index] : undefined
  const hasPrevious = index !== undefined && index > 0
  const hasNext = index !== undefined && index < items.length - 1

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      else if (event.key === 'ArrowLeft' && index !== undefined && index > 0) onNavigate(index - 1)
      else if (event.key === 'ArrowRight' && index !== undefined && index < items.length - 1) onNavigate(index + 1)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, index, items.length, onClose, onNavigate])

  return (
    <AnimatePresence>
      {open && item && (
        <motion.div
          className="media-viewer-overlay"
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
        >
          <button type="button" className="media-viewer__close" onClick={onClose} aria-label={t('admin.mediaViewer.closeLabel')}>
            <CloseIcon />
          </button>

          {hasPrevious && (
            <button
              type="button"
              className="media-viewer__nav media-viewer__nav--previous"
              onClick={(event) => {
                event.stopPropagation()
                onNavigate(index - 1)
              }}
              aria-label={t('admin.mediaViewer.previousLabel')}
            >
              <ChevronLeftIcon />
            </button>
          )}

          <motion.div
            key={item.filename}
            className="media-viewer__content"
            onClick={(event) => event.stopPropagation()}
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
          >
            {item.kind === 'video' ? (
              <video className="media-viewer__media" src={item.url} controls autoPlay={false} />
            ) : (
              <img className="media-viewer__media" src={item.url} alt="" />
            )}
            <p className="media-viewer__caption">{item.displayName || item.filename}</p>
          </motion.div>

          {hasNext && (
            <button
              type="button"
              className="media-viewer__nav media-viewer__nav--next"
              onClick={(event) => {
                event.stopPropagation()
                onNavigate(index + 1)
              }}
              aria-label={t('admin.mediaViewer.nextLabel')}
            >
              <ChevronRightIcon />
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
