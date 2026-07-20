import { useReducedMotion } from 'framer-motion'
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { NewsSlotSettings } from '../../hooks/useCurrentNewsHeadline'
import { useLanguage, type LanguageCode } from '../../i18n'
import { DEFAULT_SCREEN_BACKGROUND_COLOR, type LayoutNode, type PaneId, type ScreenConfig, type ScreenSlotContent, type SplitDirection, type TextSizes } from '../../types/screen'
import { applyRatioPatchPreservingDescendants, computeLayoutGeometry, FULL_BOX, type Divider, type LayoutGeometry, type Rect } from '../../utils/layoutGeometry'
import { listLeaves } from '../../utils/layoutTree'
import { diffLeafSets, resolvePaneGrowthOrigin, type PaneGrowthOrigin } from '../../utils/paneGrowth'
import { backgroundImageTextStyle, borderColorStyle, getScreenColorVars } from '../../utils/screenColors'
import { imageResizeRatioPatch, imageResizeScaleFromDrag, paneResizableAxes, pathKey, type NodePath, type PaneResizableAxes, type RatioPatch } from '../../utils/screenLayout'
import { isNewsSlotContent, isResizeToFitImage } from '../../utils/screenSlots'
import { isSlotActive, resolveSlotContent, resolveStageValue, writeStageCheckpoint } from '../../utils/screenStages'
import { ExitingPaneGhost } from './ExitingPaneGhost'
import { LayoutTree } from './LayoutTree'
import './SplitLayout.scss'

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
 * A pane whose own currently-showing content is an image with
 * `resizeToFit` on temporarily overrides whichever divider(s) govern its
 * own axes (see `imageResizeRatioPatch`) to fit that image, capped at 40%
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
  onResizeDivider,
  onDragStateChange,
  onDropImage,
  defaultPaneLanguage,
  selectedLeafId,
  onSplitPane,
  onSplitFour,
  disableSplitOnTouch,
  onClearPane,
  onDeletePane,
  onBorderClick,
  onTogglePaneLock,
}: SplitLayoutProps) {
  const { t } = useLanguage()
  const reducedMotion = useReducedMotion()
  const containerRef = useRef<HTMLDivElement>(null)
  const [liveRatios, setLiveRatios] = useState<RatioPatch>({})
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })
  const [imageNaturalSizes, setImageNaturalSizes] = useState<Record<string, { width: number; height: number }>>({})
  const requestedImagesRef = useRef<Set<string>>(new Set())
  const effectiveStage = forcedStage ?? stage

  /** `--screen-bg`/`--screen-text`/etc, redeclared right at this wrapper so every descendant pane — including one with no background color of its own — resolves them from the *screen's* own configured appearance rather than leaking through to whatever ancestor styling happens to surround `SplitLayout` whenever it's used (e.g. the admin form's own "Layout" preview never set these at all otherwise). A pane with its own background color still overrides these locally (see `slotBackgroundColorStyle`), same as ever — this only fixes the fallback. */
  const screenColorStyle = {
    ...getScreenColorVars(screen.backgroundColor ?? DEFAULT_SCREEN_BACKGROUND_COLOR),
    ...borderColorStyle(screen.borderColor),
    ...backgroundImageTextStyle(screen.backgroundImage?.overlay),
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

  const fallbackLeafId = Object.keys(screen.paneSlots)[0] ?? 'none'
  // Memoized so it's a *stable* reference across renders that don't change
  // `screen.layout`/`effectiveStage` (the object-literal fallback branch
  // would otherwise be a fresh object every render) — required for the
  // `diffWithBase`/`enteringGrowth` memoization below (both keyed on
  // `tree`) to actually skip work, not just on paper.
  const tree = useMemo(
    () => resolveStageValue(screen.layout, effectiveStage) ?? { type: 'leaf' as const, id: fallbackLeafId },
    [screen.layout, effectiveStage, fallbackLeafId],
  )
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
  if (prevTree !== tree) {
    setDiffBase(prevTree)
    setPrevTree(tree)
  }

  /** `diffLeafSets(diffBase, tree)` computed once per `[diffBase, tree]` pair rather than separately (and redundantly) by both `enteringGrowth` below and the `exitingGhosts` tracking block — both derive from exactly the same diff. */
  const diffWithBase = useMemo(() => (diffBase ? { diffBase, diff: diffLeafSets(diffBase, tree) } : null), [diffBase, tree])

  const enteringGrowth = useMemo<Record<PaneId, PaneGrowthOrigin>>(() => {
    if (!diffWithBase || reducedMotion) return {}
    return Object.fromEntries(diffWithBase.diff.appeared.map((id) => [id, resolvePaneGrowthOrigin(tree, diffWithBase.diffBase, id, paneGrowthFallback)]))
  }, [diffWithBase, reducedMotion, tree, paneGrowthFallback])

  const [exitingGhosts, setExitingGhosts] = useState<Record<PaneId, { rect: Rect; growth: PaneGrowthOrigin }>>({})
  if (diffWithBase && !reducedMotion) {
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
    return slot ? resolveSlotContent(slot, effectiveStage) : { kind: 'none' }
  }

  /** Every currently-resolved `'news'`-kind pane on this screen, in leaf order — what a `'qrcode'` slide's own "automatic" `newsSourceMode` (see `QrCodeSlide`) picks from by `newsSlotOrdinal`, so it can follow whichever headline a sibling News pane is showing without any direct communication between the two live components (see `useCurrentNewsHeadline`'s own doc comment). */
  const newsSlots: NewsSlotSettings[] = leaves
    .map((leaf) => resolvePaneContent(leaf.id))
    .filter(isNewsSlotContent)
    .map((content) => ({ sourceIds: content.sourceIds, headlineCount: content.headlineCount, rotateSeconds: content.rotateSeconds }))

  const activeResizeImageUrls = leaves.map((leaf) => resolvePaneContent(leaf.id)).filter(isResizeToFitImage).map((content) => content.imageUrl)

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

  const imageResizeOverrides: RatioPatch = leaves.reduce<RatioPatch>((patch, leaf) => {
    const content = resolvePaneContent(leaf.id)
    if (!isResizeToFitImage(content)) return patch
    const naturalSize = imageNaturalSizes[content.imageUrl]
    if (!naturalSize) return patch
    return { ...patch, ...imageResizeRatioPatch(tree, leaf.id, naturalSize.width, naturalSize.height, containerSize.width, containerSize.height, content.resizeScale) }
  }, {})

  /** The one pane (there's never more than one active per stage — see `isResizeToFitConflict`) currently fit to a `resizeToFit` image, if any — so a divider drag touching one of its own axes can be redirected into changing the image's own `resizeScale` instead of writing straight to the tree's own ratio, which is recomputed from that scale every render anyway. */
  const resizeImageEntry = leaves.reduce<{ leafId: PaneId; naturalSize: { width: number; height: number } } | undefined>((found, leaf) => {
    if (found) return found
    const content = resolvePaneContent(leaf.id)
    if (!isResizeToFitImage(content)) return found
    const naturalSize = imageNaturalSizes[content.imageUrl]
    return naturalSize ? { leafId: leaf.id, naturalSize } : found
  }, undefined)
  const activeImageResize: { leafId: PaneId; axes: PaneResizableAxes; naturalWidth: number; naturalHeight: number } | undefined = resizeImageEntry && {
    leafId: resizeImageEntry.leafId,
    axes: paneResizableAxes(tree, resizeImageEntry.leafId),
    naturalWidth: resizeImageEntry.naturalSize.width,
    naturalHeight: resizeImageEntry.naturalSize.height,
  }

  const isDragging = Object.keys(liveRatios).length > 0

  /** The arrangement's own *committed* geometry (not `layoutTree`'s live-dragged overlay) — the source of truth both for snap targets (see `LayoutTree.tsx`'s `snapTargets` prop, and `PaneCornerHandle`'s qualifying-corner detection) and for `applyRatioPatchPreservingDescendants` below, so a drag in progress doesn't chase its own moving position. */
  const geometry: LayoutGeometry = computeLayoutGeometry(tree)
  const allDividers: Divider[] = geometry.dividers

  const liveOverridePatch: RatioPatch = { ...imageResizeOverrides, ...liveRatios }
  const layoutTree = Object.keys(liveOverridePatch).length > 0 ? applyRatioPatchPreservingDescendants(tree, liveOverridePatch, geometry) : tree

  if (!leaves.some((leaf) => screen.paneSlots[leaf.id] && isSlotActive(screen.paneSlots[leaf.id]))) {
    return (
      <div className="split-layout split-layout--empty" style={screenColorStyle}>
        <p>{t('screenDisplay.emptyLabel')}</p>
      </div>
    )
  }

  const borderModifier = screen.showSlotBorders === false ? ' split-layout--no-borders' : ''
  const gridTransition = isDragging ? false : 'grid-template-columns 0.5s ease, grid-template-rows 0.5s ease, background-color 0.4s ease'

  const imageResizeScaleFromPatch = (patch: RatioPatch): number | undefined => {
    if (!activeImageResize) return undefined
    const { leafId, axes, naturalWidth, naturalHeight } = activeImageResize
    const paths = [axes.width?.path, axes.height?.path].filter((path): path is NodePath => path !== undefined)
    const scales = paths
      .filter((path) => patch[pathKey(path)] !== undefined)
      .map((path) => imageResizeScaleFromDrag(tree, leafId, path, patch[pathKey(path)], naturalWidth, naturalHeight, containerSize.width, containerSize.height))
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

    const scale = imageResizeScaleFromPatch(patch)
    if (activeImageResize && scale !== undefined) {
      const { leafId, naturalWidth, naturalHeight } = activeImageResize
      setLiveRatios((current) => ({ ...current, ...imageResizeRatioPatch(tree, leafId, naturalWidth, naturalHeight, containerSize.width, containerSize.height, scale) }))
      return
    }
    setLiveRatios((current) => ({ ...current, ...patch }))
  }
  const handleLiveChange = (path: NodePath, ratio: number) => handleLiveChangePatch({ [pathKey(path)]: ratio })

  /** The general form of a divider drag's commit — see `handleLiveChangePatch`'s own doc comment. */
  const handleCommitPatch = (patch: RatioPatch) => {
    const scale = imageResizeScaleFromPatch(patch)
    const keys = Object.keys(patch)
    const stillDragging = Object.keys(liveRatios).some((field) => !keys.includes(field))
    if (!stillDragging) onDragStateChange?.(false)
    setLiveRatios((current) => {
      const next = { ...current }
      keys.forEach((key) => delete next[key])
      return next
    })
    if (activeImageResize && scale !== undefined) {
      const slot = screen.paneSlots[activeImageResize.leafId]
      const content = slot ? resolveSlotContent(slot, effectiveStage) : undefined
      if (!slot || !content || content.kind !== 'image') return
      const nextSlot = { ...slot, content: writeStageCheckpoint(slot.content, effectiveStage, { ...content, resizeScale: scale }) }
      onResizeDivider?.({ paneSlots: { ...screen.paneSlots, [activeImageResize.leafId]: nextSlot } })
      return
    }
    // Checkpoints the dragged-to tree at the effective stage — "moving the border(s)" only affects whichever stage is currently being viewed/edited. Every other divider re-derives its own ratio to hold its absolute on-screen position (see `applyRatioPatchPreservingDescendants`) rather than drifting along with whichever side of the drag its own container happens to sit in.
    const nextTree = applyRatioPatchPreservingDescendants(tree, patch, geometry)
    onResizeDivider?.({ layout: writeStageCheckpoint(screen.layout, effectiveStage, nextTree) })
  }
  const handleCommit = (path: NodePath, ratio: number) => handleCommitPatch({ [pathKey(path)]: ratio })

  return (
    <div ref={containerRef} className={`split-layout${borderModifier}`} style={screenColorStyle}>
      <LayoutTree
        node={layoutTree}
        path={[]}
        box={FULL_BOX}
        root={tree}
        paneSlots={screen.paneSlots}
        stage={effectiveStage}
        transitionStyle={screen.transitionStyle}
        resolveTextSizes={resolveTextSizes}
        onEditSlide={onEditSlide}
        onDropImage={onDropImage}
        defaultPaneLanguage={defaultPaneLanguage}
        editingFocus={screen.editingFocus}
        transitionDuration={0.6}
        reducedMotion={reducedMotion}
        selectedLeafId={selectedLeafId}
        onLiveChange={onResizeDivider ? handleLiveChange : undefined}
        onCommit={onResizeDivider ? handleCommit : undefined}
        onLiveChangeMulti={onResizeDivider ? handleLiveChangePatch : undefined}
        onCommitMulti={onResizeDivider ? handleCommitPatch : undefined}
        allDividers={allDividers}
        onBorderClick={onBorderClick}
        onTogglePaneLock={onTogglePaneLock}
        gridTransition={gridTransition}
        onSplitPane={onSplitPane}
        onSplitFour={onSplitFour}
        disableSplitOnTouch={disableSplitOnTouch}
        onClearPane={onClearPane}
        onDeletePane={onDeletePane}
        canDelete={leaves.length > 1}
        enteringGrowth={enteringGrowth}
        newsSlots={newsSlots}
      />
      {Object.entries(exitingGhosts).map(([leafId, { rect, growth }]) => (
        <ExitingPaneGhost
          key={leafId}
          leafId={leafId}
          rect={rect}
          growth={growth}
          slot={screen.paneSlots[leafId]}
          stage={effectiveStage}
          transitionStyle={screen.transitionStyle}
          resolveTextSizes={resolveTextSizes}
          defaultPaneLanguage={defaultPaneLanguage}
          onCollapseComplete={removeGhost}
          newsSlots={newsSlots}
        />
      ))}
    </div>
  )
}
