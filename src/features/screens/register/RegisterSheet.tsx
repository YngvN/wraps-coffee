import { motion } from 'framer-motion'
import type { ReactNode } from 'react'
import { CloseIcon } from '../../../components'
import { useLanguage } from '../../../i18n'

interface RegisterSheetProps {
  title: string
  onClose: () => void
  /** Extra class on the panel, for a sheet that needs its own width or layout. */
  className?: string
  children: ReactNode
}

/**
 * The frame every register dialog (Pay, PIN pad, product editor, pickup result) opens in: the order
 * board's own in-pane sheet (`.order-sheet*` in `OrdersBoard.scss`), so they share its look, its
 * scale-in animation and tap-outside-to-close. Wrap in `AnimatePresence` for the closing animation.
 */
export function RegisterSheet({ title, onClose, className, children }: RegisterSheetProps) {
  const { t } = useLanguage()
  return (
    <motion.div className="order-sheet" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
      <motion.div
        className={className ? `order-sheet__panel register-sheet ${className}` : 'order-sheet__panel register-sheet'}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        initial={{ opacity: 0, scale: 0.94, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ type: 'spring', stiffness: 520, damping: 38 }}
      >
        <header className="order-sheet__header">
          <h2 className="order-sheet__title">{title}</h2>
          <button type="button" className="order-sheet__close" onClick={onClose} aria-label={t('screenDisplay.orders.close')}>
            <CloseIcon />
          </button>
        </header>
        {children}
      </motion.div>
    </motion.div>
  )
}
