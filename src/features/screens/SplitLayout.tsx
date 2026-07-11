import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useEffect, useRef, useState, type DragEvent } from 'react'
import { useLanguage } from '../../i18n'
import type { RatioField, ScreenConfig, ScreenSlot, ScreenSlotContent, TextSizes } from '../../types/screen'
import { backgroundImageTextStyle, slotBackgroundColorStyle } from '../../utils/screenColors'
import { pickImageVariant } from '../../utils/responsiveImage'
import {
  applyRatioOverrides,
  CENTER_RATIO,
  crossHandle,
  imageResizeRatioPatch,
  imageResizeScaleFromDrag,
  paneDefaultSlideDirection,
  paneResizableAxes,
  screenDividers,
  splitGridTemplate,
  type PaneResizableAxes,
  type RatioPatch,
} from '../../utils/screenLayout'
import { isResizeToFitImage, resolveContentBackgroundImage } from '../../utils/screenSlots'
import { isSlotActive, resolveSlotBackgroundColor, resolveSlotBackgroundImage, resolvedCheckpointStage, resolveSlotContent, writeStageCheckpoint } from '../../utils/screenStages'
import { textSizesToCssVars } from '../../utils/textSizeVars'
import { SlotContent } from './SlotContent'
import { SlotEditButton } from './SlotEditButton'
import { SplitLayoutCenterHandle } from './SplitLayoutCenterHandle'
import './SplitLayout.scss'
import { SplitLayoutDivider } from './SplitLayoutDivider'
import { resolveTransitionVariants } from './transitions'

interface SplitLayoutProps {
  screen: ScreenConfig
  /** Resolves the effective (persisted, its own override, or live-drafted while being edited) text sizes for a given slot at a given stage. */
  resolveTextSizes: (slotIndex: number, stage: number, content: ScreenSlotContent) => TextSizes
  /** Called when a pane's hover-revealed edit button is clicked, with that slot's own index (0-3). Omit (along with `onResizeDivider`) to render the panes read-only, with neither edit buttons nor drag handles — e.g. while the screen is locked. */
  onEditSlide?: (slotIndex: number) => void
  /** The current stage (1-indexed), resolved by the caller from its own shared rotation timer. */
  stage: number
  /** Overrides `stage` for every pane at once — e.g. while an admin's slot editor is actively viewing a specific stage, so the whole live display previews exactly that stage instead of its natural rotating one (every slot shares the same stage sequence, so this isn't scoped to just the one pane being edited). */
  forcedStage?: number
  /** Persists a divider's new position once it's been dragged to it. Omit to render the panes without any draggable dividers at all. */
  onResizeDivider?: (patch: Partial<ScreenConfig>) => void
  /** Reports when a divider drag starts and stops — lets the caller (e.g. pausing the shared stage rotation for the duration, see `ScreenDisplay`) react to a drag in progress without needing to track `liveRatios` itself. */
  onDragStateChange?: (isDragging: boolean) => void
  /** Called when an image file is dropped directly onto a pane, with that slot's own index (0-3) and the dropped file — the caller owns uploading it and deciding what to do with the result (see `ScreenDisplay`'s own handler, which sets that slot's content to the uploaded image at `fit: 'cover'`). Omit (like `onEditSlide`/`onResizeDivider`) to disable entirely, e.g. while the screen is locked. */
  onDropImage?: (slotIndex: number, file: File) => void
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
 * but simply never shown). Each slot's content, background color/image, and
 * shared text size are all independently resolved against the shared
 * `stage` (see `src/utils/screenStages.ts`) — an animated transition
 * (`screen.transitionStyle`) plays whenever a pane's own resolved
 * checkpoint actually changes, while every pane's position stays fixed.
 * Hovering any pane reveals a small button opening that slot's editor.
 * Every arrangement with more than one slot also gets one draggable divider
 * per split (see `screenDividers`), sized from the screen's own adjustable
 * ratio fields — dragging one live-resizes its two neighboring panes and
 * persists on release, mirroring the admin dashboard's own arrow-nudge
 * "Resize" panel for the same fields. A 3- or 4-slot arrangement's two
 * dividers also get a combined handle right where they meet (a clean
 * crosspoint for 4 slots, a T-junction for 3 — see `crossHandle`) —
 * dragging that moves both together, resizing every pane at once instead
 * of just the two on either side of one line. A pane whose own
 * currently-showing content is an image with `resizeToFit` on temporarily
 * overrides whichever ratio field(s) govern its own axes (see
 * `imageResizeRatioPatch`) to fit that image, capped at 40% of the
 * viewport along either — live-visual only, never persisted, so the stage
 * sequence advancing to different content drops the override and the pane
 * slides back to its own set size on its own, the same transition a manual
 * resize already animates with.
 */
export function SplitLayout({ screen, resolveTextSizes, onEditSlide, stage, forcedStage, onResizeDivider, onDragStateChange, onDropImage }: SplitLayoutProps) {
  const { t } = useLanguage()
  const reducedMotion = useReducedMotion()
  const containerRef = useRef<HTMLDivElement>(null)
  /** Per-pane drag-enter/leave counters (keyed by slot index) — nested elements inside a pane (its content, the edit button) each fire their own enter/leave as the pointer crosses them, so a counter (rather than a boolean) is what keeps the drop overlay from flickering, same technique `ImageUploadField` already uses for its own single dropzone. */
  const dragDepthRef = useRef<Map<number, number>>(new Map())
  /** Panes currently showing the "drop to set image" overlay. */
  const [dragOverPanes, setDragOverPanes] = useState<Set<number>>(new Set())
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
  const effectiveStage = forcedStage ?? stage

  useEffect(() => {
    const node = containerRef.current
    if (!node) return
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setContainerSize({ width: entry.contentRect.width, height: entry.contentRect.height })
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [screen.slotCount])

  /**
   * Each visible pane's own content checkpoint (see `resolvedCheckpointStage`)
   * as of the *previous* render — compared, in `renderPane` below, against
   * this render's own freshly resolved one to tell whether *this* pane's
   * content just actually crossfaded to a new checkpoint (a stage advance
   * reaching one of its own set checkpoints), as opposed to the shared
   * stage simply ticking past one this particular slot doesn't have its own
   * checkpoint at, or an independently live-edited background color
   * arriving with no stage change at all. Only in the first case should
   * this pane's own background/text color visibly wait for that crossfade
   * to finish before easing into its new color, instead of visibly leading
   * it (see `paneColorDelay`). Kept in sync with a guarded render-phase
   * update (React's own documented pattern for tracking a previous value,
   * same technique `previouslyResizedPanes` below already uses) rather than
   * a ref, since this component only reads/writes it during render itself,
   * never from an event handler — a ref wouldn't trigger the re-render
   * `paneColorDelay` needs once the "just changed" render has passed.
   */
  const [previousContentCheckpoints, setPreviousContentCheckpoints] = useState<Record<number, number>>({})
  const contentCheckpointsThisRender: Record<number, number> = {}
  visibleSlots.forEach((slot, index) => {
    contentCheckpointsThisRender[index] = resolvedCheckpointStage(slot.content, effectiveStage) ?? effectiveStage
  })
  const contentCheckpointsChanged = visibleSlots.some((_, index) => contentCheckpointsThisRender[index] !== previousContentCheckpoints[index])
  if (contentCheckpointsChanged) setPreviousContentCheckpoints(contentCheckpointsThisRender)

  /** A pane's content, resolved from its slot's own timeline at the effective stage. */
  const resolvePaneContent = (slot: ScreenSlot): ScreenSlotContent => resolveSlotContent(slot, effectiveStage)

  const activeResizeImageUrls = visibleSlots.map((slot) => resolvePaneContent(slot)).filter(isResizeToFitImage).map((content) => content.imageUrl)

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
    const content = resolvePaneContent(slot)
    if (!isResizeToFitImage(content)) return patch
    const naturalSize = imageNaturalSizes[content.imageUrl]
    if (!naturalSize) return patch
    resizedPanesThisRender.add(index)
    return { ...patch, ...imageResizeRatioPatch(screen, index, naturalSize.width, naturalSize.height, containerSize.width, containerSize.height, content.resizeScale) }
  }, {})

  /** The one pane (there's never more than one active per stage — see `isResizeToFitConflict`) currently fit to a `resizeToFit` image, if any — kept alongside `imageResizeOverrides` so a divider drag touching one of its own axes (see `handleLiveChange`/`handleCommit`) can be redirected into changing the image's own `resizeScale` instead of writing straight to the arrangement's ratio fields, which are recomputed from that scale every render anyway. */
  const resizeImageEntry = visibleSlots.reduce<{ index: number; naturalSize: { width: number; height: number } } | undefined>((found, slot, index) => {
    if (found) return found
    const content = resolvePaneContent(slot)
    if (!isResizeToFitImage(content)) return found
    const naturalSize = imageNaturalSizes[content.imageUrl]
    return naturalSize ? { index, naturalSize } : found
  }, undefined)
  const activeImageResize: { slotIndex: number; axes: PaneResizableAxes; naturalWidth: number; naturalHeight: number } | undefined = resizeImageEntry && {
    slotIndex: resizeImageEntry.index,
    axes: paneResizableAxes(screen, resizeImageEntry.index),
    naturalWidth: resizeImageEntry.naturalSize.width,
    naturalHeight: resizeImageEntry.naturalSize.height,
  }

  // A non-empty `liveRatios` means a divider's actively being dragged right
  // here — computed early (not just where it's otherwise used, further
  // below) so the resize-transition tracking right after can tell a live
  // drag (the pointer is tracked 1:1, with no CSS transition at all — see
  // `gridTransition`) apart from a *programmatic* ratio change (a stage
  // advance, a `resizeToFit` image growing/shrinking, the admin's own
  // arrow-nudge "Resize" panel, or a live sync from another tab), which
  // does animate via a real CSS transition and so is the only case the
  // wrap-suppression below is meant for.
  const isDragging = Object.keys(liveRatios).length > 0
  const isSnappingToCenterWhileDragging = isDragging && Object.values(liveRatios).some((value) => value === CENTER_RATIO)

  // Computed here (not just where it's otherwise used, further below) for
  // the same reason `isDragging` was just moved up — the resize-transition
  // tracking right after needs this render's own resolved grid template to
  // compare against the previous one.
  const layoutScreen: ScreenConfig = { ...screen, ratios: applyRatioOverrides(screen.ratios, effectiveStage, { ...imageResizeOverrides, ...liveRatios }) }
  const gridTemplateBase = splitGridTemplate(layoutScreen, effectiveStage)

  /**
   * Whether a pane-resize CSS transition (as opposed to a live divider
   * drag, which is excluded above) is currently animating — set the instant
   * this render's own resolved grid template differs from the previous
   * one, cleared again once that transition's own duration has elapsed
   * (`transition.duration`, the same value the CSS itself uses). While
   * true, `.split-layout--resizing` (see `SplitLayout.scss`) suppresses
   * word-wrapping on every slide's own heading/title text, so a title
   * doesn't visibly wrap and unwrap through several line counts while its
   * pane is still mid-resize — the moment it settles, normal wrapping (see
   * each slide's own `overflow-wrap: break-word`) fully applies again.
   * Comparing raw template strings (not e.g. `screen.ratios` directly)
   * catches every source of a resize at once, including ones with no
   * dedicated ratio field of their own (`resizeToFit`'s own computed
   * override).
   */
  const [previousGridTemplate, setPreviousGridTemplate] = useState(gridTemplateBase)
  const [isPaneResizing, setIsPaneResizing] = useState(false)
  const gridTemplateChanged =
    !isDragging && (gridTemplateBase.gridTemplateColumns !== previousGridTemplate.gridTemplateColumns || gridTemplateBase.gridTemplateRows !== previousGridTemplate.gridTemplateRows)
  if (gridTemplateChanged) {
    setIsPaneResizing(true)
    setPreviousGridTemplate(gridTemplateBase)
  } else if (gridTemplateBase.gridTemplateColumns !== previousGridTemplate.gridTemplateColumns || gridTemplateBase.gridTemplateRows !== previousGridTemplate.gridTemplateRows) {
    // A live-drag frame — keeps the "previous" snapshot current so a real,
    // CSS-transitioned change right after the drag ends is still detected
    // (comparing against the pointer's own last dragged-to position, not a
    // stale pre-drag one), without itself flagging as a resize transition.
    setPreviousGridTemplate(gridTemplateBase)
  }

  useEffect(() => {
    if (!isPaneResizing) return
    const timer = setTimeout(() => setIsPaneResizing(false), transition.duration * 1000)
    return () => clearTimeout(timer)
  }, [isPaneResizing, transition.duration])

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

  // `layoutScreen` (the live overlay — a divider actively being dragged, or
  // a `resizeToFit` image's own pane-fit — injected as an exact checkpoint
  // at the *effective* stage, in a copy of `screen.ratios`, read-only,
  // never itself persisted) and `isDragging`/`isSnappingToCenterWhileDragging`
  // were both computed earlier, alongside the resize-transition tracking
  // that also needs them — see the comments up there.
  const paneVariants = (slotIndex: number) => resolveTransitionVariants(screen.transitionStyle, paneDefaultSlideDirection(screen, slotIndex))
  const gridDelay = isShrinkingAwayFromImage ? transition.duration : 0
  const dragSnapGlideSeconds = 0.15
  // The divider gap's own color (`--screen-border`, derived from the
  // screen's background — see `getScreenColorVars`) also gets a transition
  // here, in the same inline value, rather than a separate stylesheet rule —
  // an inline `transition` entirely replaces (not merges with) a class's own,
  // so appending it to whichever branch is already active is the only way it
  // wouldn't just get clobbered by the grid-template one above. Left out of
  // the two dragging branches on purpose: those need to stay exactly as
  // untouched as before (instant 1:1 tracking, or only the short snap
  // glide), and a background-color change never actually happens mid-drag
  // anyway.
  const gridTransition = isDragging
    ? isSnappingToCenterWhileDragging && `grid-template-columns ${dragSnapGlideSeconds}s ease, grid-template-rows ${dragSnapGlideSeconds}s ease`
    : `grid-template-columns 0.5s ease ${gridDelay}s, grid-template-rows 0.5s ease ${gridDelay}s, background-color 0.4s ease`
  const gridTemplate = {
    ...gridTemplateBase,
    ...(!reducedMotion && gridTransition ? { transition: gridTransition } : {}),
  }
  const dividers = screenDividers(layoutScreen, effectiveStage)
  const centerHandle = crossHandle(layoutScreen, effectiveStage)

  // A divider drag whose field is one of `activeImageResize`'s own axes is
  // really a drag of that image's own box border — redirected below into a
  // `resizeScale` change (see `imageResizeScaleFromDrag`) instead of writing
  // straight to the arrangement's ratio fields, which `imageResizeOverrides`
  // recomputes from the image's scale every render anyway and would
  // otherwise instantly overwrite back. When the drag touches both of its
  // axes at once (the combined cross handle, on a pane with two resizable
  // axes), each axis's own raw value would independently imply the same
  // scale if the drag were following the image's own aspect ratio exactly —
  // averaging them keeps the box moving smoothly even while the pointer is
  // slightly off that diagonal.
  const imageResizeScaleFromPatch = (patch: RatioPatch): number | undefined => {
    if (!activeImageResize) return undefined
    const { slotIndex, axes, naturalWidth, naturalHeight } = activeImageResize
    const fields = [axes.width?.field, axes.height?.field].filter((field): field is RatioField => field !== undefined)
    const scales = fields
      .filter((field) => patch[field] !== undefined)
      .map((field) => imageResizeScaleFromDrag(screen, slotIndex, field, patch[field]!, naturalWidth, naturalHeight, containerSize.width, containerSize.height))
    if (scales.length === 0) return undefined
    return scales.reduce((sum, value) => sum + value, 0) / scales.length
  }

  const handleLiveChange = (patch: RatioPatch) => {
    // The rising edge of a drag — `liveRatios` was empty before this call,
    // so this is the first live-change since the last commit (or ever).
    if (Object.keys(liveRatios).length === 0) onDragStateChange?.(true)

    const scale = imageResizeScaleFromPatch(patch)
    if (activeImageResize && scale !== undefined) {
      const { slotIndex, naturalWidth, naturalHeight } = activeImageResize
      setLiveRatios((current) => ({ ...current, ...imageResizeRatioPatch(screen, slotIndex, naturalWidth, naturalHeight, containerSize.width, containerSize.height, scale) }))
      return
    }
    setLiveRatios((current) => ({ ...current, ...patch }))
  }

  const handleCommit = (patch: RatioPatch) => {
    const scale = imageResizeScaleFromPatch(patch)
    // The falling edge — only report "drag finished" once every field this
    // component was tracking (not just this one commit's own fields, in
    // case something else is still mid-drag) has been cleared.
    const stillDragging = Object.keys(liveRatios).some((field) => !(field in patch))
    if (!stillDragging) onDragStateChange?.(false)
    setLiveRatios((current) => {
      const next = { ...current }
      for (const field of Object.keys(patch) as (keyof RatioPatch)[]) delete next[field]
      return next
    })
    if (activeImageResize && scale !== undefined) {
      const slot = visibleSlots[activeImageResize.slotIndex]
      const content = resolvePaneContent(slot)
      if (content.kind !== 'image') return
      // Same "only the stage currently being viewed/edited" rule as an
      // arrangement divider's own checkpoint below — forks a fresh content
      // checkpoint at `effectiveStage` (even if this image was itself
      // inherited from an earlier one) carrying the new scale forward from
      // here on, leaving every earlier stage's own size untouched.
      const nextSlots = [...screen.slots] as ScreenConfig['slots']
      nextSlots[activeImageResize.slotIndex] = { ...slot, content: writeStageCheckpoint(slot.content, effectiveStage, { ...content, resizeScale: scale }) }
      onResizeDivider?.({ slots: nextSlots })
      return
    }
    // Checkpoints the dragged-to value at the effective stage — "moving the
    // border" only affects whichever stage is currently being viewed/edited.
    onResizeDivider?.({ ratios: applyRatioOverrides(screen.ratios, effectiveStage, patch) })
  }

  const handlePaneDragEnter = (index: number) => (event: DragEvent<HTMLDivElement>) => {
    if (!onDropImage) return
    event.preventDefault()
    dragDepthRef.current.set(index, (dragDepthRef.current.get(index) ?? 0) + 1)
    setDragOverPanes((current) => new Set(current).add(index))
  }

  const handlePaneDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!onDropImage) return
    event.preventDefault()
  }

  const handlePaneDragLeave = (index: number) => (event: DragEvent<HTMLDivElement>) => {
    if (!onDropImage) return
    event.preventDefault()
    const depth = Math.max(0, (dragDepthRef.current.get(index) ?? 0) - 1)
    dragDepthRef.current.set(index, depth)
    if (depth === 0) {
      setDragOverPanes((current) => {
        const next = new Set(current)
        next.delete(index)
        return next
      })
    }
  }

  const handlePaneDrop = (index: number) => (event: DragEvent<HTMLDivElement>) => {
    if (!onDropImage) return
    event.preventDefault()
    dragDepthRef.current.set(index, 0)
    setDragOverPanes((current) => {
      const next = new Set(current)
      next.delete(index)
      return next
    })
    const file = event.dataTransfer.files[0]
    if (file?.type.startsWith('image/')) onDropImage(index, file)
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
   * Renders one pane: its currently-showing content (animated whenever the
   * slot's own resolved checkpoint actually changes) plus its
   * hover-revealed edit button. The text-size vars are set on the animated
   * inner element itself, not the always-mounted pane div — so advancing
   * to a differently-sized checkpoint only takes effect once its exit
   * animation finishes and the new one actually mounts, instead of
   * resizing the outgoing content mid-fade. The slot's own background
   * color, conversely, is set on the always-mounted pane div itself, not
   * the fading inner one — so only the text/image crossfades; the backdrop
   * color never fades in or out. A background image (the content's own,
   * else its slot's) is its own always-mounted layer (blurred, scaled to
   * cover) behind the content — never the content div's own `background`,
   * since blurring that would blur the text/image drawn on top of it too —
   * but it gets its own `AnimatePresence`, keyed by the image+overlay
   * themselves rather than the resolved checkpoint, so it only crossfades
   * when the effective image (or its overlay) actually changes, instead of
   * re-fading the same backdrop in and out on every stage advance. Its
   * overlay (if any) also forces the text color, overriding whatever the
   * background color alone would have picked, since a photo's own contrast
   * can't be measured the way a flat color's can. Divider borders between
   * panes are drawn once, by the grid container itself (its own background
   * showing through its `gap`), not per-pane — so a slot's own background
   * color here never needs to also carry a border color. The content
   * pane's own `AnimatePresence` key is the *checkpoint's* stage number
   * (see `resolvedCheckpointStage`), not the raw current stage — several
   * consecutive stages can resolve to the same inherited checkpoint, and
   * keying on the raw stage would crossfade every single stage advance
   * even when nothing about this particular slot actually changed. A pane
   * matching `screen.editingFocus` (the admin's editor, possibly running on
   * an entirely different tab/window/device than this display — see
   * `ScreenForm`) flashes white on top of everything else, keyed by its own
   * `pulse` so the flash restarts every time regardless of how fast the
   * admin switches slots; `'global'` flashes every pane at once.
   */
  const renderPane = (slot: ScreenSlot, index: number, extraClassName = '') => {
    const content = resolvePaneContent(slot)
    const checkpointStage = resolvedCheckpointStage(slot.content, effectiveStage) ?? effectiveStage
    const backgroundColor = resolveSlotBackgroundColor(slot, effectiveStage)
    const slotBackgroundImage = resolveSlotBackgroundImage(slot, effectiveStage)
    const backgroundImage = resolveContentBackgroundImage(content, slotBackgroundImage)
    // Only delays this pane's own background/text color transition (rather
    // than starting it immediately, alongside a live-edited color change)
    // when its *own* content checkpoint just changed this render — i.e. a
    // stage advance actually reached one of its own set checkpoints, so its
    // outgoing content is mid-crossfade and shouldn't have its color pulled
    // out from under it before that finishes.
    const contentJustChanged = previousContentCheckpoints[index] !== undefined && previousContentCheckpoints[index] !== checkpointStage
    const paneColorDelay = contentJustChanged ? transition.duration : 0
    const paneStyle = {
      ...slotBackgroundColorStyle(backgroundColor),
      ...backgroundImageTextStyle(backgroundImage?.overlay),
      ...(!reducedMotion ? { transition: `background-color 0.4s ease ${paneColorDelay}s, color 0.4s ease ${paneColorDelay}s` } : {}),
    }
    return (
      <div
        className={`split-layout__pane${extraClassName}`}
        key={index}
        style={paneStyle}
        onDragEnter={handlePaneDragEnter(index)}
        onDragOver={handlePaneDragOver}
        onDragLeave={handlePaneDragLeave(index)}
        onDrop={handlePaneDrop(index)}
      >
        {dragOverPanes.has(index) && (
          <div className="split-layout__pane-drop-overlay">
            <p>{t('screenDisplay.dropImageHint')}</p>
          </div>
        )}
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
              <div className="split-layout__pane-bg-image" style={{ backgroundImage: `url(${pickImageVariant(backgroundImage.imageUrl)})` }} />
              {backgroundImage.overlay !== 'none' && <div className={`split-layout__pane-bg-overlay split-layout__pane-bg-overlay--${backgroundImage.overlay}`} />}
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence mode="wait">
          <motion.div
            key={checkpointStage}
            className="split-layout__pane-content"
            style={textSizesToCssVars(resolveTextSizes(index, effectiveStage, content))}
            variants={paneVariants(index)}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={transition}
          >
            <SlotContent slot={content} />
          </motion.div>
        </AnimatePresence>
        {onEditSlide && <SlotEditButton onClick={() => onEditSlide(index)} />}
        {screen.editingFocus && (screen.editingFocus.tab === 'global' || screen.editingFocus.tab === index) && (
          <motion.div
            key={screen.editingFocus.pulse}
            className="split-layout__pane-pulse"
            initial={{ opacity: 0.55 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          />
        )}
      </div>
    )
  }

  if (screen.slotCount === 1) {
    return <div className={`split-layout split-layout--single${borderModifier}`}>{renderPane(visibleSlots[0], 0)}</div>
  }

  if (screen.slotCount === 3) {
    return (
      <div ref={containerRef} className={`split-layout split-layout--triple-${direction}-${bigPosition}${borderModifier}${isPaneResizing ? ' split-layout--resizing' : ''}`} style={gridTemplate}>
        {renderPane(visibleSlots[0], 0, ' split-layout__pane--big')}
        {renderPane(visibleSlots[1], 1, ' split-layout__pane--small1')}
        {renderPane(visibleSlots[2], 2, ' split-layout__pane--small2')}
        {renderDividers()}
      </div>
    )
  }

  return (
    <div ref={containerRef} className={`split-layout split-layout--${screen.slotCount === 4 ? 'quad' : direction}${borderModifier}${isPaneResizing ? ' split-layout--resizing' : ''}`} style={gridTemplate}>
      {visibleSlots.map((slot, index) => renderPane(slot, index))}
      {renderDividers()}
    </div>
  )
}
