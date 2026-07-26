import { AnimatePresence, motion } from 'framer-motion'
import type { KeyboardEvent, ReactNode } from 'react'

interface AnimatedDetailsProps {
  open: boolean
  onToggle: () => void
  summary: ReactNode
  children: ReactNode
  className?: string
  summaryClassName?: string
  bodyClassName?: string
}

/**
 * A `<details>`-like collapsible section, but with a sliding height
 * animation on open/close — native `<details>` snaps instantly, and a plain
 * CSS `transition` can't animate to/from `height: auto` (its real height
 * isn't known ahead of time). Built on `framer-motion` (already a
 * dependency, see `SlideTransition.tsx`), which measures the content's own
 * height and animates to/from it. Every sibling below a section that
 * expands/collapses slides down/up smoothly along with it, since this
 * shrinks/grows in normal document flow rather than overlapping anything.
 *
 * Not an actual `<button>` around `summary` (some callers, like the
 * Integrations page's own submenus, nest a real interactive control — the
 * `ActivationToggle` checkbox — inside the header, and a focusable control
 * inside a `<button>` is invalid HTML/a11y-hostile) — a `role="button"` div
 * instead, with the same click/Enter/Space activation a real button gets.
 */
export function AnimatedDetails({ open, onToggle, summary, children, className, summaryClassName, bodyClassName }: AnimatedDetailsProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    onToggle()
  }

  return (
    <div className={className} data-open={open}>
      <div className={summaryClassName} role="button" tabIndex={0} onClick={onToggle} onKeyDown={handleKeyDown}>
        {summary}
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div key="content" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25, ease: 'easeInOut' }} style={{ overflow: 'hidden' }}>
            <div className={bodyClassName}>{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
