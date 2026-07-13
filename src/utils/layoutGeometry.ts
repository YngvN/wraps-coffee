import type { LayoutNode, PaneId } from '../types/screen'
import { resolveRatio } from './screenLayout'

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

/** The full 0-100 box a tree's own root node fills. */
export const FULL_BOX: Rect = { x: 0, y: 0, width: 100, height: 100 }

export interface LayoutGeometry {
  leaves: { id: PaneId; rect: Rect }[]
  /** One segment per `split` node walked — its own local divider line, in the same 0-100 space as `leaves`. */
  dividers: BorderSegment[]
}

/**
 * Walks `node` exactly like `LayoutTree.tsx` renders it, in one pass,
 * proportionally subdividing `box` (defaults to the whole arrangement,
 * `FULL_BOX`) using each split's own real `ratio` — collecting every
 * leaf's own rect *and* every split's own divider as a line segment, which
 * nothing else in this codebase currently computes. This is the shared
 * geometric source of truth behind both `LayoutIcon`'s preview rects and
 * `src/utils/paneGrowth.ts`'s border-selection algorithm.
 */
export function computeLayoutGeometry(node: LayoutNode, box: Rect = FULL_BOX): LayoutGeometry {
  if (node.type === 'leaf') return { leaves: [{ id: node.id, rect: box }], dividers: [] }

  const share = resolveRatio(node) / 100
  if (node.direction === 'row') {
    const firstWidth = box.width * share
    const dividerX = box.x + firstWidth
    const first = computeLayoutGeometry(node.first, { ...box, width: firstWidth })
    const second = computeLayoutGeometry(node.second, { ...box, x: dividerX, width: box.width - firstWidth })
    return {
      leaves: [...first.leaves, ...second.leaves],
      dividers: [{ axis: 'x', position: dividerX, start: box.y, end: box.y + box.height }, ...first.dividers, ...second.dividers],
    }
  }

  const firstHeight = box.height * share
  const dividerY = box.y + firstHeight
  const first = computeLayoutGeometry(node.first, { ...box, height: firstHeight })
  const second = computeLayoutGeometry(node.second, { ...box, y: dividerY, height: box.height - firstHeight })
  return {
    leaves: [...first.leaves, ...second.leaves],
    dividers: [{ axis: 'y', position: dividerY, start: box.x, end: box.x + box.width }, ...first.dividers, ...second.dividers],
  }
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
