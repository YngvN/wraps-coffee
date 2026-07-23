import { AnimatePresence, motion } from 'framer-motion'
import { useId, useState, type ReactNode } from 'react'
import { ChevronRightIcon } from './ChevronRightIcon'
import './CollapsibleSection.scss'

interface CollapsibleSectionProps {
  label: string
  /** Shown under the header row, both collapsed and open, so a section's own relevance is clear before expanding it. */
  hint?: string
  /** Whether the section starts expanded. Falls back to `false`, matching a Figma/XD sidebar's own collapsed-by-default property groups. */
  defaultOpen?: boolean
  children: ReactNode
  className?: string
}

/**
 * A collapsed-by-default settings group, styled as a flat row (no bordered
 * box) with a chevron that rotates open — the Figma/XD-sidebar-style
 * replacement for a settings panel's always-expanded boxed sections. Reuses
 * `AnimatedDetails`'s own height-animation technique (`framer-motion`
 * measuring to/from `height: 'auto'`, since a plain CSS transition can't
 * animate to an unknown height) rather than a native `<details>`, which
 * snaps open/closed instantly. Uncontrolled — each section owns its own
 * open/closed state, resetting to `defaultOpen` whenever it remounts (e.g. a
 * newly opened pane's own panel).
 */
export function CollapsibleSection({ label, hint, defaultOpen = false, children, className }: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen)
  const contentId = useId()

  return (
    <div className={`collapsible-section${className ? ` ${className}` : ''}`} data-open={open}>
      <button type="button" className="collapsible-section__header" aria-expanded={open} aria-controls={contentId} onClick={() => setOpen((current) => !current)}>
        <span className="collapsible-section__label">{label}</span>
        <span className="collapsible-section__chevron" aria-hidden="true">
          <ChevronRightIcon />
        </span>
      </button>
      {hint && <p className="collapsible-section__hint">{hint}</p>}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={contentId}
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            style={{ overflow: 'hidden' }}
          >
            <div className="collapsible-section__body">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
