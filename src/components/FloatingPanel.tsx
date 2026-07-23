import { AnimatePresence, motion, useDragControls } from 'framer-motion'
import { useRef, type ReactNode } from 'react'
import { useEscapeToClose } from '../hooks/useEscapeToClose'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { MoveIcon } from './MoveIcon'
import './FloatingPanel.scss'

/** Viewport width from which the panel becomes a freely draggable floating card instead of a bottom sheet — matches `Modal.tsx`'s own breakpoint. */
const BIG_SCREEN_QUERY = '(min-width: 768px)'

interface FloatingPanelProps {
  open: boolean
  onClose: () => void
  title?: string
  /** A non-scrolling row pinned to the bottom of the panel — e.g. Restore/Done actions. */
  footer?: ReactNode
  children: ReactNode
}

/**
 * A Figma/XD-sidebar-style floating panel: unlike `Modal`, it has no
 * backdrop at all, so whatever's behind it (the pane canvas) stays visible
 * and clickable — clicking a different, dimmed pane can switch what this
 * panel is editing without needing to close it first. Docked to the top-right
 * corner by default, freely draggable by its own header (both axes, unlike
 * `Modal`'s single-axis drag-to-close gesture) and constrained to the
 * viewport via a full-screen `pointer-events: none` bounds element — a
 * `MoveIcon` sits to the left of the title as a visual cue that the header
 * is what's draggable, whenever dragging is actually enabled (i.e. not in
 * the mobile sheet mode below). Closes
 * via its × button or Escape (`useEscapeToClose`, shared with `Modal`) —
 * there's no backdrop to click, so that's not a close affordance here.
 * Below `BIG_SCREEN_QUERY`, it drops the drag behavior (awkward to reposition
 * on a small touch screen) and docks full-width to the bottom of the
 * viewport instead, sheet-style.
 */
export function FloatingPanel({ open, onClose, title, footer, children }: FloatingPanelProps) {
  const dragControls = useDragControls()
  const constraintsRef = useRef<HTMLDivElement>(null)
  const isBigScreen = useMediaQuery(BIG_SCREEN_QUERY)

  useEscapeToClose(open, onClose)

  return (
    <div className="floating-panel-bounds" ref={constraintsRef}>
      <AnimatePresence>
        {open && (
          <motion.div
            className={`floating-panel${isBigScreen ? '' : ' floating-panel--sheet'}`}
            role="dialog"
            aria-modal="false"
            drag={isBigScreen}
            dragControls={dragControls}
            dragListener={false}
            dragMomentum={false}
            dragElastic={0}
            dragConstraints={constraintsRef}
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
          >
            <div className="floating-panel__header" onPointerDown={(event) => isBigScreen && dragControls.start(event)}>
              <div className="floating-panel__header-row">
                {isBigScreen && (
                  <span className="floating-panel__move-icon" aria-hidden="true">
                    <MoveIcon />
                  </span>
                )}
                {title && <h3 className="floating-panel__title">{title}</h3>}
                <button type="button" className="floating-panel__close" onClick={onClose} aria-label="Close">
                  ×
                </button>
              </div>
            </div>
            <div className="floating-panel__scroll">
              <div className="floating-panel__body">{children}</div>
            </div>
            {footer && <div className="floating-panel__footer">{footer}</div>}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
