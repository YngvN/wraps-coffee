import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, type ReactNode } from 'react'
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
 * `AnimatePresence`.
 */
export function Modal({ open, onClose, title, children }: ModalProps) {
  useEffect(() => {
    if (!open) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="modal-overlay"
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
        >
          <motion.div
            className="modal"
            role="dialog"
            aria-modal="true"
            layout
            onClick={(event) => event.stopPropagation()}
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
