import { useReducedMotion } from 'framer-motion'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useLanguage, type LanguageCode } from '../../i18n'
import { DEFAULT_SCREEN_BACKGROUND_COLOR, type PaneId, type ScreenConfig, type ScreenSlotContent, type SplitDirection, type TextSizes } from '../../types/screen'
import { listLeaves } from '../../utils/layoutTree'
import { backgroundImageTextStyle, borderColorStyle, getScreenColorVars } from '../../utils/screenColors'
import { imageResizeRatioPatch, imageResizeScaleFromDrag, paneResizableAxes, pathKey, setRatioAtPath, type NodePath, type PaneResizableAxes, type RatioPatch } from '../../utils/screenLayout'
import { isResizeToFitImage } from '../../utils/screenSlots'
import { isSlotActive, resolveSlotContent, resolveStageValue, writeStageCheckpoint } from '../../utils/screenStages'
import { LayoutTree } from './LayoutTree'
import './SplitLayout.scss'

interface SplitLayoutProps {
  screen: ScreenConfig
  /** Resolves the effective (persisted, its own override, or live-drafted while being edited) text sizes for a given pane at a given stage. */
  resolveTextSizes: (leafId: PaneId, stage: number, content: ScreenSlotContent) => TextSizes
  /** Called when a pane's hover-revealed edit button is clicked, with that pane's own stable id. Omit (along with `onResizeDivider`) to render the panes read-only, with neither edit buttons nor drag handles — e.g. while the screen is locked. */
  onEditSlide?: (leafId: PaneId) => void
  /** The current stage (1-indexed), resolved by the caller from its own shared rotation timer. */
  stage: number
  /** Overrides `stage` for every pane at once — e.g. while an admin's pane editor is actively viewing a specific stage, so the whole live display previews exactly that stage instead of its natural rotating one (every pane shares the same stage sequence, so this isn't scoped to just the one pane being edited). */
  forcedStage?: number
  /** Persists a divider's new position (or a structural tree edit) once it's been dragged/made. Omit to render the panes without any draggable dividers at all. */
  onResizeDivider?: (patch: Partial<ScreenConfig>) => void
  /** Reports when a divider drag starts and stops — lets the caller (e.g. pausing the shared stage rotation for the duration, see `ScreenDisplay`) react to a drag in progress without needing to track live ratios itself. */
  onDragStateChange?: (isDragging: boolean) => void
  /** Called when an image file is dropped directly onto a pane, with that pane's own stable id and the dropped file — the caller owns uploading it and deciding what to do with the result (see `ScreenDisplay`'s own handler, which sets that pane's content to the uploaded image at `fit: 'cover'`). Omit (like `onEditSlide`/`onResizeDivider`) to disable entirely, e.g. while the screen is locked. */
  onDropImage?: (leafId: PaneId, file: File) => void
  /** The cafe's own Standard pane language (see `useDefaultPaneLanguage`) — what a pane's own rendered content (menu items, event descriptions, etc.) falls back to when it has no language override of its own at the current stage (see `resolveSlotLanguage`). */
  defaultPaneLanguage: LanguageCode
  /** Draws a persistent highlight ring around this one pane, if any — distinct from `editingFocus`'s own transient pulse-flash, this stays on for as long as the caller says so (e.g. the admin form's own "Layout" preview, mirroring which pane's own editor is currently open beneath it). */
  selectedLeafId?: PaneId
  /** Hovering close to a pane's own middle (either axis) reveals a "Split" line/label there — see `PaneSplitZones`; clicking splits it into two, both halves starting with the original's own duplicated content. Omit (like `onEditSlide`) to disable, e.g. while the screen is locked. */
  onSplitPane?: (leafId: PaneId, axis: SplitDirection, edge: 'start' | 'end') => void
  /** Hovering a pane reveals a top-left button resetting its content/background/text-size back to blank. */
  onClearPane?: (leafId: PaneId) => void
  /** Hovering a pane reveals a top-right delete button, handing its own freed space to its sibling — never shown on a lone root pane. */
  onDeletePane?: (leafId: PaneId) => void
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
  onClearPane,
  onDeletePane,
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
  const tree = resolveStageValue(screen.layout, effectiveStage) ?? { type: 'leaf' as const, id: fallbackLeafId }
  const leaves = listLeaves(tree)
  const resolvePaneContent = (leafId: PaneId): ScreenSlotContent => {
    const slot = screen.paneSlots[leafId]
    return slot ? resolveSlotContent(slot, effectiveStage) : { kind: 'none' }
  }

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
  let layoutTree = tree
  for (const [key, value] of Object.entries({ ...imageResizeOverrides, ...liveRatios })) layoutTree = setRatioAtPath(layoutTree, key === '' ? [] : (key.split('.') as NodePath), value)

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

  const handleLiveChange = (path: NodePath, ratio: number) => {
    const patch: RatioPatch = { [pathKey(path)]: ratio }
    if (Object.keys(liveRatios).length === 0) onDragStateChange?.(true)

    const scale = imageResizeScaleFromPatch(patch)
    if (activeImageResize && scale !== undefined) {
      const { leafId, naturalWidth, naturalHeight } = activeImageResize
      setLiveRatios((current) => ({ ...current, ...imageResizeRatioPatch(tree, leafId, naturalWidth, naturalHeight, containerSize.width, containerSize.height, scale) }))
      return
    }
    setLiveRatios((current) => ({ ...current, ...patch }))
  }

  const handleCommit = (path: NodePath, ratio: number) => {
    const patch: RatioPatch = { [pathKey(path)]: ratio }
    const scale = imageResizeScaleFromPatch(patch)
    const key = pathKey(path)
    const stillDragging = Object.keys(liveRatios).some((field) => field !== key)
    if (!stillDragging) onDragStateChange?.(false)
    setLiveRatios((current) => {
      const next = { ...current }
      delete next[key]
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
    // Checkpoints the dragged-to tree at the effective stage — "moving the border" only affects whichever stage is currently being viewed/edited.
    const nextTree = setRatioAtPath(tree, path, ratio)
    onResizeDivider?.({ layout: writeStageCheckpoint(screen.layout, effectiveStage, nextTree) })
  }

  return (
    <div ref={containerRef} className={`split-layout${borderModifier}`} style={screenColorStyle}>
      <LayoutTree
        node={layoutTree}
        path={[]}
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
        gridTransition={gridTransition}
        onSplitPane={onSplitPane}
        onClearPane={onClearPane}
        onDeletePane={onDeletePane}
        canDelete={leaves.length > 1}
      />
    </div>
  )
}
