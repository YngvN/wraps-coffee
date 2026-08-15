import type { CSSProperties } from 'react'
import type { PaneEdge, Rect } from '../../utils/layoutGeometry'
import { collapsedClipPath } from './paneGrowthMotion'

/**
 * How one pane's geometry differs between two arrangements, and therefore which of three mechanisms
 * moves it — cheapest sufficient one per pane, rather than one mechanism for all of them:
 *
 *  - `'unchanged'` — no style is written for this pane **at all**. Not an identity transform: an
 *    identity transform is still a style write and still invalidates. On a real restructure most
 *    panes land here.
 *  - `'move'` — same size, different position. A `translate3d` start pose, animated away. No layout,
 *    no paint, entirely on the compositor. This is the common case in a restructure and is
 *    effectively free.
 *  - `'resize'` — the size changed, so the pane genuinely has to be laid out at intermediate sizes
 *    (see `paneResizeStartRect` for why the cheaper clip-based trick cannot cover this case).
 *  - `'enter'` — the pane exists only in the new arrangement; it grows in from an edge.
 */
export type PaneRectChange = 'unchanged' | 'move' | 'resize' | 'enter'

/**
 * How far a pane's rect has to actually change before it's worth animating at all, in percentage
 * points of the arrangement along either axis.
 *
 * Same reasoning as `NEGLIGIBLE_DIVIDER_MOVE_PERCENT`, applied per pane rather than per divider:
 * paying a whole animation's worth of frames to move a pane a distance the eye can't resolve is pure
 * waste, and on a dense stage it's that waste multiplied by every pane on screen.
 */
export const NEGLIGIBLE_PANE_MOVE_PERCENT = 2

/** The container's own pixel size — needed because a CSS `translate` percentage resolves against the *element's* own box, not its container's, so a rect delta expressed in arrangement-percent has to be converted to px to be usable as a transform. */
export interface ContainerSize {
  width: number
  height: number
}

/** What a pane needs on the one frame before its animation starts: either a `style` pose to animate away from, or a `rect` to start the animation *at* (see `PaneRectChange`). */
export interface PaneStartPose {
  change: PaneRectChange
  style?: CSSProperties
  rect?: Rect
}

/** Whether the two rects differ enough along either axis to be worth animating. */
function differs(a: number, b: number): boolean {
  return Math.abs(a - b) >= NEGLIGIBLE_PANE_MOVE_PERCENT
}

/**
 * Classifies a pane's change between two arrangements and returns the start pose that animates it —
 * or `null` for a pane that didn't meaningfully move, which callers must treat as "write no style for
 * this pane at all".
 *
 * **On why a resize animates `left`/`top`/`width`/`height` rather than a clip-and-reveal.** The
 * cheaper idea is to size the pane to its destination immediately (one content layout instead of one
 * per frame) and animate a `clip-path` window plus a `transform` to reveal it. That genuinely works
 * for a pane that's *growing*. It cannot work for one that's *shrinking*, and the reason is
 * structural rather than a tuning problem: the pane's box is already the smaller, destination size,
 * so there is nothing outside it left to reveal — every inset needed to depict the pane's older,
 * larger footprint is negative, clamps to zero, and yields an identity pose. Measured on the fixture,
 * that is exactly what happened: shrinking panes took their new size in a single frame while the
 * border between them glided, which reads worse than either a clean snap or a clean glide, and showed
 * up as a large `brdr` (border-versus-pane-edge) error in the audit.
 *
 * Depicting a shrink instead needs the pane laid out at its *old*, larger size for the duration —
 * which reintroduces a layout at a non-final size and ends with the content re-flowing in one jump at
 * the very moment the animation completes. Between paying for intermediate layouts smoothly and
 * paying for one abrupt reflow at the end, the smooth one is both simpler and better-looking, and the
 * kiosk measurements say its cost is not where the real expense of a stage transition lives anyway.
 *
 * The cheap mechanisms are kept exactly where they *are* sufficient: a pure move never changes size,
 * so it stays a compositor-only `translate3d`, and an entering pane has no old size to honour, so it
 * keeps the existing `clip-path` grow-in.
 */
export function paneRectMotion(from: Rect, to: Rect, container: ContainerSize): PaneStartPose | null {
  if (container.width <= 0 || container.height <= 0) return null

  const moved = differs(from.x, to.x) || differs(from.y, to.y)
  const resized = differs(from.width, to.width) || differs(from.height, to.height)
  if (!moved && !resized) return null

  if (resized) return { change: 'resize', rect: from }

  const dx = ((from.x - to.x) / 100) * container.width
  const dy = ((from.y - to.y) / 100) * container.height
  return { change: 'move', style: { transform: `translate3d(${dx}px, ${dy}px, 0)` } }
}

/** The start pose for a pane that exists only in the *new* arrangement — the existing grow-in (see `collapsedClipPath`), reused verbatim so a pane appearing looks identical whether it got there via this path or via `LayoutPane`'s own Framer Motion entrance. `'fade'` has no edge to collapse against, so it fades instead. */
export function paneEnterMotion(edge: PaneEdge | 'fade'): PaneStartPose {
  return { change: 'enter', style: edge === 'fade' ? { opacity: 0 } : { clipPath: collapsedClipPath(edge) } }
}
