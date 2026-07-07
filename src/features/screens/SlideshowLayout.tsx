import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { useLanguage } from '../../i18n'
import type { ScreenConfig, ScreenSlotContent, TextSizes } from '../../types/screen'
import { flattenScreenSlots } from '../../utils/screenSlots'
import { textSizesToCssVars } from '../../utils/textSizeVars'
import { SlotContent } from './SlotContent'
import { SlotEditButton } from './SlotEditButton'
import { SCREEN_TRANSITIONS } from './transitions'
import './SlideshowLayout.scss'

interface SlideshowLayoutProps {
  screen: ScreenConfig
  /** Resolves the effective (persisted, its own override, or live-drafted while being edited) text sizes for a given slide. */
  resolveTextSizes: (slotIndex: number, contentIndex: number, content: ScreenSlotContent) => TextSizes
  /** Called when the currently visible slide's hover-revealed edit button is clicked, with its slot's original index (0-3) and its own index within that slot's `contents`. */
  onEditSlide: (slotIndex: number, contentIndex: number) => void
  /** Pauses the rotation timer — set while this slide (or the whole screen) is being edited, so the preview isn't pulled out from under the editor. */
  paused: boolean
}

/**
 * Rotates a screen's slides one at a time, fullscreen, with an animated
 * transition between them. Every slot contributes its slide(s) to one
 * flattened, screen-wide rotation (a slideshow-enabled slot contributes all
 * of its own slides in order; others contribute their one slide) — so a
 * slot with multiple slides doesn't get its own nested rotation, it's just
 * more entries in the same sequence. Render with `key={screen.screenID}` so
 * switching to a different screen remounts (and resets) this component
 * rather than needing an effect to reset `activeIndex`. Hovering the visible
 * slide reveals a small button to edit its own text sizes.
 */
export function SlideshowLayout({ screen, resolveTextSizes, onEditSlide, paused }: SlideshowLayoutProps) {
  const { t } = useLanguage()
  const reducedMotion = useReducedMotion()
  const activeEntries = flattenScreenSlots(screen.slots)
  const [activeIndex, setActiveIndex] = useState(0)

  useEffect(() => {
    if (paused || activeEntries.length < 2) return

    const timer = setInterval(() => {
      setActiveIndex((current) => (current + 1) % activeEntries.length)
    }, screen.slideDurationSeconds * 1000)

    return () => clearInterval(timer)
  }, [screen.slideDurationSeconds, activeEntries.length, paused])

  if (activeEntries.length === 0) {
    return (
      <div className="slideshow-layout slideshow-layout--empty">
        <p>{t('screenDisplay.emptyLabel')}</p>
      </div>
    )
  }

  const variants = SCREEN_TRANSITIONS[screen.transitionStyle]
  const transition = reducedMotion ? { duration: 0 } : { duration: 0.6, ease: 'easeInOut' as const }
  const current = activeEntries[activeIndex]

  return (
    <div className="slideshow-layout">
      <AnimatePresence mode="wait">
        <motion.div
          key={activeIndex}
          className="slideshow-layout__slide"
          style={textSizesToCssVars(resolveTextSizes(current.slotIndex, current.contentIndex, current.content))}
          variants={variants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={transition}
        >
          <SlotContent slot={current.content} />
          <SlotEditButton onClick={() => onEditSlide(current.slotIndex, current.contentIndex)} />
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
