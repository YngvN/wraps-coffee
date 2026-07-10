import { AnimatePresence, motion, useDragControls } from 'framer-motion'
import { useEffect, useState, type PointerEvent, type ReactNode } from 'react'
import './Modal.scss'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  /** The current sub-view's own name, shown right after `title` in regular weight (vs. the title's bold), separated by " - " — e.g. "Edit screen - Resize panes". Omit while showing the modal's own top-level content, with no sub-view open. */
  route?: string
  /**
   * Whether dragging a slider inside this modal turns it (and the backdrop)
   * transparent — on by default, since that's what lets the on-screen
   * text-size editor's sliders be watched live against the actual display
   * behind the sheet. Set to `false` for a modal with nothing relevant
   * behind it to peek through to (e.g. the admin dashboard's own screen
   * editor, which just sits over a list of other screens).
   */
  transparentOnSliderDrag?: boolean
  children: ReactNode
}

/** How far (px) or how fast (px/s) the sheet has to be dragged down before letting go closes it instead of springing back open. */
const CLOSE_OFFSET_THRESHOLD = 120
const CLOSE_VELOCITY_THRESHOLD = 500

/**
 * An iOS-style bottom sheet: slides up from the bottom of the screen when
 * `open` toggles on, and back down when it toggles off (or the × button,
 * Escape, or the backdrop is used) — staying mounted during that exit
 * animation via `AnimatePresence`. Its own handle bar at the top (not the
 * sheet as a whole, so scrolling or interacting with its content never
 * fights with it) can be dragged: past `CLOSE_OFFSET_THRESHOLD` or
 * `CLOSE_VELOCITY_THRESHOLD` on release, it closes the same way the ×
 * button would; short of that, it springs back open. Dragging the handle
 * upward is elastic and always springs back to that same open height too —
 * it can never be pulled any further open than that, which also means its
 * bottom edge can never leave the bottom of the screen, so no gap ever
 * opens up beneath it while it's being dragged. While the user is actively
 * dragging any `<input type="range">` inside it (detected by listening for
 * a pointer going down on one, not by any prop other than
 * `transparentOnSliderDrag` itself), both the backdrop and the sheet's own
 * background turn transparent, so a slider that's changing something on the
 * page behind the modal (e.g. the on-screen text-size editor) can be
 * watched live instead of hidden behind it — snapping back to normal as
 * soon as the pointer's released, wherever that happens to be. A caller
 * with nothing relevant behind its own modal to peek through to (e.g. the
 * admin dashboard's screen editor, which just sits over a list of other
 * screens) passes `transparentOnSliderDrag={false}` to skip this entirely.
 * The sheet itself (`.modal`) only clips to its own
 * rounded shape (`overflow: hidden`) and never scrolls directly — scrolling
 * happens on an inner wrapper (`.modal__scroll`) below the header instead,
 * so the native scrollbar renders as a plain rectangle inset from the
 * sheet's own edges, instead of bleeding past its rounded corners. The
 * sheet's own background always spans the full width of the screen, but
 * its title/body (`.modal__content`) are capped to a readable width and
 * centered within it, so it doesn't stretch into unreadably wide form
 * fields on larger screens. The handle bar, title and × button together
 * (`.modal__header`) sit above `.modal__scroll`, not inside it, so they
 * stay in view the whole time the body scrolls beneath them; the title and
 * × button (`.modal__header-row`) share that same capped, centered width
 * as the body below them, with a permanent bottom border — no wider than
 * that, so it only ever separates content that's actually there to scroll
 * under it — and the × lines up with the title since they're side by side
 * in that same row. When a caller has its own sub-view navigation (e.g.
 * the admin screen editor's "Resize panes" panel), `route` names the
 * currently open one right after the title in regular weight, e.g. "Edit
 * screen - Resize panes".
 */
export function Modal({ open, onClose, title, route, transparentOnSliderDrag = true, children }: ModalProps) {
  const [isDraggingSlider, setIsDraggingSlider] = useState(false)
  const dragControls = useDragControls()

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
    if (!transparentOnSliderDrag) return
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
            onClick={(event) => event.stopPropagation()}
            onPointerDown={handlePointerDown}
            drag="y"
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.2, bottom: 1 }}
            onDragEnd={(_event, info) => {
              if (info.offset.y > CLOSE_OFFSET_THRESHOLD || info.velocity.y > CLOSE_VELOCITY_THRESHOLD) onClose()
            }}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 40, stiffness: 400 }}
          >
            <div className="modal__header">
              <div className="modal__handle" onPointerDown={(event) => dragControls.start(event)}>
                <span className="modal__handle-bar" />
              </div>
              <div className="modal__header-row">
                {title && (
                  <h3 className="modal__title">
                    {title}
                    {route && <span className="modal__route"> - {route}</span>}
                  </h3>
                )}
                <button type="button" className="modal__close" onClick={onClose} aria-label="Close">
                  ×
                </button>
              </div>
            </div>
            <div className="modal__scroll">
              <div className="modal__content">
                <div className="modal__body">{children}</div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
