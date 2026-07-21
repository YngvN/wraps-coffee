import type { LayoutNode, PaneId } from '../types/screen'
import { clampRatio, pathKey, resolveRatio, type NodePath, type RatioPatch } from './screenLayout'

/** A rect in 0-100 percentage space — resolution-independent, since a pane arrangement always fills its container edge-to-edge regardless of the container's own real pixel size. */
export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** One border line segment: `axis: 'x'` is a vertical line (a `'row'` split's own divider, or the left/right screen edge) at a fixed x `position`, spanning `start`-`end` along y; `axis: 'y'` is horizontal, fixed y `position`, spanning `start`-`end` along x. Same 0-100 space as `Rect`. */
export interface BorderSegment {
  axis: 'x' | 'y'
  position: number
  start: number
  end: number
}

/** A `BorderSegment` that's actually one `split` node's own divider (as opposed to e.g. `rectEdgeSegment`'s plain pane-edge segments, which have no such node to point to) — `path` is that node's own root-to-node path, letting a consumer (e.g. `LayoutTree.tsx`'s snap-target lookup) identify and exclude "this same divider" from a set of others, since positions alone aren't a stable identity during a live drag. */
export interface Divider extends BorderSegment {
  path: NodePath
}

/** The full 0-100 box a tree's own root node fills. */
export const FULL_BOX: Rect = { x: 0, y: 0, width: 100, height: 100 }

export interface LayoutGeometry {
  leaves: { id: PaneId; rect: Rect }[]
  /** One segment per `split` node walked — its own local divider line, in the same 0-100 space as `leaves`. */
  dividers: Divider[]
}

/**
 * Walks `node` exactly like `LayoutTree.tsx` renders it, in one pass,
 * proportionally subdividing `box` (defaults to the whole arrangement,
 * `FULL_BOX`) using each split's own real `ratio` — collecting every
 * leaf's own rect *and* every split's own divider as a line segment, which
 * nothing else in this codebase currently computes. This is the shared
 * geometric source of truth behind both `LayoutIcon`'s preview rects and
 * `src/utils/paneGrowth.ts`'s border-selection algorithm. `path` is this
 * node's own root-to-node path (`[]` for the root itself) — threaded through
 * purely so each divider segment can report which node it belongs to (see
 * `BorderSegment`).
 */
export function computeLayoutGeometry(node: LayoutNode, box: Rect = FULL_BOX, path: NodePath = []): LayoutGeometry {
  if (node.type === 'leaf') return { leaves: [{ id: node.id, rect: box }], dividers: [] }

  const share = resolveRatio(node) / 100
  if (node.direction === 'row') {
    const firstWidth = box.width * share
    const dividerX = box.x + firstWidth
    const first = computeLayoutGeometry(node.first, { ...box, width: firstWidth }, [...path, 'first'])
    const second = computeLayoutGeometry(node.second, { ...box, x: dividerX, width: box.width - firstWidth }, [...path, 'second'])
    return {
      leaves: [...first.leaves, ...second.leaves],
      dividers: [{ axis: 'x', position: dividerX, start: box.y, end: box.y + box.height, path }, ...first.dividers, ...second.dividers],
    }
  }

  const firstHeight = box.height * share
  const dividerY = box.y + firstHeight
  const first = computeLayoutGeometry(node.first, { ...box, height: firstHeight }, [...path, 'first'])
  const second = computeLayoutGeometry(node.second, { ...box, y: dividerY, height: box.height - firstHeight }, [...path, 'second'])
  return {
    leaves: [...first.leaves, ...second.leaves],
    dividers: [{ axis: 'y', position: dividerY, start: box.x, end: box.x + box.width, path }, ...first.dividers, ...second.dividers],
  }
}

/** Floating-point slack for the rect-touching checks below — ratios accumulate small rounding error over a few nested splits, so an exact `===` would occasionally miss two rects that are visually flush. */
const ADJACENCY_EPSILON = 0.01

/** Whether `a` and `b` share a real edge (not just a corner touch) — either a's right edge sits on b's left edge (or vice versa) with overlapping vertical extent, or the same along the horizontal edges. */
function rectsAreAdjacent(a: Rect, b: Rect): boolean {
  const verticalOverlap = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > ADJACENCY_EPSILON
  const horizontalOverlap = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > ADJACENCY_EPSILON
  const touchingVertically = Math.abs(a.x + a.width - b.x) < ADJACENCY_EPSILON || Math.abs(b.x + b.width - a.x) < ADJACENCY_EPSILON
  const touchingHorizontally = Math.abs(a.y + a.height - b.y) < ADJACENCY_EPSILON || Math.abs(b.y + b.height - a.y) < ADJACENCY_EPSILON
  return (touchingVertically && verticalOverlap) || (touchingHorizontally && horizontalOverlap)
}

/**
 * Whether `leafIds` (2 or more) forms a single contiguous block within
 * `root`'s own current arrangement — every one of them reachable from any
 * other by hopping only between *other selected* leaves that share a real
 * edge (see `rectsAreAdjacent`), with none left isolated off on its own.
 * Geometric (via `computeLayoutGeometry`'s own resolved rects), not a tree-
 * structure guess — two leaves can be direct tree siblings yet not actually
 * touch (e.g. opposite corners of an asymmetric 2x2), or vice versa. Drives
 * whether the toolbar's own "Group" action is enabled for the current
 * checkbox selection (see `ScreenDisplay.tsx`).
 */
export function isContiguousBlock(root: LayoutNode, leafIds: Set<PaneId>): boolean {
  if (leafIds.size < 2) return false
  const rectsById = new Map(computeLayoutGeometry(root).leaves.map((leaf) => [leaf.id, leaf.rect]))
  const selected = [...leafIds].filter((id) => rectsById.has(id))
  if (selected.length !== leafIds.size) return false

  const visited = new Set<PaneId>([selected[0]])
  const queue = [selected[0]]
  while (queue.length > 0) {
    const currentId = queue.pop()!
    const currentRect = rectsById.get(currentId)!
    for (const candidateId of selected) {
      if (visited.has(candidateId)) continue
      if (rectsAreAdjacent(currentRect, rectsById.get(candidateId)!)) {
        visited.add(candidateId)
        queue.push(candidateId)
      }
    }
  }
  return visited.size === selected.length
}

/**
 * Applies `patch` (one or more explicit new ratios, keyed by `pathKey` —
 * see `RatioPatch`) to `tree`, while every *other* split node re-derives its
 * own ratio so its divider's absolute on-screen position (as it was in
 * `oldGeometry`) stays exactly where it was — rather than the plain
 * `setRatioAtPath` behavior of leaving every other node's own `ratio`
 * number untouched, which (since `ratio` is always a percentage of its own
 * *immediate* parent's current box, not of the whole screen) lets a nested
 * divider drift along with its container whenever an ancestor's box is
 * resized, even though its stored ratio never itself changed. Used for
 * every divider drag (see `SplitLayout.tsx`) so dragging one border never
 * visibly drags along an unrelated one nested somewhere inside the side
 * that just got bigger or smaller.
 */
export function applyRatioPatchPreservingDescendants(tree: LayoutNode, patch: RatioPatch, oldGeometry: LayoutGeometry): LayoutNode {
  const oldPositions = new Map(oldGeometry.dividers.map((divider) => [pathKey(divider.path), divider.position]))

  function walk(node: LayoutNode, box: Rect, path: NodePath): LayoutNode {
    if (node.type === 'leaf') return node

    const key = pathKey(path)
    const oldAbsolute = oldPositions.get(key)
    const axisStart = node.direction === 'row' ? box.x : box.y
    const axisSize = node.direction === 'row' ? box.width : box.height
    const ratio =
      key in patch
        ? clampRatio(patch[key])
        : oldAbsolute !== undefined && axisSize > 0
          ? clampRatio(((oldAbsolute - axisStart) / axisSize) * 100)
          : resolveRatio(node)

    const share = ratio / 100
    const [firstBox, secondBox]: [Rect, Rect] =
      node.direction === 'row'
        ? (() => {
            const firstWidth = box.width * share
            return [{ ...box, width: firstWidth }, { ...box, x: box.x + firstWidth, width: box.width - firstWidth }]
          })()
        : (() => {
            const firstHeight = box.height * share
            return [{ ...box, height: firstHeight }, { ...box, y: box.y + firstHeight, height: box.height - firstHeight }]
          })()

    return {
      ...node,
      ratio,
      first: walk(node.first, firstBox, [...path, 'first']),
      second: walk(node.second, secondBox, [...path, 'second']),
    }
  }

  return walk(tree, FULL_BOX, [])
}

/** The four edges of a pane's own rect. */
export type PaneEdge = 'left' | 'right' | 'top' | 'bottom'

/** `rect`'s own edge as a `BorderSegment`, for containment-testing against `computeLayoutGeometry`'s own `dividers` output — left/right are vertical (`axis:'x'`) lines spanning the rect's own height; top/bottom are horizontal (`axis:'y'`) lines spanning its own width. */
export function rectEdgeSegment(rect: Rect, edge: PaneEdge): BorderSegment {
  switch (edge) {
    case 'left':
      return { axis: 'x', position: rect.x, start: rect.y, end: rect.y + rect.height }
    case 'right':
      return { axis: 'x', position: rect.x + rect.width, start: rect.y, end: rect.y + rect.height }
    case 'top':
      return { axis: 'y', position: rect.y, start: rect.x, end: rect.x + rect.width }
    case 'bottom':
      return { axis: 'y', position: rect.y + rect.height, start: rect.x, end: rect.x + rect.width }
  }
}

/** How close two positions/endpoints need to be (in percentage points) to count as "the same line" — real pane geometry is derived from exact percentage math, so this only needs to absorb floating-point rounding, not any real-world imprecision. */
const EPSILON = 0.01

/** Whether `border` fully contains `edge`'s own span: same axis, matching position (epsilon-tolerant), and `border`'s own start/end each at or beyond `edge`'s own. This is the "as big as or bigger than it, in a logical direction" test — a raw length comparison alone can't tell a border that's merely long but sitting at a different position (or only partially overlapping) from one that genuinely spans clear across the edge in question. */
export function containsEdge(border: BorderSegment, edge: BorderSegment): boolean {
  if (border.axis !== edge.axis) return false
  if (Math.abs(border.position - edge.position) > EPSILON) return false
  return border.start <= edge.start + EPSILON && border.end >= edge.end - EPSILON
}
