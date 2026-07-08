import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { useLanguage } from '../../i18n'
import type { ScreenConfig, ScreenSlot, ScreenSlotContent, TextSizes } from '../../types/screen'
import { backgroundImageTextStyle, slotBackgroundColorStyle } from '../../utils/screenColors'
import { crossHandle, imageResizeRatioPatch, paneDefaultSlideDirection, screenDividers, splitGridTemplate, type RatioPatch } from '../../utils/screenLayout'
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
 * of just the two on either side of one line. A pane whose own
 * currently-showing slide is an image with `resizeToFit` on temporarily
 * overrides whichever ratio field(s) govern its own axes (see
 * `imageResizeRatioPatch`) to fit that image, capped at 40% of the
 * viewport along either — live-visual only, never persisted, so a
 * slideshow rotating away from it (or the slide simply changing) drops
 * the override and the pane slides back to its own set size on its own,
 * the same transition a manual resize already animates with.
 */
export function SplitLayout({ screen, resolveTextSizes, onEditSlide, paused, forcedSlide, onResizeDivider }: SplitLayoutProps) {
  const { t } = useLanguage()
  const reducedMotion = useReducedMotion()
  const [tick, setTick] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  /** A divider's own value while it's actively being dragged — overrides the persisted screen's own for live visual feedback, cleared again once the drag commits. */
  const [liveRatios, setLiveRatios] = useState<RatioPatch>({})
  /** The container's own measured pixel size — stands in for the viewport (this arrangement always fills it entirely), needed to turn a `resizeToFit` image's natural size into a percentage ratio. */
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })
  /** Natural (unscaled) pixel dimensions of every `resizeToFit` image seen so far this session, keyed by its own URL — populated by the preload effect below, since neither `SlotContent` nor this component otherwise has any reason to know an image's real size. */
  const [imageNaturalSizes, setImageNaturalSizes] = useState<Record<string, { width: number; height: number }>>({})
  /** Guards the preload effect against re-requesting a URL it's already asked the browser to load, without needing `imageNaturalSizes` itself (still async at that point) in its dependency array. */
  const requestedImagesRef = useRef<Set<string>>(new Set())
  /** Which panes had an active `resizeToFit` override as of the *previous* render — kept in sync with a guarded update during render itself (React's own documented pattern for tracking a previous value, since refs can't be read during render), so this render can tell whether a pane just lost one (and so needs its own shrink held off, not just its content's crossfade) rather than gained or kept one. */
  const [previouslyResizedPanes, setPreviouslyResizedPanes] = useState<Set<number>>(new Set())
  /** Whether *this* render is the one where some pane just lost its `resizeToFit` override — stored as its own state (rather than re-derived from `previouslyResizedPanes` on every render) because a guarded render-phase update to `previouslyResizedPanes` already resolves to its *new* value by the time React re-renders to commit, which would make a same-render re-derivation always see "no change". Reset back to `false` a beat later (see the effect below) so a later, unrelated resize doesn't inherit a stale delay. */
  const [isShrinkingAwayFromImage, setIsShrinkingAwayFromImage] = useState(false)
  const transition = reducedMotion ? { duration: 0 } : { duration: 0.6, ease: 'easeInOut' as const }
  const visibleSlots = screen.slots.slice(0, screen.slotCount)
  const direction = screen.splitDirection ?? 'row'
  const bigPosition = screen.splitBigPosition ?? 'first'

  const hasRotatingSlot = visibleSlots.some((slot) => slot.isSlideshow && slot.contents.filter((c) => c.kind !== 'none').length > 1)

  useEffect(() => {
    if (paused || !hasRotatingSlot) return

    const timer = setInterval(() => setTick((current) => current + 1), screen.slideDurationSeconds * 1000)
    return () => clearInterval(timer)
  }, [hasRotatingSlot, screen.slideDurationSeconds, paused])

  useEffect(() => {
    const node = containerRef.current
    if (!node) return
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setContainerSize({ width: entry.contentRect.width, height: entry.contentRect.height })
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [screen.slotCount])

  /** Which slide (by index within its slot's own `contents`) a pane is currently showing — its forced slide while that exact pane's editor has one open, else wherever its own rotation (or lack of one) has it. */
  const resolvePaneContent = (slot: ScreenSlot, index: number): { content: ScreenSlotContent; contentIndex: number } => {
    const isForced = forcedSlide?.slotIndex === index
    const contentIndex = isForced ? forcedSlide.contentIndex : currentSlotContentIndex(slot, tick)
    const content = isForced ? (slot.contents[contentIndex] ?? { kind: 'none' as const }) : currentSlotContent(slot, tick)
    return { content, contentIndex }
  }

  const isResizingImage = (content: ScreenSlotContent): content is Extract<ScreenSlotContent, { kind: 'image' }> =>
    content.kind === 'image' && Boolean(content.resizeToFit) && Boolean(content.imageUrl)

  const activeResizeImageUrls = visibleSlots
    .map((slot, index) => resolvePaneContent(slot, index).content)
    .filter(isResizingImage)
    .map((content) => content.imageUrl)

  useEffect(() => {
    activeResizeImageUrls.forEach((url) => {
      if (requestedImagesRef.current.has(url)) return
      requestedImagesRef.current.add(url)
      const img = new Image()
      img.onload = () => setImageNaturalSizes((current) => ({ ...current, [url]: { width: img.naturalWidth, height: img.naturalHeight } }))
      img.src = url
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `activeResizeImageUrls` is a new array every render; this key is its faithful (and stable) serialization.
  }, [activeResizeImageUrls.join('|')])

  const resizedPanesThisRender = new Set<number>()
  const imageResizeOverrides: RatioPatch = visibleSlots.reduce<RatioPatch>((patch, slot, index) => {
    const { content } = resolvePaneContent(slot, index)
    if (!isResizingImage(content)) return patch
    const naturalSize = imageNaturalSizes[content.imageUrl]
    if (!naturalSize) return patch
    resizedPanesThisRender.add(index)
    return { ...patch, ...imageResizeRatioPatch(screen, index, naturalSize.width, naturalSize.height, containerSize.width, containerSize.height) }
  }, {})

  // A pane that just stopped showing a `resizeToFit` image (it had one as of
  // the previous render, not this one) needs its own *shrink* held off until
  // its outgoing slide has actually finished crossfading out — otherwise the
  // pane collapses around the image while it's still visible mid-fade,
  // squeezing it, since that crossfade (`transition` below) is a separate,
  // ongoing animation `AnimatePresence` runs independently of this render.
  // Growing (or switching between two differently-sized images) has no such
  // problem — the incoming slide doesn't even start fading in (`mode="wait"`)
  // until the outgoing one is already gone — so only a shrink gets delayed.
  // Computed and stored (`setIsShrinkingAwayFromImage`) right here, during
  // this same render, rather than read back from `previouslyResizedPanes`
  // afterward — that comparison has to happen before `previouslyResizedPanes`
  // itself is updated below, since React re-renders synchronously once more
  // before committing, and by then the comparison would already see the two
  // sides as equal.
  const resizedPanesChanged = previouslyResizedPanes.size !== resizedPanesThisRender.size || [...resizedPanesThisRender].some((index) => !previouslyResizedPanes.has(index))
  if (resizedPanesChanged) {
    setIsShrinkingAwayFromImage([...previouslyResizedPanes].some((index) => !resizedPanesThisRender.has(index)))
    setPreviouslyResizedPanes(resizedPanesThisRender)
  }

  useEffect(() => {
    if (!isShrinkingAwayFromImage) return
    const timer = setTimeout(() => setIsShrinkingAwayFromImage(false), transition.duration * 1000)
    return () => clearTimeout(timer)
  }, [isShrinkingAwayFromImage, transition.duration])

  if (!visibleSlots.some(isSlotActive)) {
    return (
      <div className="split-layout split-layout--empty">
        <p>{t('screenDisplay.emptyLabel')}</p>
      </div>
    )
  }

  const borderModifier = screen.showSlotBorders === false ? ' split-layout--no-borders' : ''

  const layoutScreen = { ...screen, ...imageResizeOverrides, ...liveRatios }
  const paneVariants = (slotIndex: number) => resolveTransitionVariants(screen.transitionStyle, paneDefaultSlideDirection(screen, slotIndex))
  // A non-empty `liveRatios` means a divider's actively being dragged right
  // here — that needs to track the pointer instantly, with no transition
  // lag. Any other ratio change (the admin dashboard's own arrow-nudge
  // "Resize" panel, live-synced in from another tab, or a `resizeToFit`
  // image's own pane growing/shrinking to fit it) has no such live pointer
  // to keep up with, so it gets a CSS transition instead, sliding the
  // divider into its new position rather than snapping there — delayed
  // until the crossfade finishes for a shrink (see `isShrinkingAwayFromImage`).
  const isDragging = Object.keys(liveRatios).length > 0
  const gridDelay = isShrinkingAwayFromImage ? transition.duration : 0
  const gridTemplate = {
    ...splitGridTemplate(layoutScreen),
    ...(!isDragging && !reducedMotion ? { transition: `grid-template-columns 0.5s ease ${gridDelay}s, grid-template-rows 0.5s ease ${gridDelay}s` } : {}),
  }
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
    const { content, contentIndex } = resolvePaneContent(slot, index)
    const motionKey = forcedSlide?.slotIndex === index ? contentIndex : currentSlotSubIndex(slot, tick)
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
            variants={paneVariants(index)}
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
