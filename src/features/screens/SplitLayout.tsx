import { useReducedMotion } from 'framer-motion'
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { NewsSlotSettings } from '../../hooks/useCurrentNewsHeadline'
import { useActiveAppearanceTheme } from '../../hooks/useAppearanceThemes'
import { useGoogleFontLoader } from '../../hooks/useGoogleFontLoader'
import { useLanguage, type LanguageCode } from '../../i18n'
import { DEFAULT_SCREEN_BACKGROUND_COLOR, type LayoutNode, type PaneId, type ScreenConfig, type ScreenSlot, type ScreenSlotContent, type SplitDirection, type TextSizes } from '../../types/screen'
import { applyRatioPatchPreservingDescendants, computeLayoutGeometry, FULL_BOX, type Divider, type LayoutGeometry, type Rect } from '../../utils/layoutGeometry'
import { listLeaves } from '../../utils/layoutTree'
import { diffLeafSets, resolvePaneGrowthOrigin, type PaneGrowthOrigin } from '../../utils/paneGrowth'
import { backgroundImageTextStyle, borderColorStyle, getScreenColorVars } from '../../utils/screenColors'
import { mediaResizeRatioPatch, mediaResizeScaleFromDrag, nodeAtPath, paneResizableAxes, pathKey, type NodePath, type PaneResizableAxes, type RatioPatch } from '../../utils/screenLayout'
import { isNewsSlotContent, isResizeToFitContent, resizeToFitMediaUrl } from '../../utils/screenSlots'
import { getBackgroundImageUrl, getSmallUrl } from '../../utils/responsiveImage'
import { isSlotActive, resolvePaneIdentitySignature, resolveSlotContent, resolveStageValue, writeStageCheckpoint } from '../../utils/screenStages'
import { ExitingPaneGhost } from './ExitingPaneGhost'
import { LayoutTree } from './LayoutTree'
import { BORDER_TRANSITION_DURATION_SECONDS, CONTENT_TRANSITION_DURATION_SECONDS, EXIT_PHASE_DURATION_SECONDS, PANE_GROWTH_DURATION_SECONDS } from './paneGrowthMotion'
import './SplitLayout.scss'

/** The stage-transition sequence's own three phases — see `SplitLayout`'s own `contentPhase` state and doc comment for what each drives. */
type ContentPhase = 'idle' | 'exiting' | 'holding'

/** Every leaf id under `node`, as a `Set` — the plain identity `computeStageStaticSets` compares a region against its own prior self with. */
function leafIdSet(node: LayoutNode): Set<PaneId> {
  return new Set(listLeaves(node).map((leaf) => leaf.id))
}

/** Same members, regardless of order — used to tell whether a region (a split's own `first`/`second` side, whole subtree included) still holds exactly the same panes it did before, i.e. nothing was added to or removed from *that specific side*. */
function sameLeafIds(a: Set<PaneId>, b: Set<PaneId>): boolean {
  return a.size === b.size && [...a].every((id) => b.has(id))
}

/**
 * Computed once at the start of a stage transition (see `SplitLayout`'s own `prevEffectiveStage` block)
 * — which leaves' own resolved identity is unchanged between the old and new stage, and which split
 * dividers have at least one side whose own leaf set is unchanged, so `LayoutTree`/`LayoutPane` can let
 * those specific panes and borders sit out the disruptive "blank behind a snap" part of the transition
 * rather than treating a part of the screen that isn't actually being added to or removed from like it
 * is — even while the *other* side of that same divider genuinely is (a real-world screen very often has
 * exactly this shape: one pane that persists across every stage, resizing as siblings elsewhere come and
 * go around it).
 *
 * A leaf present in only one of the two trees is usually genuinely appearing/disappearing — normally
 * handled by the existing `enteringGrowth`/`exitingGhosts` machinery instead — with one exception: an
 * appeared leaf whose own `ScreenSlot.splitFromPaneId` names a leaf that *was* present in the old tree,
 * and whose content there matches this leaf's own content now, is treated as static too. That's the
 * "split a pane into two mid-screen-build, one half keeps showing what the whole pane already was"
 * case — the new half is a structurally different `PaneId` (so it still gets a fresh mount and the
 * ordinary blank-and-snap geometry treatment for the *divider* next to it, which is genuinely new), but
 * its own content shouldn't play an entrance slide for content that was already on screen a moment ago.
 * The content-signature check still has to pass — a stale/since-diverged lineage never forces a match.
 *
 * A split node qualifies as
 * "stable" independently of its own `ratio` — a stage advance that only *resizes* a divider counts too,
 * so it gets a smooth CSS grid-template glide to its new ratio (like a live divider drag already does)
 * with its border staying fully visible throughout, instead of the border shrinking away and the
 * geometry snapping behind a blanked screen. Only requiring *one* side's leaf set to match (not both, as
 * an earlier version of this function did) is what makes this cover that "one persisting pane, one
 * churning region" shape — requiring both meant any leaf appearing/disappearing anywhere under a split
 * disqualified its border entirely, even directly alongside a pane that never itself gained or lost a
 * neighbor. The churning side's own interior still gets the ordinary blank-behind-a-snap treatment,
 * recursively, at whichever of *its own* nested split paths that applies to.
 */
function computeStageStaticSets(
  oldTree: LayoutNode,
  newTree: LayoutNode,
  paneSlots: Record<PaneId, ScreenSlot>,
  oldStage: number,
  newStage: number,
  defaultPaneLanguage: LanguageCode,
): { staticLeafIds: Set<PaneId>; stableSplitPaths: Set<string> } {
  const oldLeafIds = new Set(listLeaves(oldTree).map((leaf) => leaf.id))
  const staticLeafIds = new Set<PaneId>()
  for (const leaf of listLeaves(newTree)) {
    const slot = paneSlots[leaf.id]
    if (!slot) continue
    if (oldLeafIds.has(leaf.id)) {
      if (resolvePaneIdentitySignature(slot, oldStage, defaultPaneLanguage) === resolvePaneIdentitySignature(slot, newStage, defaultPaneLanguage)) {
        staticLeafIds.add(leaf.id)
      }
      continue
    }
    const sourceId = slot.splitFromPaneId
    const sourceSlot = sourceId && oldLeafIds.has(sourceId) ? paneSlots[sourceId] : undefined
    if (sourceSlot && resolvePaneIdentitySignature(sourceSlot, oldStage, defaultPaneLanguage) === resolvePaneIdentitySignature(slot, newStage, defaultPaneLanguage)) {
      staticLeafIds.add(leaf.id)
    }
  }

  const stableSplitPaths = new Set<string>()
  const walk = (node: LayoutNode, path: NodePath) => {
    if (node.type !== 'split') return
    const oldNode = nodeAtPath(oldTree, path)
    if (oldNode.type === 'split' && oldNode.direction === node.direction) {
      const firstInert = sameLeafIds(leafIdSet(oldNode.first), leafIdSet(node.first))
      const secondInert = sameLeafIds(leafIdSet(oldNode.second), leafIdSet(node.second))
      if (firstInert || secondInert) stableSplitPaths.add(pathKey(path))
    }
    walk(node.first, [...path, 'first'])
    walk(node.second, [...path, 'second'])
  }
  walk(newTree, [])

  return { staticLeafIds, stableSplitPaths }
}

interface SplitLayoutProps {
  screen: ScreenConfig
  /** Resolves the effective (persisted, its own override, or live-drafted while being edited) text sizes for a given pane at a given stage. */
  resolveTextSizes: (leafId: PaneId, stage: number, content: ScreenSlotContent) => TextSizes
  /** Called when a pane's hover-revealed edit button is clicked, with that pane's own stable id. Omit (along with `onResizeDivider`) to render the panes read-only, with neither edit buttons nor drag handles — e.g. while the screen is locked, or with no logged-in admin session at all. */
  onEditSlide?: (leafId: PaneId) => void
  /** The current stage (1-indexed), resolved by the caller from its own shared rotation timer. */
  stage: number
  /** Overrides `stage` for every pane at once — e.g. while an admin's pane editor is actively viewing a specific stage, so the whole live display previews exactly that stage instead of its natural rotating one (every pane shares the same stage sequence, so this isn't scoped to just the one pane being edited). */
  forcedStage?: number
  /** The raw, monotonically-increasing rotation tick `stage` itself is wrapped from (`stage = (tick % stageCount) + 1`, see `src/utils/screenStages.ts`) — only meaningful, and only actually passed, by the real live display (`ScreenDisplay.tsx`); the two static-preview callers (`ScreenCard.tsx`/`ScreenForm.tsx`) have no real rotation timer of their own and simply omit it. See `stageTick`'s own doc comment for what this drives. */
  tick?: number
  /** Persists a divider's new position (or a structural tree edit) once it's been dragged/made. Omit to render the panes without any draggable dividers at all. */
  onResizeDivider?: (patch: Partial<ScreenConfig>) => void
  /** Reports when a divider drag starts and stops — lets the caller (e.g. pausing the shared stage rotation for the duration, see `ScreenDisplay`) react to a drag in progress without needing to track live ratios itself. */
  onDragStateChange?: (isDragging: boolean) => void
  /** Called when an image file is dropped directly onto a pane, with that pane's own stable id and the dropped file — the caller owns uploading it and deciding what to do with the result (see `ScreenDisplay`'s own handler, which sets that pane's content to the uploaded image at `fit: 'cover'`). Omit (like `onEditSlide`/`onResizeDivider`) to disable entirely, e.g. while the screen is locked, or with no logged-in admin session at all. */
  onDropImage?: (leafId: PaneId, file: File) => void
  /** The cafe's own Standard pane language (see `useDefaultPaneLanguage`) — what a pane's own rendered content (menu items, event descriptions, etc.) falls back to when it has no language override of its own at the current stage (see `resolveSlotLanguage`). */
  defaultPaneLanguage: LanguageCode
  /** Draws a persistent highlight ring around this one pane, if any — distinct from `editingFocus`'s own transient pulse-flash, this stays on for as long as the caller says so (e.g. the admin form's own "Layout" preview, mirroring which pane's own editor is currently open beneath it). */
  selectedLeafId?: PaneId
  /** While true (and `selectedLeafId` is set), every OTHER pane dims — the live display's own floating "Edit pane" panel uses this so the pane it's editing stands out against the rest of the canvas. Omit (the default) to leave every pane at full visibility regardless of `selectedLeafId`, e.g. the admin form's own "Layout" preview, which only wants the ring, not a dimmed canvas. */
  dimUnselectedPanes?: boolean
  /** Hovering close to a pane's own middle (either axis) reveals a "Split" line/label there — see `PaneSplitZones`; clicking splits it into two, both halves starting with the original's own duplicated content. Omit (like `onEditSlide`) to disable, e.g. while the screen is locked, or with no logged-in admin session at all. */
  onSplitPane?: (leafId: PaneId, axis: SplitDirection, edge: 'start' | 'end') => void
  /** Hovering dead center instead splits this pane straight into a clean 2x2 of 4 — see `PaneSplitZones`' own doc comment. Omit (like `onSplitPane`) to disable. */
  onSplitFour?: (leafId: PaneId) => void
  /** Set by `ScreenForm.tsx`'s own preview only — see `PaneSplitZones`' prop of the same underlying purpose (`disableOnTouch`) for why it's not the default everywhere `onSplitPane` is used. */
  disableSplitOnTouch?: boolean
  /** Hovering a pane reveals a top-left button resetting its content/background/text-size back to blank. */
  onClearPane?: (leafId: PaneId) => void
  /** Hovering a pane reveals a top-right delete button, handing its own freed space to its sibling — never shown on a lone root pane. */
  onDeletePane?: (leafId: PaneId) => void
  /** Called when a plain click (not a resize drag) lands on any divider — the screen-wide border settings (visibility/color) aren't specific to any one divider, so this isn't scoped to which one was clicked. Omit (like `onSplitPane`) to disable — a divider then only ever resizes, same as before this existed. */
  onBorderClick?: () => void
  /** Toggles a pane's own lock — see `LayoutTree.tsx`'s own prop of the same name for what locking actually disables. Omit to disable pane locking altogether. */
  onTogglePaneLock?: (leafId: PaneId) => void
  /** Which panes are currently checked for the toolbar's own multi-pane actions ("Delete selected"/"Group") — see `ScreenDisplay.tsx`'s own `activeSelectedLeafIds`. Omit (along with `onToggleChecked`) to hide every pane's own selection checkbox. */
  selectedLeafIds?: Set<PaneId>
  /** Toggles a pane's own membership in `selectedLeafIds`. Omit (like `onEditSlide`) to disable selection entirely. */
  onToggleChecked?: (leafId: PaneId) => void
  /** Called when a video slide with `advanceStageOnEnd` finishes playing, so the caller can advance the shared stage rotation immediately instead of waiting for the normal timed interval — see `ScreenDisplay`'s own handler, which reuses the same advance logic as the toolbar's "next stage" button. Omit on the two static-preview callers (`ScreenCard.tsx`/`ScreenForm.tsx`), which have no real rotation timer to advance; `VideoSlide` simply never calls it in that case. */
  onRequestStageAdvance?: () => void
  /** Set only by `ScreenPreviewCapture.tsx`'s own off-screen render — swaps every video pane's real `<video>` playback for its poster-frame image instead (see `SlotContent.tsx`), since a DOM screenshot can't reliably grab a live video frame. Omit everywhere else (the kiosk display, both live editors), which is also the default. */
  captureMode?: boolean
}

/**
 * Shows a screen's pane arrangement, resolved for the current stage — a
 * recursive tree of splits (see `LayoutTree`), each pane's content,
 * background color/image, and shared text size independently resolved
 * against the shared `stage` (see `src/utils/screenStages.ts`). An animated
 * transition (`screen.transitionStyle`) plays whenever a pane's own
 * resolved checkpoint actually changes, while every pane's position stays
 * fixed for as long as the tree shape itself doesn't change — when it does
 * (a different stage's own tree, or a structural edit while editing), the
 * same `layout`+stable-id convention every pane/split wrapper already uses
 * animates the reflow smoothly, with no separate "shape changed" case.
 * Hovering any pane reveals a small button opening that pane's editor, plus
 * (when their own callbacks are provided) a top-left "Clear" button, a
 * top-right delete button, and hovering close to the pane's own middle
 * reveals a "Split" line/label there to split it in two, dead center — see
 * `LayoutPane.tsx` for the full z-index layering between all of these.
 * Every split gets one draggable divider, sized from its own adjustable
 * ratio — dragging one live-resizes its two sides and persists on release.
 * A pane whose own currently-showing content is an image or video with
 * `resizeToFit` on temporarily overrides whichever divider(s) govern its
 * own axes (see `mediaResizeRatioPatch`) to fit that media, capped at 40%
 * of the viewport along either — live-visual only, never persisted, so the
 * stage sequence advancing to different content drops the override and the
 * pane slides back to its own set size on its own.
 */
export function SplitLayout({
  screen,
  resolveTextSizes,
  onEditSlide,
  stage,
  forcedStage,
  tick,
  onResizeDivider,
  onDragStateChange,
  onDropImage,
  defaultPaneLanguage,
  selectedLeafId,
  dimUnselectedPanes,
  onSplitPane,
  onSplitFour,
  disableSplitOnTouch,
  onClearPane,
  onDeletePane,
  onBorderClick,
  onTogglePaneLock,
  selectedLeafIds,
  onToggleChecked,
  onRequestStageAdvance,
  captureMode,
}: SplitLayoutProps) {
  const { t } = useLanguage()
  const reducedMotion = useReducedMotion()
  const containerRef = useRef<HTMLDivElement>(null)
  const [liveRatios, setLiveRatios] = useState<RatioPatch>({})
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })
  const [mediaNaturalSizes, setMediaNaturalSizes] = useState<Record<string, { width: number; height: number }>>({})
  const requestedMediaRef = useRef<Set<string>>(new Set())
  const effectiveStage = forcedStage ?? stage
  /** The raw rotation tick's own target value — see `stageTick` below for why this needs the same delayed catch-up `displayStage` gets, not just the stage number itself. */
  const effectiveTick = tick ?? 0

  /**
   * The stage everything below actually renders against — deliberately
   * lagging `effectiveStage` (the *target*) until the old content has
   * finished exiting (see `contentPhase` below), so the grid/tree reflow
   * ("the borders moving") and the pane add/remove diffing both wait for
   * that exit too, rather than firing the instant the target changes.
   * Starts equal to `effectiveStage` so the very first render has nothing
   * to sequence.
   */
  const [displayStage, setDisplayStage] = useState(effectiveStage)
  /**
   * `tick`'s own equivalent of `displayStage` — without this, a News pane's
   * headline (or a `'qrcode'` slide's automatic rotation, see `stageTick`
   * below) would flip the instant `tick` advances, which is the same render
   * `effectiveStage` changes on — visibly changing a pane's content while it
   * is still fully on screen, mid-exit-animation, before `displayStage` (and
   * therefore `stageTick`, if this weren't delayed too) has even started to
   * catch up. Kept and updated in lockstep with `displayStage` throughout.
   */
  const [displayTick, setDisplayTick] = useState(effectiveTick)
  /**
   * `'idle'` the rest of the time; `'exiting'` for `EXIT_PHASE_DURATION_SECONDS`
   * right after `effectiveStage` changes (old content plays its exit
   * variant — see `LayoutPane.tsx`'s `suppressEnter` and its own randomized
   * per-pane stagger — while `displayStage` still holds the old value); then
   * `'holding'` for `PANE_GROWTH_DURATION_SECONDS`
   * once `displayStage` catches up (the grid/tree reflow and any pane
   * grow/collapse play, while the new content stays forced into its own
   * exit variant so it doesn't reveal early); back to `'idle'` once that
   * settles, letting the new content finally animate in. Skipped
   * entirely — an immediate snap straight to the target, same as before
   * this existed — while reduced motion is on, or while `forcedStage` is
   * set (the pane editor's own stage-tab preview stays instant; only the
   * live rotation/step controls get the sequenced version).
   */
  const [contentPhase, setContentPhase] = useState<ContentPhase>('idle')

  const fallbackLeafId = Object.keys(screen.paneSlots)[0] ?? 'none'
  // Memoized so it's a *stable* reference across renders that don't change
  // `screen.layout`/`displayStage` (the object-literal fallback branch
  // would otherwise be a fresh object every render) — required for the
  // `diffWithBase`/`enteringGrowth` memoization below (both keyed on
  // `tree`) to actually skip work, not just on paper. Keyed on `displayStage`
  // (not `effectiveStage`) so the tree/shape — and everything derived from
  // it, including the grid reflow and pane grow/collapse diffing — only
  // updates once the stage-transition sequence's exit phase has finished.
  // Computed here, ahead of the `prevEffectiveStage` block below, so that
  // block can read it as "the tree as it stood right before this
  // transition" — this render's `displayStage` is still the pre-transition
  // value the whole way through (see this file's own "adjusting state
  // during render" pattern, same idiom `diffBase`/`prevTree` further down
  // rely on).
  const tree = useMemo(
    () => resolveStageValue(screen.layout, displayStage) ?? { type: 'leaf' as const, id: fallbackLeafId },
    [screen.layout, displayStage, fallbackLeafId],
  )
  /**
   * Detects a genuine target-stage change synchronously during render —
   * React's own documented "adjusting state when a prop changes" pattern
   * (same idiom as `prevTree`/`diffBase` below), not a `useEffect`, so the
   * `'exiting'` phase (and `LayoutPane`'s own `suppressEnter`) is already in
   * effect on the very same commit `effectiveStage` changed on, with no
   * extra frame where the old content hasn't started leaving yet. Reduced
   * motion / `forcedStage` (the pane editor's own stage-tab preview) skip
   * the sequence entirely and jump `displayStage` straight to the target,
   * same as before this existed. The actual timers that carry `'exiting'`
   * through to `'holding'` and back to `'idle'` live in the effect below,
   * keyed off `contentPhase` itself rather than triggered from here, so an
   * `effectiveStage` change that arrives again mid-sequence (a rapid
   * double-advance) naturally cancels and restarts them instead of needing
   * separate bookkeeping.
   */
  const [prevEffectiveStage, setPrevEffectiveStage] = useState(effectiveStage)
  /**
   * Which leaves are content-unchanged, and which split dividers have an unchanged leaf set on both
   * sides (see `computeStageStaticSets`) — computed once, right when a genuine transition starts (below),
   * and held fixed for its whole `'exiting'`→`'holding'`→`'idle'` cycle so a pane/border doesn't flicker
   * between suppressed and unsuppressed mid-sequence. Irrelevant (and left at their prior value, unused)
   * whenever `contentPhase` stays `'idle'` — the reduced-motion/`forcedStage` branch below never even
   * reads these.
   */
  const [stageStaticLeafIds, setStageStaticLeafIds] = useState<Set<PaneId>>(() => new Set())
  const [stableSplitPaths, setStableSplitPaths] = useState<Set<string>>(() => new Set())
  if (prevEffectiveStage !== effectiveStage) {
    setPrevEffectiveStage(effectiveStage)
    if (reducedMotion || forcedStage !== undefined) {
      setDisplayStage(effectiveStage)
      setDisplayTick(effectiveTick)
      setContentPhase('idle')
    } else {
      const newTree = resolveStageValue(screen.layout, effectiveStage) ?? { type: 'leaf' as const, id: fallbackLeafId }
      const stageStaticSets = computeStageStaticSets(tree, newTree, screen.paneSlots, displayStage, effectiveStage, defaultPaneLanguage)
      setStageStaticLeafIds(stageStaticSets.staticLeafIds)
      setStableSplitPaths(stageStaticSets.stableSplitPaths)
      setContentPhase('exiting')
    }
  }

  useEffect(() => {
    if (contentPhase === 'exiting') {
      const timer = setTimeout(() => {
        setDisplayStage(effectiveStage)
        setDisplayTick(effectiveTick)
        setContentPhase('holding')
      }, EXIT_PHASE_DURATION_SECONDS * 1000)
      return () => clearTimeout(timer)
    }
    if (contentPhase === 'holding') {
      // Just long enough for the borders to finish growing back into their
      // new positions (`SplitBorderLine`) before the new content starts
      // sliding in — the geometry itself already snapped on the commit that
      // entered this phase, so there's no animation left to wait out.
      const timer = setTimeout(() => setContentPhase('idle'), BORDER_TRANSITION_DURATION_SECONDS * 1000)
      return () => clearTimeout(timer)
    }
  }, [contentPhase, effectiveStage, effectiveTick])

  /** The store's currently active appearance theme — its 3 font roles are loaded here (once, at the shared root every render path — thumbnail, editor preview, and live kiosk display — goes through) and applied via `--screen-font-*` below; its color palette is offered by `BackgroundColorPicker` instead, since panes/screens themselves still just store a plain hex. */
  const activeTheme = useActiveAppearanceTheme()
  useGoogleFontLoader([activeTheme.fonts.body, activeTheme.fonts.heading, activeTheme.fonts.subheading])

  /** `--screen-bg`/`--screen-text`/etc, redeclared right at this wrapper so every descendant pane — including one with no background color of its own — resolves them from the *screen's* own configured appearance rather than leaking through to whatever ancestor styling happens to surround `SplitLayout` whenever it's used (e.g. the admin form's own "Layout" preview never set these at all otherwise). A pane with its own background color still overrides these locally (see `slotBackgroundColorStyle`), same as ever — this only fixes the fallback. */
  const screenColorStyle = {
    ...getScreenColorVars(screen.backgroundColor ?? DEFAULT_SCREEN_BACKGROUND_COLOR),
    ...borderColorStyle(screen.borderColor),
    ...backgroundImageTextStyle(screen.backgroundImage?.overlay),
    '--screen-font-body': `'${activeTheme.fonts.body}', sans-serif`,
    '--screen-font-heading': `'${activeTheme.fonts.heading}', sans-serif`,
    '--screen-font-subheading': `'${activeTheme.fonts.subheading}', sans-serif`,
  } as CSSProperties

  useEffect(() => {
    const node = containerRef.current
    if (!node) return
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setContainerSize({ width: entry.contentRect.width, height: entry.contentRect.height })
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  /**
   * The screen's own whole-screen background image, rendered once behind
   * everything else.
   *
   * This used to be impossible: `.split-layout__pane` always painted an
   * opaque background, so anything drawn at this level was completely hidden
   * behind the real panes. Instead every pane with no backdrop of its own
   * rendered its *own* "window" onto a shared screen-sized copy of the image
   * — a whole apparatus of container measuring, a `cover`-fit rect, per-leaf
   * slice offsets and a `-30px` overscan so `filter: blur` had real pixels to
   * sample past each pane's edge — purely to make N independent crops line up
   * as one continuous image. Panes are transparent now (their backdrop moved
   * onto the sliding content slots, see `LayoutPane`), so a single element
   * behind them is both genuinely continuous and far less machinery.
   */
  const screenBackgroundLayer = screen.backgroundImage ? (
    <div className="split-layout__bg">
      <div
        className="split-layout__bg-image"
        style={{
          backgroundImage: `url(${getBackgroundImageUrl(screen.backgroundImage.imageUrl, screen.backgroundImage.blur ?? true)})`,
          filter: (screen.backgroundImage.blur ?? true) ? 'blur(4px)' : 'none',
        }}
      />
      {screen.backgroundImage.overlay !== 'none' && <div className={`split-layout__bg-overlay split-layout__bg-overlay--${screen.backgroundImage.overlay}`} />}
    </div>
  ) : null

  const leaves = listLeaves(tree)
  const paneGrowthFallback = screen.paneGrowthFallback ?? 'screenEdge'

  /**
   * Detects a shape change (the resolved tree's own leaf *set* differing
   * from the last one seen) synchronously during render, not in a
   * `useEffect` — framer-motion's `initial` prop (which is what actually
   * plays a newly-appeared pane's own grow-in animation, see
   * `LayoutPane.tsx`) is only honored at a component's true first mount,
   * and an effect runs *after* that first commit, so by the time an effect
   * could compute "this pane just appeared, grow it in from X," the pane
   * would already be mounted at full size with nothing to animate from.
   * Uses React's own documented "adjusting state when a prop changes"
   * pattern (`useState`, not `useRef` — this codebase's lint config
   * forbids reading/writing a ref's `current` during render entirely, per
   * the `react-hooks/refs` rule) — a conditional `setState` call right
   * here, during render, is safe and intentional: React immediately
   * re-renders with the updated state before committing anything to the
   * screen, and the condition below is false on that very next pass (state
   * already caught up), so this always settles after at most one extra
   * pass. `diffBase` is deliberately never reset back to `null` once
   * populated (it naturally becomes stale/unused again the next time
   * `tree` genuinely changes) — safe to leave "stuck" since every consumer
   * below is idempotent to being re-derived from the same stale value on
   * repeat renders (framer-motion only reads `enteringGrowth` once, at
   * actual mount; `exitingGhosts` explicitly filters out ids it's already
   * tracking before ever calling `setExitingGhosts`) — and `diffWithBase`
   * below memoizes the actual diff itself, so a stale-but-unchanged
   * `diffBase` doesn't even cost a re-walk of the tree on every one of
   * those repeat renders, only the first time it's seen.
   */
  const [prevTree, setPrevTree] = useState<LayoutNode>(tree)
  const [diffBase, setDiffBase] = useState<LayoutNode | null>(null)
  /**
   * Whether the pending diff came from a *stage advance* rather than an
   * editor edit — captured at the moment the tree actually changed, not read
   * later, since `diffBase` outlives the phase that produced it.
   *
   * The distinction matters because the same `tree` change drives both: a
   * stage advance (the timer below moving `displayStage` on, which lands on
   * the same commit as `contentPhase: 'holding'`) and an ordinary layout edit
   * (splitting or deleting a pane in the editor, with the phase still
   * `'idle'`). A stage advance no longer wants the grow-in/collapse
   * animations at all — its geometry snaps behind a blanked screen, so
   * animating panes there would put movement back into the exact window this
   * rework empties out, at the cost of a full extra `LayoutPane` mount per
   * disappearing pane. An editor edit still wants them.
   */
  const [diffFromStageAdvance, setDiffFromStageAdvance] = useState(false)
  if (prevTree !== tree) {
    setDiffBase(prevTree)
    setDiffFromStageAdvance(contentPhase !== 'idle')
    setPrevTree(tree)
  }

  /** `diffLeafSets(diffBase, tree)` computed once per `[diffBase, tree]` pair rather than separately (and redundantly) by both `enteringGrowth` below and the `exitingGhosts` tracking block — both derive from exactly the same diff. */
  const diffWithBase = useMemo(() => (diffBase ? { diffBase, diff: diffLeafSets(diffBase, tree) } : null), [diffBase, tree])

  const enteringGrowth = useMemo<Record<PaneId, PaneGrowthOrigin>>(() => {
    if (!diffWithBase || reducedMotion || diffFromStageAdvance) return {}
    return Object.fromEntries(diffWithBase.diff.appeared.map((id) => [id, resolvePaneGrowthOrigin(tree, diffWithBase.diffBase, id, paneGrowthFallback)]))
  }, [diffWithBase, reducedMotion, diffFromStageAdvance, tree, paneGrowthFallback])

  const [exitingGhosts, setExitingGhosts] = useState<Record<PaneId, { rect: Rect; growth: PaneGrowthOrigin }>>({})
  if (diffWithBase && !reducedMotion && !diffFromStageAdvance) {
    const { diffBase: baseForExit, diff } = diffWithBase
    const newlyDisappeared = diff.disappeared.filter((id) => !(id in exitingGhosts))
    if (newlyDisappeared.length > 0) {
      const priorGeometry = computeLayoutGeometry(baseForExit)
      setExitingGhosts((current) => {
        const additions: Record<PaneId, { rect: Rect; growth: PaneGrowthOrigin }> = {}
        for (const id of newlyDisappeared) {
          if (id in current) continue
          const rect = priorGeometry.leaves.find((leaf) => leaf.id === id)?.rect
          if (!rect) continue
          // Still added to `exitingGhosts` even when `screen.paneSlots[id]` is already gone (see the render call below, which skips mounting `ExitingPaneGhost` for exactly that case) — *not* skipped here, since `id` leaving this map is what stops `newlyDisappeared` from including it again above; permanently excluding it here instead would make this same block re-fire, and re-call `setExitingGhosts`, on every single future render (an infinite "too many re-renders" loop), not just a one-time skip.
          additions[id] = { rect, growth: resolvePaneGrowthOrigin(baseForExit, tree, id, paneGrowthFallback) }
        }
        return Object.keys(additions).length > 0 ? { ...current, ...additions } : current
      })
    }
  }
  const removeGhost = (leafId: PaneId) =>
    setExitingGhosts((current) => {
      if (!(leafId in current)) return current
      const next = { ...current }
      delete next[leafId]
      return next
    })
  const resolvePaneContent = (leafId: PaneId): ScreenSlotContent => {
    const slot = screen.paneSlots[leafId]
    return slot ? resolveSlotContent(slot, displayStage) : { kind: 'none' }
  }

  /** Every currently-resolved `'news'`-kind pane on this screen, in leaf order — what a `'qrcode'` slide's own "automatic" `newsSourceMode` (see `QrCodeSlide`) picks from by `newsSlotOrdinal`, so it can follow whichever headline a sibling News pane is showing without any direct communication between the two live components (see `useCurrentNewsHeadline`'s own doc comment). */
  const newsSlots: NewsSlotSettings[] = leaves
    .map((leaf) => resolvePaneContent(leaf.id))
    .filter(isNewsSlotContent)
    .map((content) => ({ sourceIds: content.sourceIds, headlineCount: content.headlineCount, rotateSeconds: content.rotateSeconds }))

  /** Drives News-pane headline (and a `'qrcode'` slide's own "automatic" mode) rotation from the screen's own shared stage advances instead of an independent wall-clock timer, for any screen that actually has more than one stage — `undefined` (no steps at all) falls back to that independent timer instead (see `useCurrentNewsHeadline`). Deliberately the raw tick's own delayed (`displayTick`, not `effectiveTick`) counterpart, not the wrapped 1..stageCount `stage` value — keying off `stage` itself would cap a rotating News pane at exactly `stageCount` distinct headlines forever, however many are actually available; keying off the *undelayed* tick would flip a still-exiting pane's headline out from under its own mid-exit content (see `displayTick`'s own doc comment). */
  const stageTick = screen.useStages && (screen.stageCount ?? 1) > 1 ? displayTick : undefined

  const activeResizeMediaEntries = leaves
    .map((leaf) => resolvePaneContent(leaf.id))
    .filter(isResizeToFitContent)
    .map((content) => ({ url: resizeToFitMediaUrl(content) as string, kind: content.kind }))
  const activeResizeMediaKey = activeResizeMediaEntries.map((entry) => entry.url).join('|')

  /**
   * Drops any `mediaNaturalSizes` entry no longer referenced by this
   * screen's own `resizeToFit` panes — otherwise every distinct URL an
   * admin ever assigns to such a pane stays in it forever, for as long as
   * this screen stays mounted (a kiosk's whole uptime). Pruned here, during
   * render (React's own documented "adjusting state when a prop changes"
   * pattern, same idiom as `diffBase`/`prevTree` above), rather than inside
   * the effect below — a synchronous `setState` as the first thing an
   * effect does relies on triggering (and waiting out) a whole extra
   * render/commit just to apply a value already fully computable during
   * this one.
   */
  const [prunedForResizeKey, setPrunedForResizeKey] = useState<string | undefined>(undefined)
  if (prunedForResizeKey !== activeResizeMediaKey) {
    const activeUrls = new Set(activeResizeMediaEntries.map((entry) => entry.url))
    setMediaNaturalSizes((current) => {
      const next = Object.fromEntries(Object.entries(current).filter(([url]) => activeUrls.has(url)))
      return Object.keys(next).length === Object.keys(current).length ? current : next
    })
    setPrunedForResizeKey(activeResizeMediaKey)
  }

  useEffect(() => {
    const activeUrls = new Set(activeResizeMediaEntries.map((entry) => entry.url))
    // Same pruning, applied to `requestedMediaRef` — a ref, so (unlike
    // `mediaNaturalSizes` above) this belongs in an effect, not render.
    for (const url of requestedMediaRef.current) {
      if (!activeUrls.has(url)) requestedMediaRef.current.delete(url)
    }

    activeResizeMediaEntries.forEach(({ url, kind }) => {
      if (requestedMediaRef.current.has(url)) return
      requestedMediaRef.current.add(url)
      if (kind === 'video') {
        // A hidden, never-appended `<video>` — just enough to read its own
        // natural dimensions off `loadedmetadata`, the video equivalent of
        // `new Image()`'s own `onload` below. Not the same element (or even
        // the same *kind* of network request) `VideoSlide`/`useCachedVideoSrc`
        // use for actual playback — this one only ever needs metadata, never
        // plays, and is thrown away the moment its dimensions are read.
        const video = document.createElement('video')
        video.onloadedmetadata = () => setMediaNaturalSizes((current) => ({ ...current, [url]: { width: video.videoWidth, height: video.videoHeight } }))
        video.src = url
        return
      }
      const img = new Image()
      img.onload = () => setMediaNaturalSizes((current) => ({ ...current, [url]: { width: img.naturalWidth, height: img.naturalHeight } }))
      // `getSmallUrl`, not the raw stored URL, for two separate reasons:
      //
      // 1. It normalizes the origin. A stored upload URL carries whichever host the *uploading admin*
      //    used — routinely `http://localhost:4000` — which resolves to the device itself on a TV and
      //    never loads, so `resizeToFit` silently never applied there at all.
      // 2. Aspect ratio is variant-invariant, so reading it off the 800px derivative gives the exact
      //    same answer as the original while decoding a fraction of the pixels. The original is
      //    already being fetched by the pane's own `<img>`; this loader existing at all meant a second
      //    full-resolution decode purely to read two numbers.
      //
      // An external (non-own-upload) URL is returned unchanged by `getSmallUrl`, same as before.
      img.src = getSmallUrl(url)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `activeResizeMediaEntries` is a new array every render; this key is its faithful (and stable) serialization.
  }, [activeResizeMediaEntries.map((entry) => entry.url).join('|')])

  /** The arrangement's own *committed* geometry (not `layoutTree`'s live-dragged overlay) — the source of truth both for snap targets (see `LayoutTree.tsx`'s `snapTargets` prop, and `PaneCornerHandle`'s qualifying-corner detection), for `applyRatioPatchPreservingDescendants` below (so a drag in progress doesn't chase its own moving position), and for every leaf's own *current* resolved rect (see `mediaResizeRatioPatch`'s own doc comment on why that's needed, not just each axis's local ratio in isolation). */
  const geometry: LayoutGeometry = computeLayoutGeometry(tree)
  const allDividers: Divider[] = geometry.dividers
  const leafRectById = new Map(geometry.leaves.map((leaf) => [leaf.id, leaf.rect]))

  const mediaResizeOverrides: RatioPatch = leaves.reduce<RatioPatch>((patch, leaf) => {
    const content = resolvePaneContent(leaf.id)
    if (!isResizeToFitContent(content)) return patch
    const url = resizeToFitMediaUrl(content)
    const naturalSize = url ? mediaNaturalSizes[url] : undefined
    const leafRect = leafRectById.get(leaf.id)
    if (!naturalSize || !leafRect) return patch
    return { ...patch, ...mediaResizeRatioPatch(tree, leaf.id, naturalSize.width, naturalSize.height, containerSize.width, containerSize.height, leafRect, content.resizeScale) }
  }, {})

  /** The one pane (there's never more than one active per stage — see `isResizeToFitConflict`) currently fit to a `resizeToFit` image or video, if any — so a divider drag touching one of its own axes can be redirected into changing that media's own `resizeScale` instead of writing straight to the tree's own ratio, which is recomputed from that scale every render anyway. */
  const resizeMediaEntry = leaves.reduce<{ leafId: PaneId; naturalSize: { width: number; height: number }; rect: Rect } | undefined>((found, leaf) => {
    if (found) return found
    const content = resolvePaneContent(leaf.id)
    if (!isResizeToFitContent(content)) return found
    const url = resizeToFitMediaUrl(content)
    const naturalSize = url ? mediaNaturalSizes[url] : undefined
    const rect = leafRectById.get(leaf.id)
    return naturalSize && rect ? { leafId: leaf.id, naturalSize, rect } : found
  }, undefined)
  const activeMediaResize: { leafId: PaneId; axes: PaneResizableAxes; naturalWidth: number; naturalHeight: number; rect: Rect } | undefined = resizeMediaEntry && {
    leafId: resizeMediaEntry.leafId,
    axes: paneResizableAxes(tree, resizeMediaEntry.leafId),
    naturalWidth: resizeMediaEntry.naturalSize.width,
    naturalHeight: resizeMediaEntry.naturalSize.height,
    rect: resizeMediaEntry.rect,
  }

  const isDragging = Object.keys(liveRatios).length > 0

  const liveOverridePatch: RatioPatch = { ...mediaResizeOverrides, ...liveRatios }
  const layoutTree = Object.keys(liveOverridePatch).length > 0 ? applyRatioPatchPreservingDescendants(tree, liveOverridePatch, geometry) : tree

  /**
   * The screen's own whole-screen background image, as one element behind
   * everything — see `screenBackgroundLayer` below, which both this
   * empty-screen branch and the real pane tree render.
   */
  if (!leaves.some((leaf) => screen.paneSlots[leaf.id] && isSlotActive(screen.paneSlots[leaf.id]))) {
    return (
      <div className="split-layout split-layout--empty" style={screenColorStyle}>
        {screenBackgroundLayer}
        <p>{t('screenDisplay.emptyLabel')}</p>
      </div>
    )
  }

  // Borders default off (an absent `showSlotBorders` means no-borders, not shown) — see that field's own doc comment for why: the divider gap's translucent tint reads as an unwanted glow against a whole-screen background image, so a screen only gets visible borders once explicitly opted into.
  const borderModifier = screen.showSlotBorders ? '' : ' split-layout--no-borders'
  const baseGridTransitionCss = `grid-template-columns ${PANE_GROWTH_DURATION_SECONDS}s ease, grid-template-rows ${PANE_GROWTH_DURATION_SECONDS}s ease, background-color 0.4s ease`
  /**
   * A stage transition deliberately gets **no** grid-template transition for
   * most splits: their geometry snaps in a single reflow on the commit that
   * enters `'holding'`, at the one moment nothing distinguishable is on
   * screen to see it move: the borders have shrunk away, and every pane's
   * content — its backdrop along with it, since the two travel together now —
   * has already slid off, leaving nothing but the screen's own flat
   * background. Animating it instead — as this used to, unconditionally —
   * meant `grid-template-columns`/`-rows`, both layout-affecting, re-running
   * layout on the main thread every frame for half a second, with the
   * highest-contrast thing on screen gliding along carrying every dropped
   * frame with it.
   *
   * Editor-driven changes keep the animation: dragging a divider, splitting a
   * pane or switching the previewed stage tab are direct manipulations where
   * a smooth glide is the point and the cost is paid once, not every 10
   * seconds forever on a kiosk. `isDragging` still opts out separately, since
   * a transition actively fights a drag that's already updating every frame.
   *
   * `stableSplitPaths` splits (see `computeStageStaticSets`) are the one
   * stage-transition exception: a divider whose own leaf set isn't gaining or
   * losing a pane is architecturally the same as a live divider drag, just
   * triggered by a stage advance instead of a pointer — see
   * `stableResizeGridTransition` below, which `LayoutTree.tsx` applies to
   * exactly those splits instead of this one.
   */
  const gridTransition = isDragging || contentPhase !== 'idle' ? false : baseGridTransitionCss
  /** The same transition `gridTransition` uses, but never suppressed by `contentPhase` — only by an actual drag in progress. See `gridTransition`'s own doc comment for why a `stableSplitPaths` divider gets this instead. */
  const stableResizeGridTransition = isDragging ? false : baseGridTransitionCss

  const mediaResizeScaleFromPatch = (patch: RatioPatch): number | undefined => {
    if (!activeMediaResize) return undefined
    const { leafId, axes, naturalWidth, naturalHeight, rect } = activeMediaResize
    const paths = [axes.width?.path, axes.height?.path].filter((path): path is NodePath => path !== undefined)
    const scales = paths
      .filter((path) => patch[pathKey(path)] !== undefined)
      .map((path) => mediaResizeScaleFromDrag(tree, leafId, path, patch[pathKey(path)], naturalWidth, naturalHeight, containerSize.width, containerSize.height, rect))
    if (scales.length === 0) return undefined
    return scales.reduce((sum, value) => sum + value, 0) / scales.length
  }

  /**
   * The general form of a divider drag's live-change — one or more
   * `(path, ratio)` pairs at once, so a `PaneCornerHandle` (which moves a
   * split's own ratio *and* a qualifying child's together, see
   * `LayoutTree.tsx`) can apply both in one call instead of two separate
   * (and separately re-rendered) ones. A plain single-divider drag (see
   * `handleLiveChange` below) is just the one-key case.
   */
  const handleLiveChangePatch = (patch: RatioPatch) => {
    if (Object.keys(liveRatios).length === 0) onDragStateChange?.(true)

    const scale = mediaResizeScaleFromPatch(patch)
    if (activeMediaResize && scale !== undefined) {
      const { leafId, naturalWidth, naturalHeight, rect } = activeMediaResize
      setLiveRatios((current) => ({ ...current, ...mediaResizeRatioPatch(tree, leafId, naturalWidth, naturalHeight, containerSize.width, containerSize.height, rect, scale) }))
      return
    }
    setLiveRatios((current) => ({ ...current, ...patch }))
  }
  const handleLiveChange = (path: NodePath, ratio: number) => handleLiveChangePatch({ [pathKey(path)]: ratio })

  /** The general form of a divider drag's commit — see `handleLiveChangePatch`'s own doc comment. */
  const handleCommitPatch = (patch: RatioPatch) => {
    const scale = mediaResizeScaleFromPatch(patch)
    const keys = Object.keys(patch)
    const stillDragging = Object.keys(liveRatios).some((field) => !keys.includes(field))
    if (!stillDragging) onDragStateChange?.(false)
    setLiveRatios((current) => {
      const next = { ...current }
      keys.forEach((key) => delete next[key])
      return next
    })
    if (activeMediaResize && scale !== undefined) {
      const slot = screen.paneSlots[activeMediaResize.leafId]
      const content = slot ? resolveSlotContent(slot, displayStage) : undefined
      if (!slot || !content || (content.kind !== 'image' && content.kind !== 'video')) return
      const nextSlot = { ...slot, content: writeStageCheckpoint(slot.content, displayStage, { ...content, resizeScale: scale }) }
      onResizeDivider?.({ paneSlots: { ...screen.paneSlots, [activeMediaResize.leafId]: nextSlot } })
      return
    }
    // Checkpoints the dragged-to tree at whichever stage is actually rendered (`displayStage`, not the `effectiveStage` target — a drag only ever happens against what's on screen) — "moving the border(s)" only affects whichever stage is currently being viewed/edited. Every other divider re-derives its own ratio to hold its absolute on-screen position (see `applyRatioPatchPreservingDescendants`) rather than drifting along with whichever side of the drag its own container happens to sit in.
    const nextTree = applyRatioPatchPreservingDescendants(tree, patch, geometry)
    onResizeDivider?.({ layout: writeStageCheckpoint(screen.layout, displayStage, nextTree) })
  }
  const handleCommit = (path: NodePath, ratio: number) => handleCommitPatch({ [pathKey(path)]: ratio })

  return (
    <div ref={containerRef} className={`split-layout${borderModifier}`} style={screenColorStyle}>
      {screenBackgroundLayer}
      <LayoutTree
        node={layoutTree}
        screenID={screen.screenID}
        path={[]}
        box={FULL_BOX}
        root={tree}
        paneSlots={screen.paneSlots}
        stage={displayStage}
        transitionStyle={screen.transitionStyle}
        resolveTextSizes={resolveTextSizes}
        onEditSlide={onEditSlide}
        onDropImage={onDropImage}
        defaultPaneLanguage={defaultPaneLanguage}
        editingFocus={screen.editingFocus}
        transitionDuration={CONTENT_TRANSITION_DURATION_SECONDS}
        contentPhase={contentPhase}
        stageStaticLeafIds={stageStaticLeafIds}
        stableSplitPaths={stableSplitPaths}
        reducedMotion={reducedMotion}
        selectedLeafId={selectedLeafId}
        dimUnselectedPanes={dimUnselectedPanes}
        onLiveChange={onResizeDivider ? handleLiveChange : undefined}
        onCommit={onResizeDivider ? handleCommit : undefined}
        onLiveChangeMulti={onResizeDivider ? handleLiveChangePatch : undefined}
        onCommitMulti={onResizeDivider ? handleCommitPatch : undefined}
        allDividers={allDividers}
        onBorderClick={onBorderClick}
        onTogglePaneLock={onTogglePaneLock}
        selectedLeafIds={selectedLeafIds}
        onToggleChecked={onToggleChecked}
        gridTransition={gridTransition}
        stableResizeGridTransition={stableResizeGridTransition}
        showSlotBorders={Boolean(screen.showSlotBorders)}
        onSplitPane={onSplitPane}
        onSplitFour={onSplitFour}
        disableSplitOnTouch={disableSplitOnTouch}
        onClearPane={onClearPane}
        onDeletePane={onDeletePane}
        canDelete={leaves.length > 1}
        enteringGrowth={enteringGrowth}
        newsSlots={newsSlots}
        stageTick={stageTick}
        onRequestStageAdvance={onRequestStageAdvance}
        captureMode={captureMode}
      />
      {Object.entries(exitingGhosts).map(([leafId, { rect, growth }]) => {
        const slot = screen.paneSlots[leafId]
        // `ExitingPaneGhost` assumes `screen.paneSlots[leafId]` is still there (true whenever a leaf disappears via `deleteLeaf`, which deliberately never touches `paneSlots`) — but undo/redo instead swaps in a whole prior `ScreenConfig` snapshot wholesale, which can genuinely have no entry at all for a pane that only ever existed *after* the snapshot it's reverting to (e.g. undoing straight back across the split that created it). No slot means nothing valid to animate out, so skip mounting it here rather than pass `LayoutPane` an undefined slot — `leafId` still stays in `exitingGhosts` either way (see the block above for why that matters), it just never actually renders anything.
        if (!slot) return null
        return (
          <ExitingPaneGhost
            key={leafId}
            leafId={leafId}
            screenID={screen.screenID}
            rect={rect}
            growth={growth}
            slot={slot}
            stage={displayStage}
            transitionStyle={screen.transitionStyle}
            resolveTextSizes={resolveTextSizes}
            defaultPaneLanguage={defaultPaneLanguage}
            onCollapseComplete={removeGhost}
            newsSlots={newsSlots}
            stageTick={stageTick}
            onRequestStageAdvance={onRequestStageAdvance}
          />
        )
      })}
    </div>
  )
}
