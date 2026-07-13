import type { LayoutNode, PaneGrowthFallback, PaneId } from '../types/screen'
import { computeLayoutGeometry, containsEdge, rectEdgeSegment, type PaneEdge } from './layoutGeometry'
import { listLeaves } from './layoutTree'

export interface LeafSetDiff {
  appeared: PaneId[]
  disappeared: PaneId[]
}

/** Every leaf id present in `nextTree` but not `previousTree` (`appeared`) or vice versa (`disappeared`) — purely id-based, so it works whether the two trees are related by a single `splitLeaf`/`deleteLeaf` call or are two independently-authored stage checkpoints with an arbitrarily different shape. */
export function diffLeafSets(previousTree: LayoutNode, nextTree: LayoutNode): LeafSetDiff {
  const previousLeafIds = listLeaves(previousTree).map((leaf) => leaf.id)
  const nextLeafIds = listLeaves(nextTree).map((leaf) => leaf.id)
  const previousIds = new Set(previousLeafIds)
  const nextIds = new Set(nextLeafIds)
  return {
    appeared: nextLeafIds.filter((id) => !previousIds.has(id)),
    disappeared: previousLeafIds.filter((id) => !nextIds.has(id)),
  }
}

/**
 * Which of a pane's own edges its "grow in from"/"collapse back into"
 * animation uses (see `resolvePaneGrowthOrigin`): a real internal divider
 * (the common, "logical" case), the screen's own outer boundary (only used
 * when no internal divider qualifies — see `PaneGrowthFallback`), or a
 * plain fade with no directional wipe at all.
 */
export type PaneGrowthOrigin = { kind: 'divider'; edge: PaneEdge } | { kind: 'screenEdge'; edge: PaneEdge } | { kind: 'fade' }

/** Fixed, deterministic tie-break order once length comparisons are exhausted. */
const EDGE_PRIORITY: PaneEdge[] = ['left', 'right', 'top', 'bottom']

function edgeSegmentLength(segment: { start: number; end: number }): number {
  return segment.end - segment.start
}

/**
 * The internal divider (if any) `leafId`'s own box — computed against
 * `existTree` — should visually grow from / collapse into: for each of the
 * leaf's 4 edges, checks whether an internal divider in `goneTree`'s own
 * geometry *contains* that edge's span (see `containsEdge`) — this is the
 * "comes from a border bigger than it, in a logical direction" rule.
 * Screen edges are deliberately excluded here (see `PaneGrowthFallback`'s
 * own doc comment for why) — those are the fallback's own concern, not a
 * qualifying border in their own right. Among multiple qualifying edges,
 * prefers the longest (most major) divider, then `EDGE_PRIORITY` to break
 * remaining ties. `undefined` if no edge qualifies at all.
 *
 * Symmetric by construction for both directions this is used from: for an
 * entrance, `existTree` is the new/current tree and `goneTree` the previous
 * one (so this finds a *pre-existing* divider the new pane's edge now lines
 * up with); for an exit, `existTree` is the tree the leaf was last present
 * in and `goneTree` is the tree with it already removed (so this finds
 * whichever divider *still exists* once the leaf is gone — the freshly
 * vacated edge shared with its own sibling has no counterpart there, and is
 * correctly disqualified without any special-casing).
 */
export function selectGrowthDivider(existTree: LayoutNode, goneTree: LayoutNode, leafId: PaneId): PaneEdge | undefined {
  const leaf = computeLayoutGeometry(existTree).leaves.find((entry) => entry.id === leafId)
  if (!leaf) return undefined
  const goneDividers = computeLayoutGeometry(goneTree).dividers

  let best: { edge: PaneEdge; length: number } | undefined
  for (const edge of EDGE_PRIORITY) {
    const edgeSegment = rectEdgeSegment(leaf.rect, edge)
    const qualifyingDivider = goneDividers.find((divider) => containsEdge(divider, edgeSegment))
    if (!qualifyingDivider) continue
    const length = edgeSegmentLength(qualifyingDivider)
    if (!best || length > best.length) best = { edge, length }
  }
  return best?.edge
}

/** Which of `leafId`'s own edges (computed in `tree`) lie on the screen's outer boundary (position ≈ 0 or 100), in `EDGE_PRIORITY` order — empty if the leaf is fully interior (surrounded by other panes on every side, possible deep in a tree). */
export function touchedScreenEdges(tree: LayoutNode, leafId: PaneId): PaneEdge[] {
  const leaf = computeLayoutGeometry(tree).leaves.find((entry) => entry.id === leafId)
  if (!leaf) return []
  const EPSILON = 0.01
  const onBoundary = (value: number) => value <= EPSILON || value >= 100 - EPSILON
  return EDGE_PRIORITY.filter((edge) => onBoundary(rectEdgeSegment(leaf.rect, edge).position))
}

/**
 * The single entry point both a pane's entrance and its exit animation use
 * — symmetric by construction (see `selectGrowthDivider`'s own doc
 * comment): for an entrance, `existTree` is the new/current tree and
 * `goneTree` the previous one; for an exit, `existTree` is the tree the
 * leaf was last present in and `goneTree` is the tree with it already
 * removed. Tries `selectGrowthDivider` first; if nothing qualifies, applies
 * `fallback` — `'screenEdge'` grows from/collapses into the first of
 * `touchedScreenEdges` (or falls through to `'fade'` if the leaf touches
 * none at all, e.g. a fully interior leaf); `'fade'` always fades, no
 * directional wipe.
 */
export function resolvePaneGrowthOrigin(existTree: LayoutNode, goneTree: LayoutNode, leafId: PaneId, fallback: PaneGrowthFallback): PaneGrowthOrigin {
  const divider = selectGrowthDivider(existTree, goneTree, leafId)
  if (divider) return { kind: 'divider', edge: divider }

  if (fallback === 'screenEdge') {
    const [edge] = touchedScreenEdges(existTree, leafId)
    if (edge) return { kind: 'screenEdge', edge }
  }

  return { kind: 'fade' }
}
