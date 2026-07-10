import { AnimatePresence, motion } from 'framer-motion'
import type { ReactNode } from 'react'

interface SlideTransitionProps {
  /** Identifies the view currently shown — changing it (e.g. a list to a form, a form to one of its own sub-views) triggers the slide transition. */
  viewKey: string
  /** `1` slides the incoming view in from the right (opening/going deeper) with the outgoing one leaving to the left; `-1` is the reverse (going back). */
  direction: 1 | -1
  children: ReactNode
}

const VARIANTS = {
  initial: (direction: 1 | -1) => ({ x: direction === 1 ? '100%' : '-100%', opacity: 0 }),
  animate: { x: 0, opacity: 1 },
  exit: (direction: 1 | -1) => ({ x: direction === 1 ? '-100%' : '100%', opacity: 0 }),
}

/**
 * Slides between two "views" under the same spot (a list and a form, a form
 * and one of its own sub-views, a sub-view and its own nested one) —
 * mirroring a standard mobile-style navigation stack: opening/going deeper
 * slides the new view in from the right (the old one leaving to the left);
 * going back reverses both directions. `direction` isn't inferred — the
 * caller sets it (to `1` right before opening, `-1` right before closing)
 * alongside whatever state change actually switches `viewKey`. Clips
 * horizontally only (`overflow-x`, not a full `overflow: hidden`) so the
 * sliding content can't cause the page to scroll sideways mid-transition,
 * without clipping anything that's meant to extend past its own bounds
 * vertically (e.g. a dropdown) once settled.
 */
export function SlideTransition({ viewKey, direction, children }: SlideTransitionProps) {
  return (
    <div style={{ overflowX: 'hidden' }}>
      <AnimatePresence mode="wait" initial={false} custom={direction}>
        <motion.div key={viewKey} custom={direction} variants={VARIANTS} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.25, ease: 'easeOut' }}>
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
