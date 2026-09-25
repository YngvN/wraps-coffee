import { AnimatePresence, motion } from 'framer-motion'
import { useEffect } from 'react'
import { UndoIcon } from './UndoIcon'
import './UndoToast.scss'

interface UndoToastProps {
  /** What just happened, e.g. "Ola N. moved to Done". `null` hides the toast. */
  message: string | null
  /** Label on the action button, e.g. "Undo". */
  actionLabel: string
  onAction: () => void
  /** Called when the toast times out. */
  onDismiss: () => void
  /** Changes whenever a new action happens, so the timer restarts even if `message` is identical to the last one. */
  resetKey?: string | number
  /** How long the toast stays up. Defaults to 5 s. */
  durationMs?: number
}

/**
 * A short-lived bar at the bottom centre of its nearest positioned ancestor, offering to reverse the
 * action that just happened — for touch UIs where a mis-tap is easy and a confirm dialog on every
 * action would be too slow. A new action replaces the previous toast rather than stacking. Positioned
 * `absolute` (not `fixed`) so it stays inside whatever pane or panel it's rendered in.
 */
export function UndoToast({ message, actionLabel, onAction, onDismiss, resetKey, durationMs = 5000 }: UndoToastProps) {
  useEffect(() => {
    if (!message) return
    const timeout = setTimeout(onDismiss, durationMs)
    return () => clearTimeout(timeout)
  }, [message, resetKey, durationMs, onDismiss])

  return (
    <AnimatePresence>
      {message && (
        <motion.div
          key={resetKey ?? message}
          className="undo-toast"
          role="status"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
        >
          <span className="undo-toast__message">{message}</span>
          <button type="button" className="undo-toast__action" onClick={onAction}>
            <UndoIcon />
            {actionLabel}
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
