import { AnimatePresence, motion } from 'framer-motion'
import { useState, type DragEvent } from 'react'
import { useLanguage, type LanguageCode } from '../../i18n'
import type { PaneId, ScreenConfig, ScreenSlot, ScreenSlotContent, SlideTransitionDirection, SplitDirection, TextSizes } from '../../types/screen'
import { backgroundImageTextStyle, slotBackgroundColorStyle } from '../../utils/screenColors'
import type { PaneGrowthOrigin } from '../../utils/paneGrowth'
import { getBlurredBackgroundUrl } from '../../utils/responsiveImage'
import { resolveContentBackgroundImage } from '../../utils/screenSlots'
import { resolvedCheckpointStage, resolveSlotBackgroundColor, resolveSlotBackgroundImage, resolveSlotContent, resolveSlotLanguage } from '../../utils/screenStages'
import { textSizesToCssVars } from '../../utils/textSizeVars'
import { collapsedClipPath, FULL_REVEAL_CLIP_PATH, PANE_GROWTH_DURATION_SECONDS } from './paneGrowthMotion'
import { PaneClearButton } from './PaneClearButton'
import { PaneDeleteButton } from './PaneDeleteButton'
import { PaneEditButton } from './PaneEditButton'
import { PaneLanguageScope } from './PaneLanguageScope'
import { PaneSplitZones } from './PaneSplitZones'
import { SlotContent } from './SlotContent'
import { resolveTransitionVariants } from './transitions'

interface LayoutPaneProps {
  leafId: PaneId
  slot: ScreenSlot
  stage: number
  transitionStyle: ScreenConfig['transitionStyle']
  slideDirection: SlideTransitionDirection
  resolveTextSizes: (leafId: PaneId, stage: number, content: ScreenSlotContent) => TextSizes
  onEditSlide?: (leafId: PaneId) => void
  onDropImage?: (leafId: PaneId, file: File) => void
  defaultPaneLanguage: LanguageCode
  editingFocus: ScreenConfig['editingFocus']
  transitionDuration: number
  reducedMotion: boolean | null
  /** Hovering close to the pane's own middle (either axis) reveals a dead-center "Split" line/label there; clicking splits it 50/50 along that axis — see `PaneSplitZones`. Omit (like `onEditSlide`) to disable, e.g. while the screen is locked. */
  onSplitPane?: (leafId: PaneId, axis: SplitDirection, edge: 'start' | 'end') => void
  /** Threaded straight through to `PaneSplitZones` — see its own prop of the same name. */
  disableSplitOnTouch?: boolean
  /** Hovering the pane reveals a top-left "Clear" button resetting its content back to blank. */
  onClearPane?: (leafId: PaneId) => void
  /** Hovering the pane reveals a top-right delete button — never rendered when `canDelete` is false (this is the tree's only pane). */
  onDeletePane?: (leafId: PaneId) => void
  /** Whether this pane can be deleted at all — false when it's the tree's only leaf, since deleting the last pane would leave nothing. */
  canDelete: boolean
  /** Draws a persistent highlight ring around this pane — see `SplitLayout`'s own doc comment. */
  selected?: boolean
  /** Which of this pane's own edges it should visually grow in from on mount (a real divider, the screen's own edge, or a plain fade — see `resolvePaneGrowthOrigin` in `src/utils/paneGrowth.ts`) — `undefined` renders at full size immediately, which is also always the effective behavior once `reducedMotion` is on (only consulted at React's own true first mount, per `SplitLayout.tsx`'s own doc comment on why this can't be computed in an effect). */
  growEntranceFrom?: PaneGrowthOrigin
}

/**
 * Renders one pane's currently-showing content (animated whenever its own
 * resolved checkpoint actually changes), background, hover-revealed edit
 * button, and `editingFocus` pulse-flash — extracted from the arrangement's
 * own shape entirely, so it's identical regardless of where in the tree
 * this leaf sits. Each instance owns its own drag-over/content-checkpoint
 * tracking as local state (rather than the whole tree bookkeeping it by
 * index), since React already remounts/keeps this component per leaf id.
 */
export function LayoutPane({
  leafId,
  slot,
  stage,
  transitionStyle,
  slideDirection,
  resolveTextSizes,
  onEditSlide,
  onDropImage,
  defaultPaneLanguage,
  editingFocus,
  transitionDuration,
  reducedMotion,
  onSplitPane,
  disableSplitOnTouch,
  onClearPane,
  onDeletePane,
  canDelete,
  selected,
  growEntranceFrom,
}: LayoutPaneProps) {
  const { t } = useLanguage()
  const [dragDepth, setDragDepth] = useState(0)
  const transition = reducedMotion ? { duration: 0 } : { duration: transitionDuration, ease: 'easeInOut' as const }

  /**
   * The `editingFocus.pulse` value already in effect the *first* time this
   * particular pane instance rendered — captured once (a plain `useState`
   * initial value, never updated afterward) so a pane that mounts fresh
   * while already matching the ambient focus (`'global'`, or a
   * newly-split/appeared pane that happens to inherit it) doesn't mistake
   * "I just mounted" for "I was just clicked." Without this, `initial`
   * always applies at a component's true first mount regardless of *why*
   * it mounted, so every newly-appeared pane matching `'global'` would
   * flash white the instant it grows in — very visible now that panes
   * animate in smoothly instead of popping in. Only a pulse value that's
   * genuinely *different* from this one — a real subsequent focus change —
   * plays the flash.
   */
  const [pulseAtMount] = useState(editingFocus?.pulse)

  const growthClipPath = growEntranceFrom && growEntranceFrom.kind !== 'fade' ? collapsedClipPath(growEntranceFrom.edge) : FULL_REVEAL_CLIP_PATH
  const growthInitial = growEntranceFrom && !reducedMotion ? { clipPath: growthClipPath, opacity: growEntranceFrom.kind === 'fade' ? 0 : 1 } : { clipPath: FULL_REVEAL_CLIP_PATH, opacity: 1 }
  const growthTransition = { duration: growEntranceFrom && !reducedMotion ? PANE_GROWTH_DURATION_SECONDS : 0, ease: 'easeInOut' as const }

  const content = resolveSlotContent(slot, stage)
  const checkpointStage = resolvedCheckpointStage(slot.content, stage) ?? stage
  const backgroundColor = resolveSlotBackgroundColor(slot, stage)
  const slotBackgroundImage = resolveSlotBackgroundImage(slot, stage)
  const backgroundImage = resolveContentBackgroundImage(content, slotBackgroundImage)
  const language = resolveSlotLanguage(slot, stage) ?? defaultPaneLanguage
  const paneStyle = {
    ...slotBackgroundColorStyle(backgroundColor),
    ...backgroundImageTextStyle(backgroundImage?.overlay),
    ...(!reducedMotion ? { transition: 'background-color 0.4s ease, color 0.4s ease' } : {}),
  }
  const variants = resolveTransitionVariants(transitionStyle, slideDirection)

  const handleDragEnter = (event: DragEvent<HTMLDivElement>) => {
    if (!onDropImage) return
    event.preventDefault()
    setDragDepth((depth) => depth + 1)
  }
  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!onDropImage) return
    event.preventDefault()
  }
  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    if (!onDropImage) return
    event.preventDefault()
    setDragDepth((depth) => Math.max(0, depth - 1))
  }
  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    if (!onDropImage) return
    event.preventDefault()
    setDragDepth(0)
    const file = event.dataTransfer.files[0]
    if (file?.type.startsWith('image/')) onDropImage(leafId, file)
  }

  return (
    <motion.div
      className={`split-layout__pane${selected ? ' split-layout__pane--selected' : ''}`}
      style={paneStyle}
      initial={growthInitial}
      animate={{ clipPath: FULL_REVEAL_CLIP_PATH, opacity: 1 }}
      transition={growthTransition}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {dragDepth > 0 && (
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
            <div className="split-layout__pane-bg-image" style={{ backgroundImage: `url(${getBlurredBackgroundUrl(backgroundImage.imageUrl)})` }} />
            {backgroundImage.overlay !== 'none' && <div className={`split-layout__pane-bg-overlay split-layout__pane-bg-overlay--${backgroundImage.overlay}`} />}
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence mode="wait">
        <motion.div
          key={checkpointStage}
          className="split-layout__pane-content"
          style={textSizesToCssVars(resolveTextSizes(leafId, stage, content))}
          variants={variants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={transition}
        >
          <PaneLanguageScope language={language}>
            <SlotContent slot={content} />
          </PaneLanguageScope>
        </motion.div>
      </AnimatePresence>
      {/*
        Layering (low to high, see each component's own z-index): pane
        content < `PaneEditButton` (z-index 5, full-pane click target) <
        `PaneSplitZones` (z-index 6, only its own narrow middle-line-hugging
        strips are real click targets — dead center stays click-through to
        the edit button beneath) < the corner `PaneClearButton`/`PaneDeleteButton`
        (z-index 7, win over both the edit button and the split zones in
        their own corners) < `SplitLayoutDivider` (z-index 8, always
        grabbable) < the `editingFocus` pulse-flash below (z-index 9,
        `pointer-events: none`, so it never blocks any of the above).
      */}
      {onEditSlide && <PaneEditButton onClick={() => onEditSlide(leafId)} />}
      {onSplitPane && <PaneSplitZones onSplit={(axis, edge) => onSplitPane(leafId, axis, edge)} disableOnTouch={disableSplitOnTouch} />}
      {onClearPane && <PaneClearButton onClick={() => onClearPane(leafId)} />}
      {onDeletePane && canDelete && <PaneDeleteButton onClick={() => onDeletePane(leafId)} />}
      {editingFocus && (editingFocus.tab === 'global' || editingFocus.tab === leafId) && editingFocus.pulse !== pulseAtMount && (
        <motion.div key={editingFocus.pulse} className="split-layout__pane-pulse" initial={{ opacity: 0.55 }} animate={{ opacity: 0 }} transition={{ duration: 0.6, ease: 'easeOut' }} />
      )}
    </motion.div>
  )
}
