import { AnimatePresence, motion } from 'framer-motion'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { CloseIcon } from '../../../components'
import { useLanguage } from '../../../i18n'
import './AdminRightPanel.scss'

interface AdminRightPanelProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  /** `'wide'` widens the panel (see `.admin-right-panel--wide` in `AdminRightPanel.scss`) — used by the global search panel, which needs more room for result rows than Notifications/Messages do. Defaults to `'default'`. */
  width?: 'default' | 'wide'
}

/**
 * Right-anchored slide-in overlay: a scrim plus a full-height panel that
 * slides in from the right edge of the screen, closing on either the scrim
 * or the × button — the same scrim/slide-in technique `AdminDashboard`
 * uses for its own mobile sidebar overlay, just anchored to the opposite
 * edge. Used by `NotificationsDropdown`/`MessagesDropdown` so their content
 * opens as a full side panel instead of a small anchored dropdown box.
 *
 * Rendered via `createPortal` into `document.body` rather than in place:
 * its trigger button lives inside `.admin-top-navbar`, which is
 * `position: sticky` with its own `z-index` (see `AdminTopNavbar.scss`) —
 * that establishes a stacking context, so an in-place `position: fixed`
 * child would still stack *within* it, painting over the navbar's own
 * later siblings (e.g. the Messages toggle) regardless of this panel's own
 * z-index. Portaling to `document.body` escapes that context entirely, the
 * same way the navbar's own siblings in `AdminDashboard` do.
 */
export function AdminRightPanel({ open, onClose, title, children, width = 'default' }: AdminRightPanelProps) {
  const { t } = useLanguage()

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="admin-right-panel__scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />
          <motion.aside
            className={`admin-right-panel${width === 'wide' ? ' admin-right-panel--wide' : ''}`}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
          >
            <div className="admin-right-panel__header">
              <span className="admin-right-panel__title">{title}</span>
              <button type="button" className="admin-right-panel__close" onClick={onClose} aria-label={t('admin.common.close')} title={t('admin.common.close')}>
                <CloseIcon />
              </button>
            </div>
            <div className="admin-right-panel__body">{children}</div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>,
    document.body,
  )
}
