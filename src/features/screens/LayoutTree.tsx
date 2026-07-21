import { useRef } from 'react'
import type { NewsSlotSettings } from '../../hooks/useCurrentNewsHeadline'
import type { LanguageCode } from '../../i18n'
import type { LayoutNode, PaneId, ScreenConfig, ScreenSlot, ScreenSlotContent, SplitDirection, TextSizes } from '../../types/screen'
import type { Divider, Rect } from '../../utils/layoutGeometry'
import { listLeaves } from '../../utils/layoutTree'
import type { PaneGrowthOrigin } from '../../utils/paneGrowth'
import { nodeGridTemplate, paneDefaultSlideDirection, pathKey, resolveRatio, type NodePath, type RatioPatch } from '../../utils/screenLayout'
import { resolveSlotBackgroundColor, resolveSlotLocked, subtreeGroupId, subtreeHasLockedLeaf } from '../../utils/screenStages'
import { LayoutPane } from './LayoutPane'
import { PaneCornerHandle } from './PaneCornerHandle'
import { SplitLayoutDivider } from './SplitLayoutDivider'

/** How close (in ratio percentage points) a `split` node's two qualifying children's own ratios need to be before they're treated as visually aligned into a true "+" — see this file's own doc comment — and merged into a single combined `PaneCornerHandle` instead of two separate ones. Slightly looser than `layoutGeometry.ts`'s pure-geometry `EPSILON`, since this is a UX affordance (when to show one merged handle vs two) rather than a correctness check. */
const CORNER_ALIGN_EPSILON = 0.5

interface LayoutTreeProps {
  node: LayoutNode
  /** This node's own path from the tree root — `[]` for the root itself. */
  path: NodePath
  /** This node's own current box, in the same 0-100 percentage space `computeLayoutGeometry` uses (`FULL_BOX` for the root) — lets this node convert `allDividers`' absolute screen-space positions into a ratio local to its own container (see `snapTargets` below), since a divider's live-drag position is always read relative to its own immediate container, not the whole screen. */
  box: Rect
  /** The full (unoverlaid) tree, used only to resolve each leaf's own default slide-in/out direction (which needs the *real* shape, not a live-dragged preview of it). */
  root: LayoutNode
  paneSlots: Record<PaneId, ScreenSlot>
  stage: number
  transitionStyle: ScreenConfig['transitionStyle']
  resolveTextSizes: (leafId: PaneId, stage: number, content: ScreenSlotContent) => TextSizes
  onEditSlide?: (leafId: PaneId) => void
  onDropImage?: (leafId: PaneId, file: File) => void
  defaultPaneLanguage: LanguageCode
  editingFocus: ScreenConfig['editingFocus']
  transitionDuration: number
  reducedMotion: boolean | null
  /** Omit to render every divider read-only (no drag handles at all) — e.g. while the screen is locked. */
  onLiveChange?: (path: NodePath, ratio: number) => void
  onCommit?: (path: NodePath, ratio: number) => void
  /** The multi-path form `onLiveChange`/`onCommit` delegate to internally — used directly by a `PaneCornerHandle` (see this file's own doc comment), which moves two or three paths (a split's own ratio, plus one or both qualifying children's) in a single gesture. Omit together with `onLiveChange`/`onCommit` to disable editing entirely. */
  onLiveChangeMulti?: (patch: RatioPatch) => void
  onCommitMulti?: (patch: RatioPatch) => void
  /** Every divider in the whole arrangement's own *committed* tree (see `SplitLayout.tsx`), computed once and threaded down rather than recomputed at every nested level — the snap targets for the plain per-node divider below (every other divider sharing this node's own axis, excluding its own path). */
  allDividers: Divider[]
  /** Threaded straight through to every `SplitLayoutDivider`'s own prop of the same name — a plain click (not a drag) on any border opens the screen-wide border settings, since the setting itself isn't specific to any one divider. Omit together with `onLiveChange`/`onCommit` to disable entirely. */
  onBorderClick?: () => void
  gridTransition: string | false
  /** Draws a persistent highlight ring around this one pane, if any — see `SplitLayout`'s own doc comment. */
  selectedLeafId?: PaneId
  /** Hover-to-split/clear/delete affordances — see `LayoutPane`'s own props of the same name. `canDelete` (true once `root` has more than one leaf) is computed once by `SplitLayout` and threaded straight through, rather than recomputed at every leaf. */
  onSplitPane?: (leafId: PaneId, axis: SplitDirection, edge: 'start' | 'end') => void
  onSplitFour?: (leafId: PaneId) => void
  disableSplitOnTouch?: boolean
  onClearPane?: (leafId: PaneId) => void
  onDeletePane?: (leafId: PaneId) => void
  canDelete: boolean
  /** Toggles a leaf's own lock (see `LayoutPane`'s own prop of the same name) — unlike the other per-leaf callbacks above, never conditionally omitted per-leaf here (a locked pane still needs to be unlockable); instead this file's own leaf branch gates every *other* per-leaf callback off once that leaf resolves as locked, and its own split branch disables a divider (and any `PaneCornerHandle` sharing its path) entirely once either side contains a locked leaf. Omit to disable pane locking altogether (e.g. no session at all). */
  onTogglePaneLock?: (leafId: PaneId) => void
  /** Which leaves just appeared this render (keyed by their own id) and which edge each should visually grow in from — see `LayoutPane`'s own prop of the same name, and `SplitLayout.tsx`'s own doc comment for how this is derived. Leaves not present here render at full size immediately. */
  enteringGrowth: Record<PaneId, PaneGrowthOrigin>
  /** Every currently-resolved `'news'`-kind pane on this screen — computed once by `SplitLayout` and threaded straight through (like `allDividers`) rather than re-derived at every nested level. See `LayoutPane`'s own prop of the same name. */
  newsSlots: NewsSlotSettings[]
  /** Computed once by `SplitLayout` and threaded straight through, like `newsSlots`. See `LayoutPane`'s own prop of the same name. */
  stageTick: number | undefined
  /** Which panes are currently checked — see `SplitLayout`'s own prop of the same name. Omit (along with `onToggleChecked`) to hide every pane's own selection checkbox. */
  selectedLeafIds?: Set<PaneId>
  /** Toggles a leaf's own membership in `selectedLeafIds`. Omit to disable selection entirely. */
  onToggleChecked?: (leafId: PaneId) => void
  /** Threaded straight through to every `LayoutPane`'s own prop of the same name — see `SplitLayout`'s own doc comment. */
  onRequestStageAdvance?: () => void
}

/**
 * Recursively renders a pane arrangement: a `leaf` renders one pane (see
 * `LayoutPane`); a `split` renders its own 2-cell CSS grid (sized via
 * `nodeGridTemplate`, from its own `ratio`) containing its two children —
 * each in turn a leaf or another nested split — plus its own single
 * draggable divider, positioned and measured against *this* node's own
 * grid container, not the whole screen's. This is what makes an inner
 * divider automatically bounded to its own parent cell, with no special
 * casing needed for however deep the tree goes.
 *
 * A `split` node whose child (`first` and/or `second`) is itself a `split`
 * of the perpendicular direction also gets one `PaneCornerHandle` per such
 * qualifying child, at the point where that child's own divider meets this
 * node's — the common 3-pane "T-junction" shape (one leaf sibling, one
 * perpendicular split) gets exactly one; a clean 4-pane 2x2 (both children
 * qualify) gets one *merged* handle (moving this node's ratio and both
 * children's together) once the two children's ratios currently coincide
 * into a true "+", or two separate handles (each moving this node's ratio
 * and just its own child's) once they've diverged. Either way, the plain
 * dividers themselves are untouched — dragging anywhere along a line away
 * from a corner still only moves that one ratio, exactly as before.
 */
export function LayoutTree({
  node,
  path,
  box,
  root,
  paneSlots,
  stage,
  transitionStyle,
  resolveTextSizes,
  onEditSlide,
  onDropImage,
  defaultPaneLanguage,
  editingFocus,
  transitionDuration,
  reducedMotion,
  onLiveChange,
  onCommit,
  onLiveChangeMulti,
  onCommitMulti,
  allDividers,
  onBorderClick,
  gridTransition,
  selectedLeafId,
  onSplitPane,
  onSplitFour,
  disableSplitOnTouch,
  onClearPane,
  onDeletePane,
  canDelete,
  onTogglePaneLock,
  enteringGrowth,
  newsSlots,
  stageTick,
  selectedLeafIds,
  onToggleChecked,
  onRequestStageAdvance,
}: LayoutTreeProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  if (node.type === 'leaf') {
    const slot = paneSlots[node.id]
    if (!slot) return null
    const slideDirection = paneDefaultSlideDirection(root, node.id)
    const locked = resolveSlotLocked(slot, stage)
    return (
      <LayoutPane
        key={node.id}
        leafId={node.id}
        slot={slot}
        stage={stage}
        transitionStyle={transitionStyle}
        slideDirection={slideDirection}
        resolveTextSizes={resolveTextSizes}
        onEditSlide={locked ? undefined : onEditSlide}
        onDropImage={locked ? undefined : onDropImage}
        defaultPaneLanguage={defaultPaneLanguage}
        editingFocus={editingFocus}
        transitionDuration={transitionDuration}
        reducedMotion={reducedMotion}
        selected={node.id === selectedLeafId}
        onSplitPane={locked ? undefined : onSplitPane}
        onSplitFour={locked ? undefined : onSplitFour}
        disableSplitOnTouch={disableSplitOnTouch}
        onClearPane={locked ? undefined : onClearPane}
        onDeletePane={locked ? undefined : onDeletePane}
        canDelete={canDelete}
        locked={locked}
        onToggleLock={onTogglePaneLock ? () => onTogglePaneLock(node.id) : undefined}
        growEntranceFrom={enteringGrowth[node.id]}
        newsSlots={newsSlots}
        stageTick={stageTick}
        onRequestStageAdvance={onRequestStageAdvance}
        checked={selectedLeafIds?.has(node.id)}
        onToggleChecked={locked ? undefined : onToggleChecked ? () => onToggleChecked(node.id) : undefined}
      />
    )
  }

  const gridTemplate = { ...nodeGridTemplate(node), ...(!reducedMotion && gridTransition ? { transition: gridTransition } : {}) }
  const orientation = node.direction === 'row' ? 'vertical' : 'horizontal'
  const axis = node.direction === 'row' ? 'x' : 'y'
  const axisStart = node.direction === 'row' ? box.x : box.y
  const axisSize = node.direction === 'row' ? box.width : box.height
  /** `allDividers` reports every divider's position in absolute screen-space (0-100 of the whole arrangement), but a divider's own live-drag position (see `SplitLayoutDivider`) is always read relative to *its own* immediate container — converts each same-axis candidate into this node's own local ratio space before it's usable as a snap target. */
  const snapTargets =
    axisSize > 0
      ? allDividers
          .filter((divider) => divider.axis === axis && pathKey(divider.path) !== pathKey(path))
          .map((divider) => ((divider.position - axisStart) / axisSize) * 100)
      : []

  const share = resolveRatio(node) / 100
  const firstBox: Rect = node.direction === 'row' ? { ...box, width: box.width * share } : { ...box, height: box.height * share }
  const secondBox: Rect =
    node.direction === 'row'
      ? { ...box, x: box.x + box.width * share, width: box.width * (1 - share) }
      : { ...box, y: box.y + box.height * share, height: box.height * (1 - share) }

  /** This node's ratio maps to the x-axis when it's a `'row'` (side-by-side) split, y otherwise — see `PaneCornerHandle`'s own doc comment for why a qualifying child's ratio is always the *other* axis. */
  const perpendicularDirection: SplitDirection = node.direction === 'row' ? 'column' : 'row'
  const firstQualifies = node.first.type === 'split' && node.first.direction === perpendicularDirection
  const secondQualifies = node.second.type === 'split' && node.second.direction === perpendicularDirection
  const merged = firstQualifies && secondQualifies && Math.abs((node.first as Extract<LayoutNode, { type: 'split' }>).ratio - (node.second as Extract<LayoutNode, { type: 'split' }>).ratio) <= CORNER_ALIGN_EPSILON

  /** Whether resizing this node's own divider would resize a locked pane on either side — if so, neither the plain divider nor any `PaneCornerHandle` at this node renders at all, since both always move this node's own ratio (which affects both sides) alongside whatever else they touch. */
  const dividerLocked = subtreeHasLockedLeaf(node.first, paneSlots, stage) || subtreeHasLockedLeaf(node.second, paneSlots, stage)

  /** This divider's own shared group color, if *both* sides fully resolve to the same "Group" at this stage (see `subtreeGroupId`) — the divider then paints to match instead of the screen's ordinary border color, and its own `gap` shrinks to 0 so the seam actually disappears rather than just changing color. `undefined` (the ordinary case) leaves this node's CSS untouched. */
  const firstGroupId = subtreeGroupId(node.first, paneSlots, stage)
  const secondGroupId = subtreeGroupId(node.second, paneSlots, stage)
  const sharedGroupId = firstGroupId && firstGroupId === secondGroupId ? firstGroupId : undefined
  const groupColor = sharedGroupId ? resolveSlotBackgroundColor(paneSlots[listLeaves(node.first)[0].id], stage) : undefined

  /** Builds one `PaneCornerHandle`'s props: `childPaths` is one path (a single T-junction corner) or two (a merged "+", both kept equal through the drag). */
  const cornerHandle = (key: string, childRatio: number, childPaths: NodePath[]) => {
    if (!onLiveChangeMulti || !onCommitMulti) return null
    const point = node.direction === 'row' ? { x: node.ratio, y: childRatio } : { x: childRatio, y: node.ratio }
    const buildPatch = (x: number, y: number): RatioPatch => {
      const parentValue = node.direction === 'row' ? x : y
      const childValue = node.direction === 'row' ? y : x
      const patch: RatioPatch = { [pathKey(path)]: parentValue }
      childPaths.forEach((childPath) => (patch[pathKey(childPath)] = childValue))
      return patch
    }
    return (
      <PaneCornerHandle
        key={key}
        x={point.x}
        y={point.y}
        containerRef={containerRef}
        onLiveChange={(x, y) => onLiveChangeMulti(buildPatch(x, y))}
        onCommit={(x, y) => onCommitMulti(buildPatch(x, y))}
      />
    )
  }

  return (
    <div
      ref={containerRef}
      className={`layout-tree__split${sharedGroupId ? ' layout-tree__split--grouped' : ''}`}
      style={{
        ...gridTemplate,
        ...(sharedGroupId && groupColor ? { backgroundColor: groupColor, gap: 0 } : {}),
        ...(!reducedMotion ? { transition: [gridTemplate.transition, 'background-color 0.3s ease', 'gap 0.3s ease'].filter(Boolean).join(', ') } : {}),
      }}
    >
      <LayoutTree
        node={node.first}
        path={[...path, 'first']}
        box={firstBox}
        root={root}
        paneSlots={paneSlots}
        stage={stage}
        transitionStyle={transitionStyle}
        resolveTextSizes={resolveTextSizes}
        onEditSlide={onEditSlide}
        onDropImage={onDropImage}
        defaultPaneLanguage={defaultPaneLanguage}
        editingFocus={editingFocus}
        transitionDuration={transitionDuration}
        reducedMotion={reducedMotion}
        onLiveChange={onLiveChange}
        onCommit={onCommit}
        onLiveChangeMulti={onLiveChangeMulti}
        onCommitMulti={onCommitMulti}
        allDividers={allDividers}
        onBorderClick={onBorderClick}
        gridTransition={gridTransition}
        selectedLeafId={selectedLeafId}
        onSplitPane={onSplitPane}
        onSplitFour={onSplitFour}
        disableSplitOnTouch={disableSplitOnTouch}
        onClearPane={onClearPane}
        onDeletePane={onDeletePane}
        canDelete={canDelete}
        onTogglePaneLock={onTogglePaneLock}
        enteringGrowth={enteringGrowth}
        newsSlots={newsSlots}
        stageTick={stageTick}
        onRequestStageAdvance={onRequestStageAdvance}
        selectedLeafIds={selectedLeafIds}
        onToggleChecked={onToggleChecked}
      />
      <LayoutTree
        node={node.second}
        path={[...path, 'second']}
        box={secondBox}
        root={root}
        paneSlots={paneSlots}
        stage={stage}
        transitionStyle={transitionStyle}
        resolveTextSizes={resolveTextSizes}
        onEditSlide={onEditSlide}
        onDropImage={onDropImage}
        defaultPaneLanguage={defaultPaneLanguage}
        editingFocus={editingFocus}
        transitionDuration={transitionDuration}
        reducedMotion={reducedMotion}
        onLiveChange={onLiveChange}
        onCommit={onCommit}
        onLiveChangeMulti={onLiveChangeMulti}
        onCommitMulti={onCommitMulti}
        allDividers={allDividers}
        onBorderClick={onBorderClick}
        gridTransition={gridTransition}
        selectedLeafId={selectedLeafId}
        onSplitPane={onSplitPane}
        onSplitFour={onSplitFour}
        disableSplitOnTouch={disableSplitOnTouch}
        onClearPane={onClearPane}
        onDeletePane={onDeletePane}
        canDelete={canDelete}
        onTogglePaneLock={onTogglePaneLock}
        enteringGrowth={enteringGrowth}
        newsSlots={newsSlots}
        stageTick={stageTick}
        onRequestStageAdvance={onRequestStageAdvance}
        selectedLeafIds={selectedLeafIds}
        onToggleChecked={onToggleChecked}
      />
      {onLiveChange && onCommit && !dividerLocked && (
        <SplitLayoutDivider
          orientation={orientation}
          value={node.ratio}
          containerRef={containerRef}
          onLiveChange={(ratio) => onLiveChange(path, ratio)}
          onCommit={(ratio) => onCommit(path, ratio)}
          snapTargets={snapTargets}
          onBorderClick={onBorderClick}
        />
      )}
      {!dividerLocked &&
        (merged
          ? cornerHandle('merged', (node.first as Extract<LayoutNode, { type: 'split' }>).ratio, [
              [...path, 'first'],
              [...path, 'second'],
            ])
          : [
              firstQualifies && cornerHandle('first', (node.first as Extract<LayoutNode, { type: 'split' }>).ratio, [[...path, 'first']]),
              secondQualifies && cornerHandle('second', (node.second as Extract<LayoutNode, { type: 'split' }>).ratio, [[...path, 'second']]),
            ])}
    </div>
  )
}
