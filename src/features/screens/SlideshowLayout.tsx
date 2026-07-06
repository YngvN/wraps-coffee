import { AnimatePresence, motion, useReducedMotion, type Variants } from 'framer-motion'
import { useEffect, useState } from 'react'
import { useLanguage } from '../../i18n'
import type { ScreenConfig, ScreenTransitionStyle, TextSizes } from '../../types/screen'
import { textSizesToCssVars } from '../../utils/textSizeVars'
import { SlotContent } from './SlotContent'
import { SlotEditButton } from './SlotEditButton'
import './SlideshowLayout.scss'

/** Animation variants for each supported transition style. Only 'fade' exists today; add new styles here as they're introduced. */
const TRANSITIONS: Record<ScreenTransitionStyle, Variants> = {
  fade: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
  },
}

interface SlideshowLayoutProps {
  screen: ScreenConfig
  /** Resolves the effective (persisted, or live-drafted while being edited) text sizes for the slot at a given original index. */
  resolveSlotTextSizes: (slotIndex: number) => TextSizes
  /** Called when the currently visible slide's hover-revealed edit button is clicked, with that slot's original index (0-3). */
  onEditSlot: (slotIndex: number) => void
}

/**
 * Rotates a screen's active (non-"none") slots one at a time, fullscreen,
 * with an animated transition between them. Render with `key={screen.screenID}`
 * so switching to a different screen remounts (and resets) this component
 * rather than needing an effect to reset `activeIndex`. Hovering the visible
 * slide reveals a small button to edit that slot's own text sizes.
 */
export function SlideshowLayout({ screen, resolveSlotTextSizes, onEditSlot }: SlideshowLayoutProps) {
  const { t } = useLanguage()
  const reducedMotion = useReducedMotion()
  const activeEntries = screen.slots.map((slot, index) => ({ slot, index })).filter((entry) => entry.slot.kind !== 'none')
  const [activeIndex, setActiveIndex] = useState(0)

  useEffect(() => {
    if (activeEntries.length < 2) return

    const timer = setInterval(() => {
      setActiveIndex((current) => (current + 1) % activeEntries.length)
    }, screen.slideDurationSeconds * 1000)

    return () => clearInterval(timer)
  }, [screen.slideDurationSeconds, activeEntries.length])

  if (activeEntries.length === 0) {
    return (
      <div className="slideshow-layout slideshow-layout--empty">
        <p>{t('screenDisplay.emptyLabel')}</p>
      </div>
    )
  }

  const variants = TRANSITIONS[screen.transitionStyle]
  const transition = reducedMotion ? { duration: 0 } : { duration: 0.6, ease: 'easeInOut' as const }
  const current = activeEntries[activeIndex]

  return (
    <div className="slideshow-layout">
      <AnimatePresence mode="wait">
        <motion.div
          key={activeIndex}
          className="slideshow-layout__slide"
          style={textSizesToCssVars(resolveSlotTextSizes(current.index))}
          variants={variants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={transition}
        >
          <SlotContent slot={current.slot} />
          <SlotEditButton onClick={() => onEditSlot(current.index)} />
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
