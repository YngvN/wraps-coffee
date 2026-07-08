import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { useLanguage } from '../../i18n'
import type { ScreenConfig, ScreenSlot, ScreenSlotContent, TextSizes } from '../../types/screen'
import { backgroundImageTextStyle, slotBackgroundColorStyle } from '../../utils/screenColors'
import { crossHandle, screenDividers, splitGridTemplate, type RatioPatch } from '../../utils/screenLayout'
import { currentSlotContent, currentSlotContentIndex, currentSlotSubIndex, isSlotActive, resolveContentBackgroundImage } from '../../utils/screenSlots'
import { textSizesToCssVars } from '../../utils/textSizeVars'
import { SlotContent } from './SlotContent'
import { SlotEditButton } from './SlotEditButton'
import { SplitLayoutCenterHandle } from './SplitLayoutCenterHandle'
import './SplitLayout.scss'
import { SplitLayoutDivider } from './SplitLayoutDivider'
import { resolveTransitionVariants } from './transitions'

interface SplitLayoutProps {
  screen: ScreenConfig
  /** Resolves the effective (persisted, its own override, or live-drafted while being edited) text sizes for a given slide. */
  resolveTextSizes: (slotIndex: number, contentIndex: number, content: ScreenSlotContent) => TextSizes
  /** Called when a pane's hover-revealed edit button is clicked, with that slot's original index (0-3) and its currently-showing slide's own index within that slot's `contents`. Omit (along with `onResizeDivider`) to render the panes read-only, with neither edit buttons nor drag handles — e.g. while the screen is locked. */
  onEditSlide?: (slotIndex: number, contentIndex: number) => void
  /** Pauses every rotating slot's timer — set while a slide (or the whole screen) is being edited, so the preview isn't pulled out from under the editor. */
  paused: boolean
  /** While a specific slide's own tab is active in its slot's editor, forces that one pane to show that exact slide (by its `contents` index) instead of whatever its rotation happened to freeze on — so switching between a slot's own slide tabs previews each one, live, right where it'll actually appear. */
  forcedSlide?: { slotIndex: number; contentIndex: number }
  /** Persists a divider's new position once it's been dragged to it. Omit to render the panes without any draggable dividers at all. */
  onResizeDivider?: (patch: Partial<ScreenConfig>) => void
}

/**
 * Shows a screen's first `slotCount` slots at once, in fixed positions, with
 * no rotation between panes. Handles slotCount 1-4: 1 fills the screen; 2
 * split side by side or stacked per `splitDirection`; 3 feature Slot 1 in a
 * full row/column with the other two sharing the rest as small squares, per
 * `splitDirection` + `splitBigPosition`; 4 form an even 2x2 grid. Which
 * slots are shown is purely a `slotCount` decision, independent of whether
 * each one has its own content configured yet — an in-range slot with
 * nothing set just renders blank in its position, rather than being skipped
 * over (unlike a slot beyond `slotCount`, whose content/settings are kept
 * but simply never shown). A slot whose own `isSlideshow` is set still
 * rotates through its own slides in place, on a shared timer
 * (`screen.slideDurationSeconds`) with an animated transition
 * (`screen.transitionStyle`) between them, while every pane's position
 * stays fixed. Hovering any pane reveals a small button opening that slot's
 * editor (content, slideshow, color, and — where applicable — text size).
 * Every arrangement with more than one slot also gets one draggable divider
 * per split (see `screenDividers`), sized from the screen's own adjustable
 * ratio fields — dragging one live-resizes its two neighboring panes and
 * persists on release, mirroring the admin dashboard's own arrow-nudge
 * "Resize" panel for the same fields. A 3- or 4-slot arrangement's two
 * dividers also get a combined handle right where they meet (a clean
 * crosspoint for 4 slots, a T-junction for 3 — see `crossHandle`) —
 * dragging that moves both together, resizing every pane at once instead
 * of just the two on either side of one line.
 */
export function SplitLayout({ screen, resolveTextSizes, onEditSlide, paused, forcedSlide, onResizeDivider }: SplitLayoutProps) {
  const { t } = useLanguage()
  const reducedMotion = useReducedMotion()
  const [tick, setTick] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  /** A divider's own value while it's actively being dragged — overrides the persisted screen's own for live visual feedback, cleared again once the drag commits. */
  const [liveRatios, setLiveRatios] = useState<RatioPatch>({})
  const visibleSlots = screen.slots.slice(0, screen.slotCount)
  const direction = screen.splitDirection ?? 'row'
  const bigPosition = screen.splitBigPosition ?? 'first'

  const hasRotatingSlot = visibleSlots.some((slot) => slot.isSlideshow && slot.contents.filter((c) => c.kind !== 'none').length > 1)

  useEffect(() => {
    if (paused || !hasRotatingSlot) return

    const timer = setInterval(() => setTick((current) => current + 1), screen.slideDurationSeconds * 1000)
    return () => clearInterval(timer)
  }, [hasRotatingSlot, screen.slideDurationSeconds, paused])

  if (!visibleSlots.some(isSlotActive)) {
    return (
      <div className="split-layout split-layout--empty">
        <p>{t('screenDisplay.emptyLabel')}</p>
      </div>
    )
  }

  const borderModifier = screen.showSlotBorders === false ? ' split-layout--no-borders' : ''
  const variants = resolveTransitionVariants(screen.transitionStyle, screen.slideTransitionDirection ?? 'right')
  const transition = reducedMotion ? { duration: 0 } : { duration: 0.6, ease: 'easeInOut' as const }

  const layoutScreen = { ...screen, ...liveRatios }
  const gridTemplate = splitGridTemplate(layoutScreen)
  const dividers = screenDividers(layoutScreen)
  const centerHandle = crossHandle(layoutScreen)

  const handleLiveChange = (patch: RatioPatch) => setLiveRatios((current) => ({ ...current, ...patch }))
  const handleCommit = (patch: RatioPatch) => {
    setLiveRatios((current) => {
      const next = { ...current }
      for (const field of Object.keys(patch) as (keyof RatioPatch)[]) delete next[field]
      return next
    })
    onResizeDivider?.(patch)
  }

  const renderDividers = () =>
    onResizeDivider && (
      <>
        {dividers.map((divider) => (
          <SplitLayoutDivider key={divider.field} divider={divider} containerRef={containerRef} onLiveChange={handleLiveChange} onCommit={handleCommit} />
        ))}
        {centerHandle && <SplitLayoutCenterHandle handle={centerHandle} containerRef={containerRef} onLiveChange={handleLiveChange} onCommit={handleCommit} />}
      </>
    )

  /**
   * Renders one pane: its currently-showing slide (animated whenever the
   * slot's own rotation actually changes it) plus its hover-revealed edit
   * button. The text-size vars are set on the animated inner element itself,
   * not the always-mounted pane div — so a rotation to a differently-sized
   * slide only takes effect once its exit animation finishes and the new
   * slide actually mounts, instead of resizing the outgoing slide mid-fade.
   * The slot's own background color, conversely, is set on the always-mounted
   * pane div itself, not the fading inner one — so only the text/image
   * crossfades; the backdrop color never fades in or out. A background image
   * (the slide's own, else its slot's) is its own always-mounted layer
   * (blurred, scaled to cover) behind the content — never the content div's
   * own `background`, since blurring that would blur the text/image drawn on
   * top of it too — but it gets its own `AnimatePresence`, keyed by the
   * image+overlay themselves rather than the slide index, so it only
   * crossfades when the effective image (or its overlay) actually changes
   * between slides, instead of re-fading the same backdrop in and out every
   * rotation. Its overlay (if any) also forces the text color, overriding
   * whatever the background color alone would have picked, since a photo's
   * own contrast can't be measured the way a flat color's can. Divider
   * borders between panes are drawn once, by the grid container itself (its
   * own background showing through its `gap`), not per-pane — so a slot's
   * own background color here never needs to also carry a border color.
   * When `forcedSlide` names this exact pane, its own resolved (raw, not
   * rotation-position) index is used both as the shown content and as the
   * crossfade key instead — so switching a slot's own editor between its
   * slide tabs animates between them here too, live, regardless of where
   * the rotation itself happened to freeze when the editor opened.
   */
  const renderPane = (slot: ScreenSlot, index: number, extraClassName = '') => {
    const isForced = forcedSlide?.slotIndex === index
    const contentIndex = isForced ? forcedSlide.contentIndex : currentSlotContentIndex(slot, tick)
    const content = isForced ? (slot.contents[contentIndex] ?? { kind: 'none' as const }) : currentSlotContent(slot, tick)
    const motionKey = isForced ? contentIndex : currentSlotSubIndex(slot, tick)
    const backgroundImage = resolveContentBackgroundImage(content, slot.backgroundImage)
    const paneStyle = { ...slotBackgroundColorStyle(slot.backgroundColor), ...backgroundImageTextStyle(backgroundImage?.overlay) }
    return (
      <div className={`split-layout__pane${extraClassName}`} key={index} style={paneStyle}>
        <AnimatePresence mode="wait">
          {backgroundImage && (
            <motion.div
              key={`${backgroundImage.imageUrl}|${backgroundImage.overlay}`}
              className="split-layout__pane-bg"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={transition}
            >
              <div className="split-layout__pane-bg-image" style={{ backgroundImage: `url(${backgroundImage.imageUrl})` }} />
              {backgroundImage.overlay !== 'none' && <div className={`split-layout__pane-bg-overlay split-layout__pane-bg-overlay--${backgroundImage.overlay}`} />}
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence mode="wait">
          <motion.div
            key={motionKey}
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
        {onEditSlide && <SlotEditButton onClick={() => onEditSlide(index, contentIndex)} />}
      </div>
    )
  }

  if (screen.slotCount === 1) {
    return <div className={`split-layout split-layout--single${borderModifier}`}>{renderPane(visibleSlots[0], 0)}</div>
  }

  if (screen.slotCount === 3) {
    return (
      <div ref={containerRef} className={`split-layout split-layout--triple-${direction}-${bigPosition}${borderModifier}`} style={gridTemplate}>
        {renderPane(visibleSlots[0], 0, ' split-layout__pane--big')}
        {renderPane(visibleSlots[1], 1, ' split-layout__pane--small1')}
        {renderPane(visibleSlots[2], 2, ' split-layout__pane--small2')}
        {renderDividers()}
      </div>
    )
  }

  return (
    <div ref={containerRef} className={`split-layout split-layout--${screen.slotCount === 4 ? 'quad' : direction}${borderModifier}`} style={gridTemplate}>
      {visibleSlots.map((slot, index) => renderPane(slot, index))}
      {renderDividers()}
    </div>
  )
}
