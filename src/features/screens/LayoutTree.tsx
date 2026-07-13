import { useRef } from 'react'
import type { LanguageCode } from '../../i18n'
import type { LayoutNode, PaneId, ScreenConfig, ScreenSlot, ScreenSlotContent, SplitDirection, TextSizes } from '../../types/screen'
import { nodeGridTemplate, paneDefaultSlideDirection, type NodePath } from '../../utils/screenLayout'
import { LayoutPane } from './LayoutPane'
import { SplitLayoutDivider } from './SplitLayoutDivider'

interface LayoutTreeProps {
  node: LayoutNode
  /** This node's own path from the tree root — `[]` for the root itself. */
  path: NodePath
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
  gridTransition: string | false
  /** Draws a persistent highlight ring around this one pane, if any — see `SplitLayout`'s own doc comment. */
  selectedLeafId?: PaneId
  /** Hover-to-split/clear/delete affordances — see `LayoutPane`'s own props of the same name. `canDelete` (true once `root` has more than one leaf) is computed once by `SplitLayout` and threaded straight through, rather than recomputed at every leaf. */
  onSplitPane?: (leafId: PaneId, axis: SplitDirection, edge: 'start' | 'end') => void
  onClearPane?: (leafId: PaneId) => void
  onDeletePane?: (leafId: PaneId) => void
  canDelete: boolean
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
 */
export function LayoutTree({
  node,
  path,
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
  gridTransition,
  selectedLeafId,
  onSplitPane,
  onClearPane,
  onDeletePane,
  canDelete,
}: LayoutTreeProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  if (node.type === 'leaf') {
    const slot = paneSlots[node.id]
    if (!slot) return null
    const slideDirection = paneDefaultSlideDirection(root, node.id)
    return (
      <LayoutPane
        leafId={node.id}
        slot={slot}
        stage={stage}
        transitionStyle={transitionStyle}
        slideDirection={slideDirection}
        resolveTextSizes={resolveTextSizes}
        onEditSlide={onEditSlide}
        onDropImage={onDropImage}
        defaultPaneLanguage={defaultPaneLanguage}
        editingFocus={editingFocus}
        transitionDuration={transitionDuration}
        reducedMotion={reducedMotion}
        selected={node.id === selectedLeafId}
        onSplitPane={onSplitPane}
        onClearPane={onClearPane}
        onDeletePane={onDeletePane}
        canDelete={canDelete}
      />
    )
  }

  const gridTemplate = { ...nodeGridTemplate(node), ...(!reducedMotion && gridTransition ? { transition: gridTransition } : {}) }
  const orientation = node.direction === 'row' ? 'vertical' : 'horizontal'

  return (
    <div ref={containerRef} className="layout-tree__split" style={gridTemplate}>
      <LayoutTree
        node={node.first}
        path={[...path, 'first']}
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
        gridTransition={gridTransition}
        selectedLeafId={selectedLeafId}
        onSplitPane={onSplitPane}
        onClearPane={onClearPane}
        onDeletePane={onDeletePane}
        canDelete={canDelete}
      />
      <LayoutTree
        node={node.second}
        path={[...path, 'second']}
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
        gridTransition={gridTransition}
        selectedLeafId={selectedLeafId}
        onSplitPane={onSplitPane}
        onClearPane={onClearPane}
        onDeletePane={onDeletePane}
        canDelete={canDelete}
      />
      {onLiveChange && onCommit && (
        <SplitLayoutDivider
          orientation={orientation}
          value={node.ratio}
          containerRef={containerRef}
          onLiveChange={(ratio) => onLiveChange(path, ratio)}
          onCommit={(ratio) => onCommit(path, ratio)}
        />
      )}
    </div>
  )
}
