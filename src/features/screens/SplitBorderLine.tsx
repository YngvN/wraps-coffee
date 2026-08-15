import { motion } from 'framer-motion'
import type { SplitDirection } from '../../types/screen'
import { BORDER_EXIT_DELAY_SECONDS, BORDER_TRANSITION_DURATION_SECONDS, PANE_GROWTH_DURATION_SECONDS } from './paneGrowthMotion'
import './SplitBorderLine.scss'

/** The visible thickness of a slot border, in px — must match `.layout-tree__split`'s own `gap` in `SplitLayout.scss`, which is the space this line is drawn into. */
export const SLOT_BORDER_THICKNESS_PX = 4

interface SplitBorderLineProps {
  /** Which way this split divides — `'row'` (children side by side) draws a vertical line, `'column'` (stacked) a horizontal one. */
  direction: SplitDirection
  /** This split's own resolved ratio, as a percentage — the same `resolveRatio(node)` value `nodeGridTemplate` builds its tracks from (see this component's own doc comment for why that shared source matters). */
  share: number
  /** The gap this line fills, in px — the split grid's own `gap`, so the line covers it exactly. */
  thickness: number
  /** `false` shrinks the line away to nothing; `true` grows it back. Driven by the stage-transition phase (see `SplitLayout.tsx`'s `contentPhase`). */
  visible: boolean
  /** Skips the animation entirely, matching the rest of the layout's own reduced-motion handling. */
  reducedMotion: boolean
  /**
   * The line's own extent along its *cross* axis, in the same 0-100 space as `share` — set only by
   * the flat pane layer (`FlatPaneLayer`/`ENABLE_FLAT_PANE_LAYOUT`), where every border is drawn once
   * against the whole arrangement rather than once per nested grid, so a divider deep in the tree
   * spans only its own region rather than the full screen.
   *
   * Passing it also switches the line from *filling a gap* to *straddling a boundary*: the nested-grid
   * path draws into a real 4px `gap` that begins exactly at the track edge, whereas the flat path's
   * panes tile edge to edge with no gap at all, so the line is centred on the shared edge instead.
   * That difference is why the flat path needs no gap-aware geometry of its own — turning borders off
   * (or grouping a split) simply draws nothing, and the panes already meet exactly where they should.
   */
  span?: { start: number; end: number }
  /** Pass whenever the sibling `.layout-tree__split`'s own grid-template is itself getting a CSS transition (`LayoutTree.tsx`'s `effectiveGridTransition`, truthy for a live-drag release, a structural editor edit, or a `stableSplitPaths` stage-transition resize) — this line's own `left`/`top` then gets a matching plain CSS transition, so its position glides in lockstep with the actual track boundary instead of jumping to `share`'s new value the instant it changes while the grid track it sits on is still mid-glide. Omit (the default) whenever the grid template itself isn't transitioning either — a live drag in progress, or the ordinary stage-transition case where the line is fully hidden while the geometry snaps in one reflow with nothing on screen to see it jump. */
  glide?: boolean
}

/**
 * The visible line between a split's own two children.
 *
 * Previously there was no such element at all: the line was simply the split
 * grid's own `background-color` showing through its `gap`. That worked, but
 * it made the border impossible to animate cheaply — the only things to
 * animate were `gap` (layout-affecting, so every frame of it re-runs layout
 * on the main thread) or the background color (a fade, not the shrink this
 * needs). Drawing the line as its own element instead means it can animate
 * with a `transform`, which composites without touching layout or disturbing
 * the panes on either side at all.
 *
 * Positioned off the *same* `share` that `nodeGridTemplate` builds its track
 * list from, which is what makes this exact rather than approximate: the
 * first track is precisely `share%` of the container, so the gap begins
 * exactly there. (The separate drag handle, `SplitLayoutDivider`, does
 * deliberately center a much wider invisible hit-area on the same point —
 * it's a target, not a line, so a few px either way is unnoticeable there.)
 *
 * Scales on its own *thickness* axis rather than its length, so it thins to
 * nothing in place instead of retracting toward one end.
 */
export function SplitBorderLine({ direction, share, thickness, visible, reducedMotion, glide, span }: SplitBorderLineProps) {
  const isVertical = direction === 'row'
  const crossAxis = span ? { start: `${span.start}%`, size: `${span.end - span.start}%` } : undefined
  const position = crossAxis
    ? // Straddling the boundary rather than filling a gap — see `span`'s own doc comment.
      isVertical
      ? { left: `calc(${share}% - ${thickness / 2}px)`, top: crossAxis.start, height: crossAxis.size, width: thickness }
      : { top: `calc(${share}% - ${thickness / 2}px)`, left: crossAxis.start, width: crossAxis.size, height: thickness }
    : // Nested-grid path: the line fills the split's own `gap`, which begins exactly where the first
      // track ends. That is *not* `share%` — the tracks each take their share of the space left over
      // after the gap (see `gapAwareTracks`), so the boundary sits `share%` minus this line's own
      // proportional slice of the gap. `thickness` is that gap, since `LayoutTree` sizes both from the
      // same number. Getting this wrong drifts the line off the seam by up to the gap's own width,
      // which compounds with nesting depth exactly as the track overflow it mirrors used to.
      isVertical
      ? { left: `calc(${share}% - ${((share / 100) * thickness).toFixed(3)}px)`, top: 0, bottom: 0, width: thickness }
      : { top: `calc(${share}% - ${((share / 100) * thickness).toFixed(3)}px)`, left: 0, right: 0, height: thickness }
  // Scaling the thickness axis only. `transform` never affects layout, so
  // neither the panes either side nor anything nested inside them re-layout
  // while this animates — the entire point of drawing the border as its own
  // element rather than animating the grid's own `gap`.
  const scaleAxis = isVertical ? 'scaleX' : 'scaleY'
  // `left`/`top` above are plain style values, not part of framer-motion's own `animate` — without this,
  // a `share` change lands on-screen the instant it's set, while the sibling `.layout-tree__split`'s own
  // `grid-template-columns`/`-rows` (see `stableResizeGridTransition`) glides toward the same boundary over
  // `PANE_GROWTH_DURATION_SECONDS` — the line reaching its new position immediately while the actual track
  // edge is still catching up is exactly what reads as the line "overflowing"/lagging behind the container.
  const positionTransition = glide && !reducedMotion ? `${isVertical ? 'left' : 'top'} ${PANE_GROWTH_DURATION_SECONDS}s ease` : undefined

  return (
    <motion.div
      className="split-border-line"
      style={{ ...position, transformOrigin: 'center', ...(positionTransition ? { transition: positionTransition } : {}) }}
      initial={false}
      animate={{ transform: `${scaleAxis}(${visible ? 1 : 0})` }}
      // Hiding waits (`BORDER_EXIT_DELAY_SECONDS`) so the line outlives the
      // content sliding out past it; showing starts immediately, since
      // `'holding'` exists precisely to let the borders arrive before the new
      // content does.
      transition={{
        duration: reducedMotion ? 0 : BORDER_TRANSITION_DURATION_SECONDS,
        delay: reducedMotion || visible ? 0 : BORDER_EXIT_DELAY_SECONDS,
        ease: 'easeInOut',
      }}
    />
  )
}
