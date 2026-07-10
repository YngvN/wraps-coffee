import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { subscribe, type ReportedError } from '../lib/errorNotifications'
import { Modal } from './Modal'
import './ErrorToast.scss'

/**
 * A small box fixed to the top-right corner, showing the most recently
 * reported error's short summary — for background/operational problems
 * with no obvious inline place to show them (e.g. the local server's Neon
 * bridge losing its connection). Clicking the box itself opens a `Modal`
 * with the fuller detail, if any; clicking its own "×" just dismisses it.
 * A new error replaces whatever's currently shown, rather than stacking.
 * See `src/lib/errorNotifications.ts` for how to report one.
 */
export function ErrorToast() {
  const [error, setError] = useState<ReportedError | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  useEffect(() => subscribe(setError), [])

  const dismiss = () => setError(null)

  return (
    <>
      <AnimatePresence>
        {error && (
          <motion.button
            type="button"
            className="error-toast"
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            onClick={() => setDetailOpen(true)}
          >
            <span className="error-toast__summary">{error.summary}</span>
            <span
              className="error-toast__close"
              role="button"
              aria-label="Dismiss"
              onClick={(event) => {
                event.stopPropagation()
                dismiss()
              }}
            >
              ×
            </span>
          </motion.button>
        )}
      </AnimatePresence>

      <Modal open={detailOpen && error !== null} onClose={() => setDetailOpen(false)} title={error?.summary} transparentOnSliderDrag={false}>
        <p className="error-toast__detail">{error?.detail ?? error?.summary}</p>
      </Modal>
    </>
  )
}
