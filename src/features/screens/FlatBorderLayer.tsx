import { useEffect, useMemo, useState } from 'react'
import type { LayoutNode, PaneId, ScreenSlot } from '../../types/screen'
import { computeLayoutGeometry, type Rect } from '../../utils/layoutGeometry'
import { listLeaves } from '../../utils/layoutTree'
import { nodeAtPath, pathKey, type NodePath } from '../../utils/screenLayout'
import { subtreeGroupId } from '../../utils/screenStages'
import { SLOT_BORDER_THICKNESS_PX, SplitBorderLine } from './SplitBorderLine'

interface FlatBorderLayerProps {
  /** The arrangement to draw borders for — the same tree `FlatPaneLayer` is placing panes from, so the two can never disagree about where an edge is. */
  node: LayoutNode
  paneSlots: Record<PaneId, ScreenSlot>
  stage: number
  contentPhase: 'idle' | 'exiting' | 'holding'
  reducedMotion: boolean | null
}

/** Where each of the new arrangement's borders should *start* from, plus which of them therefore have something to glide. */
interface BorderStart {
  /** Divider `pathKey` → the 0-100 position it should be painted at for one frame before animating. */
  starts: Record<string, number>
}

/**
 * Every visible line between panes, for the flat pane layer — one `SplitBorderLine` per entry in
 * `computeLayoutGeometry(node).dividers`, drawn once against the whole arrangement.
 *
 * Borders come out of the flat model far simpler than they were: `dividers` already carries each
 * line's `{axis, position, start, end}`, so a border is just a segment straddling a known boundary —
 * no `gap` to fill, no per-nesting-level container to be measured against, and, unlike the nested-grid
 * path, no way for the line and the track edge it's supposed to sit on to disagree, since both are
 * read from the same geometry rather than kept in sync by hand.
 *
 * What still needs deciding per transition is where each line *comes from*, and the answer is the same
 * deterministic rule the panes use: a border belongs on the boundary between two panes, so it starts
 * wherever that boundary was. For a divider that already existed, that's simply its own old position.
 * For one a restructure just created, it's the edge of whichever neighbouring pane *did* exist — which
 * is what makes a brand-new divider appear to open out of the pane it split, rather than pop into
 * existence at its final position while the panes either side of it are still moving. That popping is
 * exactly what the audit's `brdr` (border-versus-pane-edge) metric measures, and it is the whole
 * reason this is computed rather than left to the simpler "new borders don't animate" rule.
 */
export function FlatBorderLayer({ node, paneSlots, stage, contentPhase, reducedMotion }: FlatBorderLayerProps) {
  const dividers = useMemo(() => computeLayoutGeometry(node).dividers, [node])

  /**
   * The one-frame start positions for the transition in flight (`null` at rest), and the set of
   * borders that therefore have a glide in progress. Derived synchronously during the render the tree
   * actually changes on and released two frames later — the same pattern, for the same reason, as
   * `FlatPaneLayer`'s own start poses: a browser needs to have painted a "from" before it has
   * anything to animate away from.
   */
  const [prevNode, setPrevNode] = useState<LayoutNode>(node)
  const [pending, setPending] = useState<BorderStart | null>(null)
  const [gliding, setGliding] = useState<Set<string>>(() => new Set())
  if (prevNode !== node) {
    const next = computeBorderStarts(prevNode, node, reducedMotion)
    setPrevNode(node)
    setPending(next)
    setGliding(new Set(next ? Object.keys(next.starts) : []))
  }

  useEffect(() => {
    if (!pending) return
    let inner = 0
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setPending(null))
    })
    return () => {
      cancelAnimationFrame(outer)
      if (inner) cancelAnimationFrame(inner)
    }
  }, [pending])

  return (
    <>
      {dividers.map((divider) => {
        const key = pathKey(divider.path)
        // A split whose two sides both resolve to the same "Group" deliberately shows no seam at all.
        // In the flat path that needs nothing beyond not drawing the line: the panes either side
        // already meet exactly, and each already paints that group's own shared background itself, so
        // there's no `gap` left to close and no split-level background to recolour.
        const splitNode = nodeAtPath(node, divider.path)
        if (splitNode.type === 'split') {
          const firstGroupId = subtreeGroupId(splitNode.first, paneSlots, stage)
          if (firstGroupId && firstGroupId === subtreeGroupId(splitNode.second, paneSlots, stage)) return null
        }
        const start = pending?.starts[key]
        const isGliding = gliding.has(key)
        return (
          <SplitBorderLine
            key={key}
            direction={divider.axis === 'x' ? 'row' : 'column'}
            share={start ?? divider.position}
            span={{ start: divider.start, end: divider.end }}
            thickness={SLOT_BORDER_THICKNESS_PX}
            // A gliding border must stay fully drawn throughout — it *is* the thing showing the
            // geometry moving. One with nowhere to come from keeps the existing shrink-away-while-the-
            // content-leaves treatment, so it isn't left hanging in mid-air over a changing layout.
            visible={isGliding || contentPhase !== 'exiting'}
            reducedMotion={Boolean(reducedMotion)}
            // No transition on the frame the start position itself is painted — that frame *is* the
            // "from", and transitioning into it would animate the wrong half of the move.
            glide={isGliding && !pending}
          />
        )
      })}
    </>
  )
}

/**
 * Where every border in `to` should start from, given the arrangement was `from` a moment ago.
 *
 * A divider that exists in both is easy — its own old position. For one that's genuinely new, the
 * rule is "wherever the boundary it represents used to be": take the leaves now on its `first` side
 * that were already on screen and use the far edge of the region they occupied; failing that, the
 * leaves on its `second` side and their near edge. A divider with *no* surviving neighbour on either
 * side is dividing two regions that are both brand new, so there is no old boundary to name and it
 * gets no glide at all.
 */
function computeBorderStarts(from: LayoutNode, to: LayoutNode, reducedMotion: boolean | null): BorderStart | null {
  if (reducedMotion) return null
  const oldRects = new Map(computeLayoutGeometry(from).leaves.map((leaf) => [leaf.id, leaf.rect] as const))
  const oldDividers = new Map(computeLayoutGeometry(from).dividers.map((divider) => [pathKey(divider.path), divider] as const))
  const starts: Record<string, number> = {}

  /** The extent, along `axis`, of the leaves under `side` that were already on screen — `null` if none of them were. */
  const survivingExtent = (side: LayoutNode, axis: 'x' | 'y'): { near: number; far: number } | null => {
    const rects = listLeaves(side)
      .map((leaf) => oldRects.get(leaf.id))
      .filter((rect): rect is Rect => rect !== undefined)
    if (rects.length === 0) return null
    const near = Math.min(...rects.map((rect) => (axis === 'x' ? rect.x : rect.y)))
    const far = Math.max(...rects.map((rect) => (axis === 'x' ? rect.x + rect.width : rect.y + rect.height)))
    return { near, far }
  }

  for (const divider of computeLayoutGeometry(to).dividers) {
    const key = pathKey(divider.path)
    const previous = oldDividers.get(key)
    if (previous && previous.axis === divider.axis) {
      starts[key] = previous.position
      continue
    }
    const splitNode = nodeAtPath(to, divider.path as NodePath)
    if (splitNode.type !== 'split') continue
    const firstSide = survivingExtent(splitNode.first, divider.axis)
    if (firstSide) {
      starts[key] = firstSide.far
      continue
    }
    const secondSide = survivingExtent(splitNode.second, divider.axis)
    if (secondSide) starts[key] = secondSide.near
  }

  return Object.keys(starts).length > 0 ? { starts } : null
}
