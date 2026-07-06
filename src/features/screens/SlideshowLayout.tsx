import { AnimatePresence, motion, useReducedMotion, type Variants } from 'framer-motion'
import { useEffect, useState } from 'react'
import { useLanguage } from '../../i18n'
import type { ScreenConfig, ScreenTransitionStyle } from '../../types/screen'
import { SlotContent } from './SlotContent'
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
}

/**
 * Rotates a screen's active (non-"none") slots one at a time, fullscreen,
 * with an animated transition between them. Render with `key={screen.screenID}`
 * so switching to a different screen remounts (and resets) this component
 * rather than needing an effect to reset `activeIndex`.
 */
export function SlideshowLayout({ screen }: SlideshowLayoutProps) {
  const { t } = useLanguage()
  const reducedMotion = useReducedMotion()
  const activeSlots = screen.slots.filter((slot) => slot.kind !== 'none')
  const [activeIndex, setActiveIndex] = useState(0)

  useEffect(() => {
    if (activeSlots.length < 2) return

    const timer = setInterval(() => {
      setActiveIndex((current) => (current + 1) % activeSlots.length)
    }, screen.slideDurationSeconds * 1000)

    return () => clearInterval(timer)
  }, [screen.slideDurationSeconds, activeSlots.length])

  if (activeSlots.length === 0) {
    return (
      <div className="slideshow-layout slideshow-layout--empty">
        <p>{t('screenDisplay.emptyLabel')}</p>
      </div>
    )
  }

  const variants = TRANSITIONS[screen.transitionStyle]
  const transition = reducedMotion ? { duration: 0 } : { duration: 0.6, ease: 'easeInOut' as const }

  return (
    <div className="slideshow-layout">
      <AnimatePresence mode="wait">
        <motion.div key={activeIndex} className="slideshow-layout__slide" variants={variants} initial="initial" animate="animate" exit="exit" transition={transition}>
          <SlotContent slot={activeSlots[activeIndex]} />
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
