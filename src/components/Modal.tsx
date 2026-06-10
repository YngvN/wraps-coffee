import { useEffect, type ReactNode } from 'react'
import './Modal.scss'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
}

export function Modal({ open, onClose, title, children }: ModalProps) {
  useEffect(() => {
    if (!open) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        {title && <h3 className="modal__title">{title}</h3>}
        <div className="modal__body">{children}</div>
        <button type="button" className="modal__close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
    </div>
  )
}
