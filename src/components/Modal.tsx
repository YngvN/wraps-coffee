import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState, type PointerEvent, type ReactNode } from 'react'
import './Modal.scss'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
}

/**
 * Dialog overlay that fades in/out (and slightly scales the dialog box) when
 * `open` toggles, staying mounted during the exit animation via
 * `AnimatePresence`. While the user is actively dragging any `<input
 * type="range">` inside it (detected by listening for a pointer going down
 * on one, not by any prop a caller has to pass in), both the backdrop and
 * the dialog's own background turn transparent, so a slider that's changing
 * something on the page behind the modal (e.g. the on-screen text-size
 * editor) can be watched live instead of hidden behind it — snapping back
 * to normal as soon as the pointer's released, wherever that happens to be.
 */
export function Modal({ open, onClose, title, children }: ModalProps) {
  const [isDraggingSlider, setIsDraggingSlider] = useState(false)

  useEffect(() => {
    if (!open) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  useEffect(() => {
    if (!isDraggingSlider) return

    const stopDragging = () => setIsDraggingSlider(false)
    window.addEventListener('pointerup', stopDragging)
    window.addEventListener('pointercancel', stopDragging)
    return () => {
      window.removeEventListener('pointerup', stopDragging)
      window.removeEventListener('pointercancel', stopDragging)
    }
  }, [isDraggingSlider])

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement
    if (target instanceof HTMLInputElement && target.type === 'range') setIsDraggingSlider(true)
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className={`modal-overlay${isDraggingSlider ? ' modal-overlay--transparent' : ''}`}
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
        >
          <motion.div
            className={`modal${isDraggingSlider ? ' modal--transparent' : ''}`}
            role="dialog"
            aria-modal="true"
            layout
            onClick={(event) => event.stopPropagation()}
            onPointerDown={handlePointerDown}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ default: { duration: 0.2, ease: 'easeOut' }, layout: { duration: 0.3, ease: 'easeOut' } }}
          >
            {title && <h3 className="modal__title">{title}</h3>}
            <div className="modal__body">{children}</div>
            <button type="button" className="modal__close" onClick={onClose} aria-label="Close">
              ×
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
