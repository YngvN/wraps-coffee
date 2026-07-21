import type { LayoutNode, PaneId, SlideTransitionDirection, SplitDirection } from '../types/screen'
import { findLeafPath } from './layoutTree'

/** A step from a `split` node to one of its two children. */
export type NodeStep = 'first' | 'second'

/** A root-to-node path — `[]` means the root node itself. Stable for the lifetime of one render/drag gesture (tree shape doesn't change mid-drag, only ratios); re-derived fresh after every committed structural edit. */
export type NodePath = NodeStep[]

/** A `NodePath` serialized to a string key, for use in a `RatioPatch`/`Record`. */
export function pathKey(path: NodePath): string {
  return path.join('.')
}

function pathFromKey(key: string): NodePath {
  return key === '' ? [] : (key.split('.') as NodePath)
}

/** One or more split nodes' new ratio values at once, keyed by `pathKey` — a single-divider drag only ever touches one. */
export type RatioPatch = Record<string, number>

/** Never let a pane collapse to nothing (or swallow its neighbor) — dragging clamps to this range. */
export const MIN_RATIO = 10
export const MAX_RATIO = 90

export function clampRatio(value: number): number {
  return Math.min(MAX_RATIO, Math.max(MIN_RATIO, value))
}

/** Dead center — the value a divider takes at an even 50/50 split. */
export const CENTER_RATIO = 50
/** How close (in percentage points) a value needs to get to another snap target (dead-center, or another divider's current position — see `dividerPositionToRatio`) before it magnetically locks to it exactly — deliberately tight, so the snap only catches a drag that's already landing right around the target rather than pulling in anything nearby. */
const SNAP_THRESHOLD = 1.5

/** Converts a raw on-screen position (e.g. from a pointer drag) into the value to write to a split node's own `ratio` — clamped, and magnetically snapped to dead-center or, if given, any other divider's current position once close (see `SNAP_THRESHOLD`). Used for a continuous pointer drag, where the position is always freshly computed from the real cursor coordinates each frame, so there's no risk of "trapping" further movement: physically dragging the pointer farther away re-escapes every snap zone on its own. Unlike the old fixed-shape model, a tree node's `ratio` is always literally "first child's own share," so no inversion is ever needed — child order in the tree is what used to need an `inverted` flag. */
export function dividerPositionToRatio(position: number, otherPositions: number[] = []): number {
  const clamped = clampRatio(position)
  const target = [CENTER_RATIO, ...otherPositions].find((candidate) => Math.abs(clamped - candidate) <= SNAP_THRESHOLD)
  return target ?? clamped
}

/** The node at `path` within `root` — `path` must be valid (every intermediate node must be a `split`). */
export function nodeAtPath(root: LayoutNode, path: NodePath): LayoutNode {
  let node = root
  for (const step of path) {
    if (node.type !== 'split') return node
    node = node[step]
  }
  return node
}

/** Returns a copy of `root` with the split node at `path` given a new `ratio` — every other node kept as the exact same object reference. No-op if the node at `path` isn't a `split`. */
export function setRatioAtPath(root: LayoutNode, path: NodePath, ratio: number): LayoutNode {
  if (path.length === 0) return root.type === 'split' ? { ...root, ratio: clampRatio(ratio) } : root
  if (root.type !== 'split') return root
  const [step, ...rest] = path
  return { ...root, [step]: setRatioAtPath(root[step], rest, ratio) }
}

/** Applies every entry of a `RatioPatch` to `tree` at once — used to layer a live, never-persisted override (a `resizeToFit` image's own pane-fit, or a divider actively being dragged) on top of the real resolved-for-this-stage tree, for read/render purposes only. */
export function applyLiveRatioOverrides(tree: LayoutNode, overrides: RatioPatch): LayoutNode {
  let next = tree
  for (const [key, value] of Object.entries(overrides)) next = setRatioAtPath(next, pathFromKey(key), value)
  return next
}

/** A `split` node's own resolved ratio, clamped (falls back to dead-center if somehow missing). */
export function resolveRatio(node: Extract<LayoutNode, { type: 'split' }>): number {
  return clampRatio(node.ratio ?? CENTER_RATIO)
}

/** CSS grid-template for one `split` node's own 2-cell nested grid — `'row'` (side by side) sizes columns, `'column'` (stacked) sizes rows. Each `split` node in the tree gets its own call to this, right where its own nested grid is rendered (see `LayoutTree.tsx`) — there's no single whole-screen "grid template" anymore, since the arrangement is no longer one flat shape. */
export function nodeGridTemplate(node: Extract<LayoutNode, { type: 'split' }>): { gridTemplateColumns?: string; gridTemplateRows?: string } {
  const share = resolveRatio(node)
  const track = `${share}% ${100 - share}%`
  return node.direction === 'row' ? { gridTemplateColumns: track } : { gridTemplateRows: track }
}

/** One `split` ancestor of a leaf, on the root-to-leaf path — which child ('first'/'second') the leaf descends through, and that ancestor's own path (for `pathKey`/`setRatioAtPath`). Ordered root-to-leaf; the *last* entry is nearest the leaf. */
interface AncestorStep {
  path: NodePath
  direction: SplitDirection
  /** Whether the leaf descends through this ancestor's `first` child (vs. `second`). */
  throughFirst: boolean
}

function ancestorSteps(root: LayoutNode, leafId: PaneId): AncestorStep[] {
  const path = findLeafPath(root, leafId)
  if (!path) return []
  const steps: AncestorStep[] = []
  let currentPath: NodePath = []
  for (let i = 0; i < path.length - 1; i++) {
    const node = path[i]
    if (node.type !== 'split') continue
    const throughFirst = node.first === path[i + 1]
    steps.push({ path: currentPath, direction: node.direction, throughFirst })
    currentPath = [...currentPath, throughFirst ? 'first' : 'second']
  }
  return steps
}

function nearestAncestor(steps: AncestorStep[], direction: SplitDirection): AncestorStep | undefined {
  for (let i = steps.length - 1; i >= 0; i--) if (steps[i].direction === direction) return steps[i]
  return undefined
}

/** One axis (width or height) a pane can actually be resized along — the path to the `split` node governing it, and whether the pane's own share is that node's raw `ratio` or its complement (`100 -` it). */
export interface PaneAxis {
  path: NodePath
  isFirstShare: boolean
}

/** Which axis (or axes) of a pane's own box are governed by an adjustable divider at all — the other axis (if any) is always fixed to the full container edge-to-edge, so it's simply omitted rather than forced to some value. */
export interface PaneResizableAxes {
  width?: PaneAxis
  height?: PaneAxis
}

/**
 * Which divider(s) actually govern `leafId`'s own width/height, within
 * `root`'s current tree shape — a leaf's *nearest* row-direction ancestor
 * governs its width, its *nearest* column-direction ancestor governs its
 * height (a leaf borders exactly one sibling per axis, from whichever
 * ancestor of that axis-type is nearest on its own root-to-leaf path —
 * farther ancestors on the same axis border the sibling *subtree*, not
 * this leaf directly). Used by `mediaResizeRatioPatch` to know which axis
 * (or axes) of a pane can be resized to fit an image or video at all.
 */
export function paneResizableAxes(root: LayoutNode, leafId: PaneId): PaneResizableAxes {
  const steps = ancestorSteps(root, leafId)
  const row = nearestAncestor(steps, 'row')
  const column = nearestAncestor(steps, 'column')
  return {
    width: row ? { path: row.path, isFirstShare: row.throughFirst } : undefined,
    height: column ? { path: column.path, isFirstShare: column.throughFirst } : undefined,
  }
}

/**
 * The slide-in/out direction a pane's own rotation should use by default, so
 * it only ever enters/exits through an actual screen edge and never through
 * a border it shares with a neighboring pane. A leaf's nearest row-ancestor
 * (if any) leaves exactly one of left/right free — the other is bordered by
 * its sibling; likewise up/down for its nearest column-ancestor. Prefers the
 * free horizontal edge as a consistent tie-break when both axes have an
 * ancestor (matching this function's own previous fixed-shape behavior),
 * falling back to the free vertical edge if only a column-ancestor exists,
 * and to `'right'` for a root leaf with no ancestors at all (the whole
 * screen, one pane, no neighbor on any side).
 */
export function paneDefaultSlideDirection(root: LayoutNode, leafId: PaneId): SlideTransitionDirection {
  const steps = ancestorSteps(root, leafId)
  const row = nearestAncestor(steps, 'row')
  if (row) return row.throughFirst ? 'left' : 'right'
  const column = nearestAncestor(steps, 'column')
  if (column) return column.throughFirst ? 'up' : 'down'
  return 'right'
}

/** The default fraction of the screen's own viewport (standing in for `containerWidth`/`containerHeight`, since an arrangement always fills it entirely) a slide's own `resizeToFit` image/video box is fit within, along either axis, until its own `resizeScale` says otherwise. */
export const MEDIA_RESIZE_MAX_VIEWPORT_FRACTION = 0.4

/** The range a `resizeToFit` image/video's own `resizeScale` is clamped to — same 10-90% band a divider is clamped to (`MIN_RATIO`/`MAX_RATIO`), expressed as a fraction instead of a percentage, so dragging its box's border can shrink or grow it but never collapse it to nothing or blow it out past the arrangement's own bounds. */
export const MIN_MEDIA_RESIZE_SCALE = MIN_RATIO / 100
export const MAX_MEDIA_RESIZE_SCALE = MAX_RATIO / 100

export function clampMediaResizeScale(scale: number): number {
  return Math.min(MAX_MEDIA_RESIZE_SCALE, Math.max(MIN_MEDIA_RESIZE_SCALE, scale))
}

/** Fits a `naturalWidth`x`naturalHeight` box within `maxWidth`x`maxHeight`, preserving aspect ratio and never exceeding either bound — the same math as CSS `object-fit: contain`. */
export function fitMediaBox(naturalWidth: number, naturalHeight: number, maxWidth: number, maxHeight: number): { width: number; height: number } {
  if (naturalWidth <= 0 || naturalHeight <= 0 || maxWidth <= 0 || maxHeight <= 0) return { width: maxWidth, height: maxHeight }
  const aspectRatio = naturalWidth / naturalHeight
  let width = maxWidth
  let height = width / aspectRatio
  if (height > maxHeight) {
    height = maxHeight
    width = height * aspectRatio
  }
  return { width, height }
}

/** A resizable axis's own *current* local share (0-100, already complemented for a `!isFirstShare` pane) — `resolveRatio` of the split node at `axis.path` itself, or `axis.isFirstShare`'s complement. Falls back to 50 for a malformed path (shouldn't happen — `axis.path` always comes from `paneResizableAxes`, which only ever points at a real `split` node). */
function currentLocalSharePercent(root: LayoutNode, axis: PaneAxis): number {
  const node = nodeAtPath(root, axis.path)
  if (node.type !== 'split') return CENTER_RATIO
  const ratio = resolveRatio(node)
  return axis.isFirstShare ? ratio : 100 - ratio
}

/**
 * The ratio overrides that resize `leafId`'s own pane to fit an image or
 * video of `naturalWidth`x`naturalHeight`, capped at `scale` (falling back
 * to `MEDIA_RESIZE_MAX_VIEWPORT_FRACTION`, its own default until dragged to
 * something else — see `ScreenSlotContent.resizeScale`) of the
 * arrangement's own `containerWidth`x`containerHeight` — meant to be
 * applied live (never persisted) while that pane's currently-showing slide
 * is an image or video with `resizeToFit` on, and dropped the instant it
 * isn't (see `SplitLayout`), which is what lets it slide back to the pane's
 * own set size on its own, the same transition a manual resize already
 * animates with.
 *
 * `currentLeafRect` is `leafId`'s own *current* resolved box, in the same
 * 0-100-of-the-whole-screen percentage space `computeLayoutGeometry`
 * returns (see `SplitLayout`'s own `geometry`) — needed because
 * `axes.width`/`axes.height` (from `paneResizableAxes`) only ever point at
 * the *nearest* same-direction ancestor divider; a pane nested two levels
 * deep along the same axis (e.g. one of three side-by-side panes, built as
 * a row split whose second child is itself another row split) has that
 * nearest divider's own ratio expressed relative to *its own* local
 * container, which is narrower than the full screen by whatever the
 * farther, non-tracked ancestor divider currently has it at. Naively
 * treating a desired *global* share (`box.width` as a fraction of the whole
 * `containerWidth`) as if it were already that *local* ratio sizes the pane
 * wrong the moment such a farther ancestor's own ratio isn't a plain 50/50
 * — `currentLeafRect` is what lets this convert between the two spaces
 * correctly instead.
 */
export function mediaResizeRatioPatch(
  root: LayoutNode,
  leafId: PaneId,
  naturalWidth: number,
  naturalHeight: number,
  containerWidth: number,
  containerHeight: number,
  currentLeafRect: { width: number; height: number },
  scale: number = MEDIA_RESIZE_MAX_VIEWPORT_FRACTION,
): RatioPatch {
  const axes = paneResizableAxes(root, leafId)
  if (!axes.width && !axes.height) return {}
  if (containerWidth <= 0 || containerHeight <= 0) return {}

  const box = fitMediaBox(naturalWidth, naturalHeight, containerWidth * scale, containerHeight * scale)

  const patch: RatioPatch = {}
  if (axes.width) {
    const desiredGlobalShare = clampRatio((box.width / containerWidth) * 100)
    const localShare = currentLocalSharePercent(root, axes.width)
    const share = clampRatio(currentLeafRect.width > 0 ? (desiredGlobalShare * localShare) / currentLeafRect.width : desiredGlobalShare)
    patch[pathKey(axes.width.path)] = axes.width.isFirstShare ? share : 100 - share
  }
  if (axes.height) {
    const desiredGlobalShare = clampRatio((box.height / containerHeight) * 100)
    const localShare = currentLocalSharePercent(root, axes.height)
    const share = clampRatio(currentLeafRect.height > 0 ? (desiredGlobalShare * localShare) / currentLeafRect.height : desiredGlobalShare)
    patch[pathKey(axes.height.path)] = axes.height.isFirstShare ? share : 100 - share
  }
  return patch
}

/**
 * Inverts `mediaResizeRatioPatch`'s own math: given the raw *local* ratio
 * value a pointer drag just computed for one of `leafId`'s own resizable
 * axes (identified by `path`, from `paneResizableAxes`), returns the
 * `resizeScale` that would make `mediaResizeRatioPatch` reproduce that
 * exact value on that axis — used so dragging the border of a pane
 * currently fit to a `resizeToFit` image or video changes that media's own
 * persisted scale instead of writing straight to the tree's own ratio,
 * which is recomputed from the scale every render anyway and would
 * otherwise instantly snap back to wherever the scale already put it.
 * `currentLeafRect` plays the same local-to-global conversion role
 * described in `mediaResizeRatioPatch`'s own doc comment.
 */
export function mediaResizeScaleFromDrag(
  root: LayoutNode,
  leafId: PaneId,
  path: NodePath,
  rawValue: number,
  naturalWidth: number,
  naturalHeight: number,
  containerWidth: number,
  containerHeight: number,
  currentLeafRect: { width: number; height: number },
): number {
  const axes = paneResizableAxes(root, leafId)
  const key = pathKey(path)
  const isWidthAxis = axes.width && pathKey(axes.width.path) === key
  const axis = isWidthAxis ? axes.width : axes.height && pathKey(axes.height.path) === key ? axes.height : undefined
  if (!axis || containerWidth <= 0 || containerHeight <= 0) return MEDIA_RESIZE_MAX_VIEWPORT_FRACTION

  const unscaledBox = fitMediaBox(naturalWidth, naturalHeight, containerWidth, containerHeight)
  const unscaledSharePercent = isWidthAxis ? (unscaledBox.width / containerWidth) * 100 : (unscaledBox.height / containerHeight) * 100
  if (unscaledSharePercent <= 0) return MEDIA_RESIZE_MAX_VIEWPORT_FRACTION

  const draggedLocalShare = axis.isFirstShare ? rawValue : 100 - rawValue
  const currentLocalShare = currentLocalSharePercent(root, axis)
  const currentGlobalShare = isWidthAxis ? currentLeafRect.width : currentLeafRect.height
  const draggedGlobalShare = currentLocalShare > 0 ? (draggedLocalShare * currentGlobalShare) / currentLocalShare : draggedLocalShare

  return clampMediaResizeScale(draggedGlobalShare / unscaledSharePercent)
}
