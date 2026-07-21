import { AnimatePresence, motion } from 'framer-motion'
import { useRef, useState, type CSSProperties, type DragEvent } from 'react'
import { useCrossfadeSlot } from '../../hooks/useCrossfadeSlot'
import type { NewsSlotSettings } from '../../hooks/useCurrentNewsHeadline'
import { useShrinkToFitFontScale } from '../../hooks/useShrinkToFitFontScale'
import { useShrinkToFitScale } from '../../hooks/useShrinkToFitScale'
import { useLanguage, type LanguageCode } from '../../i18n'
import type { BackgroundImageOverlay, PaneId, ScreenConfig, ScreenSlot, ScreenSlotContent, SlideTransitionDirection, SplitDirection, TextSizes } from '../../types/screen'
import { backgroundImageTextStyle, slotBackgroundColorStyle } from '../../utils/screenColors'
import type { PaneGrowthOrigin } from '../../utils/paneGrowth'
import { getBlurredBackgroundUrl } from '../../utils/responsiveImage'
import { resolveContentBackgroundImage } from '../../utils/screenSlots'
import { resolveSlotBackgroundColor, resolveSlotBackgroundImage, resolveSlotContent, resolveSlotLanguage, resolveSlotOverflowMode } from '../../utils/screenStages'
import { textSizesToCssVars } from '../../utils/textSizeVars'
import { collapsedClipPath, FULL_REVEAL_CLIP_PATH, PANE_GROWTH_DURATION_SECONDS, paneTransitionDelaySeconds } from './paneGrowthMotion'
import { PaneClearButton } from './PaneClearButton'
import { PaneDeleteButton } from './PaneDeleteButton'
import { PaneEditButton } from './PaneEditButton'
import { PaneLanguageScope } from './PaneLanguageScope'
import { PaneLockButton } from './PaneLockButton'
import { PaneSelectCheckbox } from './PaneSelectCheckbox'
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
  /** Which phase of the stage-transition sequence is currently playing (see `SplitLayout`'s own `contentPhase` state) — `'idle'` (the default, when omitted, e.g. `ExitingPaneGhost`'s own wrapped instance) renders content normally; `'exiting'`/`'holding'` both force this pane's content (and background) into their own hidden/exit state via `suppressEnter` below, regardless of whether `activeContentSlot` would otherwise say a slot should be entering. */
  contentPhase?: 'idle' | 'exiting' | 'holding'
  reducedMotion: boolean | null
  /** Hovering close to the pane's own middle (either axis) reveals a "Split" line/label there; clicking splits it 50/50 along that axis — see `PaneSplitZones`. Omit (like `onEditSlide`) to disable, e.g. while the screen is locked. */
  onSplitPane?: (leafId: PaneId, axis: SplitDirection, edge: 'start' | 'end') => void
  /** Hovering dead center instead splits this pane straight into a clean 2x2 of 4 — see `PaneSplitZones`' own doc comment. Omit (like `onSplitPane`) to disable. */
  onSplitFour?: (leafId: PaneId) => void
  /** Threaded straight through to `PaneSplitZones` — see its own prop of the same name. */
  disableSplitOnTouch?: boolean
  /** Hovering the pane reveals a top-left "Clear" button resetting its content back to blank. */
  onClearPane?: (leafId: PaneId) => void
  /** Hovering the pane reveals a top-right delete button — never rendered when `canDelete` is false (this is the tree's only pane). */
  onDeletePane?: (leafId: PaneId) => void
  /** Whether this pane can be deleted at all — false when it's the tree's only leaf, since deleting the last pane would leave nothing. */
  canDelete: boolean
  /** Whether this pane is locked at the current stage (see `resolveSlotLocked`) — purely for `PaneLockButton`'s own icon/positioning, since every *other* prop here is already omitted by the caller (`LayoutTree.tsx`) whenever this is true, rather than this component re-checking it itself. */
  locked: boolean
  /** Toggles this pane's own lock — unlike every other callback here, always present (when editing at all) regardless of `locked`, since it's the one thing that must stay reachable on a locked pane to ever unlock it again. */
  onToggleLock?: () => void
  /** Draws a persistent highlight ring around this pane — see `SplitLayout`'s own doc comment. */
  selected?: boolean
  /** Whether this pane is currently checked for the toolbar's own multi-pane actions ("Delete selected"/"Group") — distinct from `selected`'s own single highlight-ring concept. Omit (along with `onToggleChecked`) to hide the checkbox entirely, e.g. while the screen is locked. */
  checked?: boolean
  /** Toggles this pane's own `checked` state. Omit (like `onEditSlide`) to disable selection entirely. */
  onToggleChecked?: () => void
  /** Which of this pane's own edges it should visually grow in from on mount (a real divider, the screen's own edge, or a plain fade — see `resolvePaneGrowthOrigin` in `src/utils/paneGrowth.ts`) — `undefined` renders at full size immediately, which is also always the effective behavior once `reducedMotion` is on (only consulted at React's own true first mount, per `SplitLayout.tsx`'s own doc comment on why this can't be computed in an effect). */
  growEntranceFrom?: PaneGrowthOrigin
  /** Every currently-resolved `'news'`-kind pane on this screen — threaded straight through to `SlotContent`/`QrCodeSlide`. See `LayoutTree`'s own prop of the same name. */
  newsSlots: NewsSlotSettings[]
  /** Threaded straight through to `SlotContent`/`NewsSlide`/`QrCodeSlide`. See `LayoutTree`'s own prop of the same name. */
  stageTick: number | undefined
  /** Threaded straight through to `SlotContent`/`VideoSlide`. See `SplitLayout`'s own prop of the same name. */
  onRequestStageAdvance?: () => void
}

/**
 * One checkpoint's own frozen render input — snapshotted the moment it
 * becomes current (see `useCrossfadeSlot`), so a still-exiting checkpoint's
 * content never has its own text size/language/background swapped out from
 * under it by a *later* checkpoint's values before its own exit animation
 * finishes. `backgroundColor`/`overlay` are only actually applied per-slot
 * while `transitionStyle` is `'slide'` (see the render below) — for
 * `'fade'` the background stays on the always-live ancestor pane exactly as
 * before, switching immediately.
 */
interface PaneContentSnapshot {
  content: ScreenSlotContent
  textSizeVars: CSSProperties
  language: LanguageCode
  backgroundColor: string | undefined
  overlay: BackgroundImageOverlay | undefined
}

/**
 * Renders one pane's currently-showing content (animated whenever its own
 * resolved content actually changes value — not merely whenever the stage
 * crosses into a new checkpoint, see the crossfade key below), background,
 * hover-revealed edit button, and `editingFocus` pulse-flash — extracted
 * from the arrangement's own shape entirely, so it's identical regardless
 * of where in the tree this leaf sits. Each instance owns its own
 * drag-over/content-checkpoint tracking as local state (rather than the
 * whole tree bookkeeping it by index), since React already remounts/keeps
 * this component per leaf id.
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
  contentPhase = 'idle',
  reducedMotion,
  onSplitPane,
  onSplitFour,
  disableSplitOnTouch,
  onClearPane,
  onDeletePane,
  canDelete,
  locked,
  onToggleLock,
  selected,
  checked,
  onToggleChecked,
  growEntranceFrom,
  newsSlots,
  stageTick,
  onRequestStageAdvance,
}: LayoutPaneProps) {
  const { t } = useLanguage()
  const [dragDepth, setDragDepth] = useState(0)
  /** True for both of `contentPhase`'s non-idle values — this pane's own content/background stays forced into its hidden/exit state for the whole "old content exiting, then borders moving" stretch of the stage-transition sequence, only actually revealing once the caller settles back to `'idle'`. */
  const suppressEnter = contentPhase !== 'idle'

  /** This pane's own content/background leaving vs. arriving — each gets its own small deterministic-per-pane extra delay (see `paneTransitionDelaySeconds`) so a multi-pane stage advance doesn't have every pane leave/arrive in exact lockstep, rather than sharing one `transition` object like before. */
  const exitTransition = reducedMotion ? { duration: 0 } : { duration: transitionDuration, delay: paneTransitionDelaySeconds(leafId, 'exit'), ease: 'easeInOut' as const }
  const enterTransition = reducedMotion ? { duration: 0 } : { duration: transitionDuration, delay: paneTransitionDelaySeconds(leafId, 'enter'), ease: 'easeInOut' as const }

  // One outer/inner ref pair per crossfade slot (always exactly 2, see
  // `useCrossfadeSlot`) — `useShrinkToFitScale` is called unconditionally
  // for both, same "fixed number of hook calls" posture every other hook in
  // this component already has. Named individually (not an array) since the
  // `react-hooks/refs` lint rule flags indexing into a ref-holding array
  // during render, even when nothing actually reads `.current` there.
  const contentOuterRef0 = useRef<HTMLDivElement>(null)
  const contentInnerRef0 = useRef<HTMLDivElement>(null)
  const contentOuterRef1 = useRef<HTMLDivElement>(null)
  const contentInnerRef1 = useRef<HTMLDivElement>(null)
  const overflowMode = resolveSlotOverflowMode(slot, stage)

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
  const backgroundColor = resolveSlotBackgroundColor(slot, stage)
  const slotBackgroundImage = resolveSlotBackgroundImage(slot, stage)
  const backgroundImage = resolveContentBackgroundImage(content, slotBackgroundImage)
  const language = resolveSlotLanguage(slot, stage) ?? defaultPaneLanguage
  const isSlideStyle = transitionStyle === 'slide'
  // While `'fade'`, the background stays here — on the always-live
  // ancestor, switching immediately the instant the checkpoint/stage
  // changes (unchanged from before). While `'slide'`, each content slot
  // below carries its *own* frozen background instead, so it visually
  // travels with the sliding content rather than snapping separately on
  // the pane underneath it — this object becomes a harmless fallback base
  // layer in that case (covered by whichever slot is on top).
  const paneStyle = {
    ...slotBackgroundColorStyle(backgroundColor),
    ...backgroundImageTextStyle(backgroundImage?.overlay),
    ...(!reducedMotion ? { transition: 'background-color 0.4s ease, color 0.4s ease' } : {}),
  }
  const variants = resolveTransitionVariants(transitionStyle, slideDirection)

  const contentSnapshot: PaneContentSnapshot = {
    content,
    textSizeVars: textSizesToCssVars(resolveTextSizes(leafId, stage, content)),
    language,
    backgroundColor,
    overlay: backgroundImage?.overlay,
  }
  // Keyed on the *resolved content itself* (a stable JSON signature), not
  // which checkpoint number it happened to resolve from — a stage advance
  // can very well cross into a checkpoint boundary (a new checkpoint stage)
  // whose value is nonetheless identical to the last one, e.g. a pane
  // resize propagated forward across future stages ("keep for next steps
  // too") writes real checkpoints at each of them, but with the exact same
  // content/background/language the pane already had — that's a pure size
  // change, not a content change, and should resize in place with no
  // fade/slide transition (and, for `'fade'`, no background flash from a
  // needless crossfade) rather than replaying one for every pane whose only
  // difference between these two stages is its own on-screen size. Content
  // that's genuinely different still transitions correctly, since the
  // signature simply reflects whatever the resolved values actually are.
  const { slots: contentSlots, activeSlot: activeContentSlot } = useCrossfadeSlot<PaneContentSnapshot>(contentSnapshot, (item) =>
    JSON.stringify({ content: item.content, backgroundColor: item.backgroundColor, overlay: item.overlay, language: item.language }),
  )

  // Re-measures whenever this exact slot's own resolved content or text
  // size changes — not just on a pane resize (the hook's own
  // `ResizeObserver` already covers that) — e.g. an admin dragging a text-
  // size slider live needs a fresh measurement even though the pane itself
  // never changed size.
  const shrinkDep0 = contentSlots[0] ? JSON.stringify({ content: contentSlots[0].content, textSizeVars: contentSlots[0].textSizeVars }) : undefined
  const shrinkDep1 = contentSlots[1] ? JSON.stringify({ content: contentSlots[1].content, textSizeVars: contentSlots[1].textSizeVars }) : undefined
  // `'transit'`/`'weather'`/`'catalogue'`/the `'event'` kind's own `'month'`
  // display mode are width-filling grid/flex/multi-column layouts that need
  // an actual font-size reduction (so they can re-flow and re-fill the
  // available width), not a uniform paint transform — see
  // `useShrinkToFitFontScale`'s own doc comment. Every other kind keeps the
  // transform-based hook. Both hooks are always called (rules of hooks);
  // only one is ever actually `enabled` per slot.
  const isEventMonth = (content: ScreenSlotContent | undefined) => content?.kind === 'event' && content.displayMode === 'month'
  const usesFontScale = (content: ScreenSlotContent | undefined) =>
    content?.kind === 'transit' || content?.kind === 'weather' || content?.kind === 'catalogue' || isEventMonth(content)
  const usesFontScale0 = usesFontScale(contentSlots[0]?.content)
  const usesFontScale1 = usesFontScale(contentSlots[1]?.content)
  // `EventMonthSlide`'s own CSS multi-column list has no graceful width
  // fallback of its own (unlike `TransitSlide`'s ellipsis-truncating
  // destination column) — see `useShrinkToFitFontScale`'s own doc comment
  // for why it alone opts into that hook's width check too. `'weather'`
  // joins it for the same reason, but only in its own vertical-rectangle
  // layout (`WeatherSlide`'s `useIsVerticalPane`) — its default horizontal
  // layout already has that same `1fr`-track fallback (an hour column
  // shrinks before ever truly overflowing), but the vertical layout's own
  // fixed-width detail columns (Wind/Humidity/Rain/UV/Pressure headers) have
  // no such fallback, so a narrow enough pane with enough details toggled on
  // can genuinely run out of width with nothing else left to give.
  // Harmless to check width unconditionally for every weather pane either
  // way (the width check runs *in addition to* the height one this hook
  // already does, at the same real layout-measurement cost) — it just never
  // has anything to actually correct for while the horizontal layout's own
  // fallback is still absorbing the overflow itself.
  const checkWidth0 = isEventMonth(contentSlots[0]?.content) || contentSlots[0]?.content?.kind === 'weather'
  const checkWidth1 = isEventMonth(contentSlots[1]?.content) || contentSlots[1]?.content?.kind === 'weather'
  useShrinkToFitScale(contentOuterRef0, contentInnerRef0, overflowMode === 'shrink' && !usesFontScale0, [shrinkDep0])
  useShrinkToFitScale(contentOuterRef1, contentInnerRef1, overflowMode === 'shrink' && !usesFontScale1, [shrinkDep1])
  useShrinkToFitFontScale(contentOuterRef0, contentInnerRef0, overflowMode === 'shrink' && usesFontScale0, [shrinkDep0], checkWidth0)
  useShrinkToFitFontScale(contentOuterRef1, contentInnerRef1, overflowMode === 'shrink' && usesFontScale1, [shrinkDep1], checkWidth1)

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
            animate={{ opacity: suppressEnter ? 0 : 1 }}
            exit={{ opacity: 0 }}
            transition={suppressEnter ? exitTransition : enterTransition}
          >
            <div className="split-layout__pane-bg-image" style={{ backgroundImage: `url(${getBlurredBackgroundUrl(backgroundImage.imageUrl)})` }} />
            {backgroundImage.overlay !== 'none' && <div className={`split-layout__pane-bg-overlay split-layout__pane-bg-overlay--${backgroundImage.overlay}`} />}
          </motion.div>
        )}
      </AnimatePresence>
      {contentSlots.map((snapshot, slotIndex) => {
        if (!snapshot) return null
        const slotBackgroundStyle = isSlideStyle
          ? { ...slotBackgroundColorStyle(snapshot.backgroundColor), ...backgroundImageTextStyle(snapshot.overlay) }
          : {}
        return (
          <motion.div
            key={slotIndex}
            ref={slotIndex === 0 ? contentOuterRef0 : contentOuterRef1}
            className={`split-layout__pane-content${overflowMode === 'scroll' ? ' split-layout__pane-content--scroll' : ''}`}
            style={{ ...snapshot.textSizeVars, ...slotBackgroundStyle }}
            variants={variants}
            initial="initial"
            animate={!suppressEnter && activeContentSlot === slotIndex ? 'animate' : 'exit'}
            transition={!suppressEnter && activeContentSlot === slotIndex ? enterTransition : exitTransition}
          >
            <div className="split-layout__pane-content-inner" ref={slotIndex === 0 ? contentInnerRef0 : contentInnerRef1}>
              <PaneLanguageScope language={snapshot.language}>
                <SlotContent slot={snapshot.content} newsSlots={newsSlots} stageTick={stageTick} stage={stage} onRequestStageAdvance={onRequestStageAdvance} />
              </PaneLanguageScope>
            </div>
          </motion.div>
        )
      })}
      {/*
        Layering (low to high, see each component's own z-index): pane
        content < `PaneEditButton` (z-index 5, full-pane click target) <
        `PaneSplitZones` (z-index 6, only its own narrow middle-line-hugging
        strips are real click targets — dead center stays click-through to
        the edit button beneath) < the corner `PaneClearButton`/`PaneDeleteButton`/
        `PaneLockButton` (z-index 7, win over both the edit button and the
        split zones in their own corners — `PaneLockButton` renders centered
        instead, at the same z-index, once the pane is actually locked, since
        every other button here is omitted by the caller at that point
        anyway) < `SplitLayoutDivider` (z-index 8, always grabbable) < the
        `editingFocus` pulse-flash below (z-index 9, `pointer-events: none`,
        so it never blocks any of the above).
      */}
      {onEditSlide && <PaneEditButton onClick={() => onEditSlide(leafId)} />}
      {/* A video fills its own pane edge-to-edge with no natural split point, so splitting it isn't offered at all — not even the hover highlight. */}
      {onSplitPane && content.kind !== 'video' && (
        <PaneSplitZones
          onSplit={(axis, edge) => onSplitPane(leafId, axis, edge)}
          onSplitFour={onSplitFour ? () => onSplitFour(leafId) : undefined}
          disableOnTouch={disableSplitOnTouch}
        />
      )}
      {onToggleChecked && <PaneSelectCheckbox selected={Boolean(checked)} onToggle={onToggleChecked} />}
      {(onClearPane || (onDeletePane && canDelete)) && (
        <div className="pane-corner-button-group">
          {onClearPane && <PaneClearButton onClick={() => onClearPane(leafId)} />}
          {onDeletePane && canDelete && <PaneDeleteButton onClick={() => onDeletePane(leafId)} />}
        </div>
      )}
      {onToggleLock && <PaneLockButton locked={locked} onClick={onToggleLock} />}
      {editingFocus && (editingFocus.tab === 'global' || editingFocus.tab === leafId) && editingFocus.pulse !== pulseAtMount && (
        <motion.div key={editingFocus.pulse} className="split-layout__pane-pulse" initial={{ opacity: 0.55 }} animate={{ opacity: 0 }} transition={{ duration: 0.6, ease: 'easeOut' }} />
      )}
    </motion.div>
  )
}
