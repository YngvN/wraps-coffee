import type { LayoutNode, PaneId, ScreenSlot, SplitDirection, StageTimeline } from '../types/screen'
import { CENTER_RATIO } from './screenLayout'

/** A brand-new, never-reused pane id. */
function generatePaneId(): PaneId {
  return `pane-${crypto.randomUUID()}`
}

/** A fresh leaf node + the id it was given, for seeding a brand-new screen/pane. */
export function createLeaf(): { node: LayoutNode; id: PaneId } {
  const id = generatePaneId()
  return { node: { type: 'leaf', id }, id }
}

/** Finds the node with `id`, or `undefined` if it's not anywhere in `root`. */
export function findNode(root: LayoutNode, id: PaneId): LayoutNode | undefined {
  if (root.type === 'leaf') return root.id === id ? root : undefined
  return findNode(root.first, id) ?? findNode(root.second, id)
}

/** The root-to-leaf chain of nodes leading to `id` (root first, the leaf itself last), or `undefined` if `id` isn't in `root` at all — used to walk a leaf's ancestor `split` nodes (see `paneResizableAxes`/`paneDefaultSlideDirection` in `screenLayout.ts`). */
export function findLeafPath(root: LayoutNode, id: PaneId): LayoutNode[] | undefined {
  if (root.type === 'leaf') return root.id === id ? [root] : undefined
  const throughFirst = findLeafPath(root.first, id)
  if (throughFirst) return [root, ...throughFirst]
  const throughSecond = findLeafPath(root.second, id)
  if (throughSecond) return [root, ...throughSecond]
  return undefined
}

/** Every leaf in `root`, in-order (first-then-second) — the same left-to-right/top-to-bottom visual order a fixed slot tuple used to have, so tab bars/preview icons keep a stable, predictable order. */
export function listLeaves(root: LayoutNode): Extract<LayoutNode, { type: 'leaf' }>[] {
  if (root.type === 'leaf') return [root]
  return [...listLeaves(root.first), ...listLeaves(root.second)]
}

/** How many leaves (visible panes) `root` has. */
export function countLeaves(root: LayoutNode): number {
  return listLeaves(root).length
}

/** Deep-copies every `StageTimeline` field of `slot` so the copy shares no object identity with the original and can diverge independently going forward (used when splitting a pane — see `splitLeaf`). */
export function cloneSlot(slot: ScreenSlot): ScreenSlot {
  return {
    content: { ...slot.content },
    backgroundColor: { ...slot.backgroundColor },
    backgroundImage: { ...slot.backgroundImage },
    textSizes: { ...slot.textSizes },
    ...(slot.language ? { language: { ...slot.language } } : {}),
  }
}

/** A brand-new, empty pane. */
export function emptySlot(): ScreenSlot {
  return { content: {}, backgroundColor: {}, backgroundImage: {}, textSizes: {} }
}

/** Replaces the node with `id` inside `root` with `replacement` — a pure structural substitution, every other node (including sibling subtrees) kept as the exact same object reference. Returns `root` unchanged if `id` isn't found. */
function replaceNode(root: LayoutNode, id: PaneId, replacement: LayoutNode): LayoutNode {
  if (root.type === 'leaf') return root.id === id ? replacement : root
  if (findNode(root.first, id)) return { ...root, first: replaceNode(root.first, id, replacement) }
  if (findNode(root.second, id)) return { ...root, second: replaceNode(root.second, id, replacement) }
  return root
}

/**
 * Splits the leaf `leafId` into two: the original id (kept, so it stays
 * valid anywhere else it's referenced — `editingFocus`, other stages'
 * trees) and a fresh id for the new pane. `edge` decides which side the new
 * pane lands on ('start': new pane first/top-left; 'end': new pane
 * second/bottom-right), matching whichever third of the pane was hovered.
 * Always an even 50/50 split — deliberately not cursor-position-seeded, so
 * the hover-preview line (always shown dead-center, see `PaneSplitZones`)
 * matches exactly where the split actually lands. Both leaves' own content
 * is left for the caller to populate in `paneSlots` — this only returns
 * the new *shape*; the caller is expected to write `paneSlots[newPaneId] =
 * cloneSlot(paneSlots[leafId])` (duplicating content into both halves) as
 * part of the same atomic patch.
 */
export function splitLeaf(root: LayoutNode, leafId: PaneId, axis: SplitDirection, edge: 'start' | 'end'): { tree: LayoutNode; newPaneId: PaneId } {
  const newPaneId = generatePaneId()
  const originalLeaf: LayoutNode = { type: 'leaf', id: leafId }
  const newLeaf: LayoutNode = { type: 'leaf', id: newPaneId }
  const ratio = CENTER_RATIO
  const split: LayoutNode = {
    type: 'split',
    direction: axis,
    ratio,
    first: edge === 'start' ? newLeaf : originalLeaf,
    second: edge === 'start' ? originalLeaf : newLeaf,
  }
  return { tree: replaceNode(root, leafId, split), newPaneId }
}

/**
 * Deletes the leaf `leafId` — finds its parent `split` node and replaces
 * that whole parent (in *its* own parent) with the leaf's sibling subtree,
 * structurally unchanged (same ids, same nested splits, same ratios). A
 * pure splice: the sibling subtree is never touched, which is exactly why
 * its own grid cell can animate smoothly into the freed space (see
 * `LayoutTree.tsx`'s `layout` + stable-`key` convention) instead of a
 * bespoke "delete" animation. Returns `null` if `leafId` is the tree's only
 * node — deleting the last pane is a no-op.
 */
export function deleteLeaf(root: LayoutNode, leafId: PaneId): LayoutNode | null {
  if (root.type === 'leaf') return root.id === leafId ? null : root

  if (root.first.type === 'leaf' && root.first.id === leafId) return root.second
  if (root.second.type === 'leaf' && root.second.id === leafId) return root.first

  if (findNode(root.first, leafId)) {
    const nextFirst = deleteLeaf(root.first, leafId)
    return nextFirst ? { ...root, first: nextFirst } : root.second
  }
  if (findNode(root.second, leafId)) {
    const nextSecond = deleteLeaf(root.second, leafId)
    return nextSecond ? { ...root, second: nextSecond } : root.first
  }
  return root
}

/** Every leaf id anywhere across every one of `layout`'s own per-stage checkpoints — used e.g. to know which `paneSlots` entries are still reachable from at least one stage. */
export function allReferencedPaneIds(layout: StageTimeline<LayoutNode>): Set<PaneId> {
  const ids = new Set<PaneId>()
  for (const tree of Object.values(layout)) {
    for (const leaf of listLeaves(tree)) ids.add(leaf.id)
  }
  return ids
}
