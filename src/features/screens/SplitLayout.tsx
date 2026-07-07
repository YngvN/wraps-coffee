import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { useLanguage } from '../../i18n'
import type { ScreenConfig, ScreenSlot, ScreenSlotContent, TextSizes } from '../../types/screen'
import { currentSlotContent, currentSlotContentIndex, currentSlotSubIndex, isSlotActive } from '../../utils/screenSlots'
import { textSizesToCssVars } from '../../utils/textSizeVars'
import { SlotContent } from './SlotContent'
import { SlotEditButton } from './SlotEditButton'
import './SplitLayout.scss'
import { SCREEN_TRANSITIONS } from './transitions'

interface SplitLayoutProps {
  screen: ScreenConfig
  /** Resolves the effective (persisted, its own override, or live-drafted while being edited) text sizes for a given slide. */
  resolveTextSizes: (slotIndex: number, contentIndex: number, content: ScreenSlotContent) => TextSizes
  /** Called when a pane's hover-revealed edit button is clicked, with that slot's original index (0-3) and its currently-showing slide's own index within that slot's `contents`. */
  onEditSlide: (slotIndex: number, contentIndex: number) => void
  /** Pauses every rotating slot's timer — set while a slide (or the whole screen) is being edited, so the preview isn't pulled out from under the editor. */
  paused: boolean
}

/**
 * Shows a screen's active slots at once, with no rotation between panes.
 * Handles 0-4 active slots: 1 fills the screen; 2 split side by side or
 * stacked per `splitDirection`; 3 feature the first active slot in a full
 * row/column with the other two sharing the rest as small squares, per
 * `splitDirection` + `splitBigPosition`; 4 form an even 2x2 grid. A slot
 * whose own `isSlideshow` is set still rotates through its own slides in
 * place, on a shared timer (`screen.slideDurationSeconds`) with an animated
 * transition (`screen.transitionStyle`) between them, while every pane's
 * position stays fixed. Hovering any pane reveals a small button to edit
 * that slot's own text sizes.
 */
export function SplitLayout({ screen, resolveTextSizes, onEditSlide, paused }: SplitLayoutProps) {
  const { t } = useLanguage()
  const reducedMotion = useReducedMotion()
  const [tick, setTick] = useState(0)
  const activeEntries = screen.slots.map((slot, index) => ({ slot, index })).filter((entry) => isSlotActive(entry.slot))
  const direction = screen.splitDirection ?? 'row'
  const bigPosition = screen.splitBigPosition ?? 'first'

  const hasRotatingSlot = activeEntries.some(({ slot }) => slot.isSlideshow && slot.contents.filter((c) => c.kind !== 'none').length > 1)

  useEffect(() => {
    if (paused || !hasRotatingSlot) return

    const timer = setInterval(() => setTick((current) => current + 1), screen.slideDurationSeconds * 1000)
    return () => clearInterval(timer)
  }, [hasRotatingSlot, screen.slideDurationSeconds, paused])

  if (activeEntries.length === 0) {
    return (
      <div className="split-layout split-layout--empty">
        <p>{t('screenDisplay.emptyLabel')}</p>
      </div>
    )
  }

  const borderModifier = screen.showSlotBorders === false ? ' split-layout--no-borders' : ''
  const variants = SCREEN_TRANSITIONS[screen.transitionStyle]
  const transition = reducedMotion ? { duration: 0 } : { duration: 0.6, ease: 'easeInOut' as const }

  /**
   * Renders one pane: its currently-showing slide (animated whenever the
   * slot's own rotation actually changes it) plus its hover-revealed edit
   * button. The text-size vars are set on the animated inner element itself,
   * not the always-mounted pane div — so a rotation to a differently-sized
   * slide only takes effect once its exit animation finishes and the new
   * slide actually mounts, instead of resizing the outgoing slide mid-fade.
   */
  const renderPane = (slot: ScreenSlot, index: number, extraClassName = '') => {
    const content = currentSlotContent(slot, tick)
    const contentIndex = currentSlotContentIndex(slot, tick)
    return (
      <div className={`split-layout__pane${extraClassName}`} key={index}>
        <AnimatePresence mode="wait">
          <motion.div
            key={currentSlotSubIndex(slot, tick)}
            className="split-layout__pane-content"
            style={textSizesToCssVars(resolveTextSizes(index, contentIndex, content))}
            variants={variants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={transition}
          >
            <SlotContent slot={content} />
          </motion.div>
        </AnimatePresence>
        <SlotEditButton onClick={() => onEditSlide(index, contentIndex)} />
      </div>
    )
  }

  if (activeEntries.length === 1) {
    const [{ slot, index }] = activeEntries
    return <div className={`split-layout split-layout--single${borderModifier}`}>{renderPane(slot, index)}</div>
  }

  if (activeEntries.length === 3) {
    const [big, small1, small2] = activeEntries
    return (
      <div className={`split-layout split-layout--triple-${direction}-${bigPosition}${borderModifier}`}>
        {renderPane(big.slot, big.index, ' split-layout__pane--big')}
        {renderPane(small1.slot, small1.index, ' split-layout__pane--small1')}
        {renderPane(small2.slot, small2.index, ' split-layout__pane--small2')}
      </div>
    )
  }

  return (
    <div className={`split-layout split-layout--${activeEntries.length === 4 ? 'quad' : direction}${borderModifier}`}>
      {activeEntries.map(({ slot, index }) => renderPane(slot, index))}
    </div>
  )
}
