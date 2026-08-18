import { useEffect, useMemo, useState } from 'react'
import type { NewsSlotSettings } from '../../hooks/useCurrentNewsHeadline'
import type { LanguageCode } from '../../i18n'
import type { LayoutNode, PaneGrowthFallback, PaneId, ScreenConfig, ScreenSlot, ScreenSlotContent, TextSizes } from '../../types/screen'
import { computeLayoutGeometry, type Rect } from '../../utils/layoutGeometry'
import { paneDefaultSlideDirection, resolvePaneGrowthOrigin } from '../../utils/paneGrowth'
import { resolveSlotLocked } from '../../utils/screenStages'
import { LayoutPane } from './LayoutPane'
import { PANE_GROWTH_DURATION_SECONDS } from './paneGrowthMotion'
import { paneEnterMotion, paneRectMotion, type ContainerSize, type PaneStartPose } from './paneRectMotion'

/**
 * How many panes may have a rect change in one transition before the whole transition gives up on
 * animating and simply takes the new geometry in a single commit (today's blank-and-snap, which the
 * surrounding `contentPhase` sequence still hides).
 *
 * This is the pressure valve, not a correctness knob: the deterministic model still governs *where*
 * every pane goes at every stage regardless — only *how it gets there* degrades past this point.
 *
 * The value is a bound on the unmeasured rather than a tuned optimum, and deliberately so. On the
 * desktop harness a purpose-built 25-pane fixture in which every pane persists *and* resizes — the
 * most expensive class of change this model can produce — cost 50-90ms worst-frame against 50-89ms
 * for the nested-grid animation it replaces, i.e. indistinguishable at the largest size actually
 * tested. There is therefore no measured pane count at which animating is worse than not animating,
 * and a low cap would only throw away working animation on the strength of a guess. This sits just
 * above that largest tested arrangement, so a screen with more moving panes than anyone has measured
 * falls back to the snap instead of extrapolating into territory there are no numbers for.
 *
 * **This has not been verified on the real kiosk.** The TV measurements in
 * `QA/Reports/geometry-pane-model-2026-08-15.md` predate the switch from clip-and-reveal to real
 * layout animation for resizes, and the device became unavailable before they could be retaken — see
 * that report, and `ENABLE_FLAT_PANE_LAYOUT`, which ships off for exactly this reason.
 */
export const MAX_ANIMATED_PANES = 32

interface FlatPaneLayerProps {
  /** The arrangement to render — already resolved for the current stage, and already carrying any live divider-drag overlay (see `SplitLayout`'s own `layoutTree`). */
  node: LayoutNode
  /** `.split-layout`'s own measured pixel size — see `ContainerSize` for why a px value is needed rather than the percentages everything else here works in. */
  containerSize: ContainerSize
  screenID: string
  paneSlots: Record<PaneId, ScreenSlot>
  stage: number
  transitionStyle: ScreenConfig['transitionStyle']
  resolveTextSizes: (leafId: PaneId, stage: number, content: ScreenSlotContent) => TextSizes
  defaultPaneLanguage: LanguageCode
  editingFocus: ScreenConfig['editingFocus']
  transitionDuration: number
  contentPhase: 'idle' | 'exiting' | 'holding'
  stageStaticLeafIds: Set<PaneId>
  reducedMotion: boolean | null
  /** See `SplitLayout`'s own prop of the same name — draws a persistent highlight ring around this one pane. */
  selectedLeafId?: PaneId
  /** See `SplitLayout`'s own prop of the same name — dims every pane except `selectedLeafId`. */
  dimUnselectedPanes?: boolean
  /** See `SplitLayout`'s own prop of the same name — which edge a pane with no qualifying divider grows in from. */
  paneGrowthFallback: PaneGrowthFallback
  newsSlots: NewsSlotSettings[]
  stageTick: number | undefined
  onRequestStageAdvance?: () => void
  captureMode?: boolean
}

/**
 * Renders a pane arrangement as a **flat list of absolutely-positioned panes** — one
 * `<LayoutPane key={leafId}>` per leaf, placed at its own `computeLayoutGeometry` rect — instead of
 * `LayoutTree`'s recursive nested CSS grids. Gated by `ENABLE_FLAT_PANE_LAYOUT`; the nested-grid path
 * remains the fallback and is what runs whenever this is off.
 *
 * Two things follow from flattening, and they're why it's worth doing at all:
 *
 *  1. **A pane's React identity becomes its `PaneId`, full stop.** `LayoutTree` recurses with no keys
 *     spanning depths, and the element type at a given tree position flips between a pane and a split
 *     `<div>`, so React tears down whole subtrees on any restructure. Here nothing about a pane's
 *     position in the tree reaches the element at all, so a restructure moves a pane rather than
 *     rebuilding it — `<video>` playback, scroll offsets, crossfade slots and the applied
 *     shrink-to-fit transform all survive.
 *  2. **A transition becomes rect interpolation.** A pane's position at any stage is just
 *     `computeLayoutGeometry(treeAtThatStage)[paneId]`, so moving between two stages is interpolating
 *     between two known rects — uniformly well-defined for a pane appearing, disappearing, or the
 *     tree restructuring underneath it, with no per-shape special cases.
 *
 * The interpolation itself is deliberately *not* an animation of `left`/`top`/`width`/`height` — see
 * `paneRectMotion` for what it does instead and why that costs a fraction as much on weak hardware.
 * It runs as a two-commit flip (start pose painted once with no transition, then dropped) for exactly
 * the reason `LayoutTree`'s own synthetic-ratio mount does: a browser needs to have actually painted
 * a "from" value before it has anything to glide away from.
 *
 * This component renders panes only. Borders, dividers and corner handles are the caller's own
 * concern (`SplitLayout` renders them from the same `geometry.dividers`), which keeps the flat DOM
 * order — panes, then borders, then interactive overlays — explicit at one level rather than
 * scattered through a recursion.
 */
export function FlatPaneLayer({
  node,
  containerSize,
  screenID,
  paneSlots,
  stage,
  transitionStyle,
  resolveTextSizes,
  defaultPaneLanguage,
  editingFocus,
  transitionDuration,
  contentPhase,
  stageStaticLeafIds,
  reducedMotion,
  selectedLeafId,
  dimUnselectedPanes,
  paneGrowthFallback,
  newsSlots,
  stageTick,
  onRequestStageAdvance,
  captureMode,
}: FlatPaneLayerProps) {
  const geometry = useMemo(() => computeLayoutGeometry(node), [node])

  /**
   * The start poses for the transition currently in flight, keyed by leaf id — `null` at rest.
   *
   * Computed synchronously during render (React's own "adjusting state when a prop changes" pattern,
   * the same idiom `SplitLayout`'s `diffBase`/`prevTree` and `LayoutTree`'s `prevGrowingSide` use)
   * rather than in an effect: an effect runs *after* the commit that already painted every pane at
   * its destination, by which point there is no "from" left to animate away from. `prevNode` tracks
   * which tree these poses were computed against so this fires exactly once per real change.
   */
  const [prevNode, setPrevNode] = useState<LayoutNode>(node)
  const [motions, setMotions] = useState<Record<PaneId, PaneStartPose> | null>(null)
  if (prevNode !== node) {
    setPrevNode(node)
    setMotions(computeStartPoses(prevNode, node, containerSize, reducedMotion, paneGrowthFallback))
  }

  // Double `requestAnimationFrame`, not one, for the same measured reason `LayoutTree`'s own
  // two-phase growth mount uses two: a single rAF scheduled from an effect runs at the start of the
  // next frame's work, *before* that frame is painted — so dropping the start pose there lands in the
  // very same paint, and the browser only ever sees one value with nothing to interpolate between.
  useEffect(() => {
    if (!motions) return
    let inner = 0
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setMotions(null))
    })
    return () => {
      cancelAnimationFrame(outer)
      if (inner) cancelAnimationFrame(inner)
    }
  }, [motions])

  /**
   * Every property any of the three mechanisms animates, in one list — a pane only ever actually
   * animates the ones its own start pose touched, and a declared transition on a property that never
   * changes costs nothing, so this stays a single constant rather than a per-pane string.
   */
  /**
   * The at-rest values of every property a start pose can touch, written **explicitly** rather than
   * left absent.
   *
   * This is load-bearing, not tidiness: CSS cannot interpolate to the *absence* of a property. A pane
   * released from `clip-path: inset(0% 100% 0% 0%)` to no `clip-path` at all jumps straight to fully
   * revealed in one frame with the transition silently doing nothing — which is precisely what the
   * audit caught (every pane reporting a full-width "snap" while the borders glided correctly beside
   * them). Releasing it to an explicit `inset(0% 0% 0% 0%)` interpolates, because both ends are the
   * same function with the same argument count.
   */
  const restPose = { transform: 'translate3d(0px, 0px, 0)', clipPath: 'inset(0% 0% 0% 0%)', opacity: 1 }

  const rectTransition = reducedMotion
    ? undefined
    : ['left', 'top', 'width', 'height', 'transform', 'clip-path', 'opacity'].map((property) => `${property} ${PANE_GROWTH_DURATION_SECONDS}s ease`).join(', ')

  return (
    <>
      {geometry.leaves.map(({ id, rect }) => {
        const slot = paneSlots[id]
        if (!slot) return null
        const motion = motions?.[id]
        return (
          <LayoutPane
            key={id}
            leafId={id}
            screenID={screenID}
            slot={slot}
            stage={stage}
            transitionStyle={transitionStyle}
            slideDirection={paneDefaultSlideDirection(node, id)}
            resolveTextSizes={resolveTextSizes}
            defaultPaneLanguage={defaultPaneLanguage}
            editingFocus={editingFocus}
            transitionDuration={transitionDuration}
            contentPhase={contentPhase}
            stageStatic={stageStaticLeafIds.has(id)}
            reducedMotion={reducedMotion}
            selected={id === selectedLeafId}
            dimmed={Boolean(dimUnselectedPanes && selectedLeafId !== undefined && id !== selectedLeafId)}
            canDelete={false}
            locked={resolveSlotLocked(slot, stage)}
            newsSlots={newsSlots}
            stageTick={stageTick}
            onRequestStageAdvance={onRequestStageAdvance}
            captureMode={captureMode}
            // A resizing pane starts the animation *at its old box* and animates the box itself; every
            // other mechanism leaves the box at its destination and animates a pose away. See
            // `paneRectMotion` for why a resize can't use the cheaper pose-only route.
            rect={motion?.rect ?? rect}
            rectMotion={{ ...restPose, ...(motion?.style ?? {}) }}
            // No transition on the frame the start pose itself is painted — that frame *is* the
            // "from", and transitioning into it would animate the wrong half of the move.
            rectTransition={motion ? undefined : rectTransition}
          />
        )
      })}
    </>
  )
}

/**
 * Every pane's own one-frame start pose for the move from `from` to `to` — the whole per-transition
 * decision, in one pure function.
 *
 * Panes are bucketed by what actually changed for each, and the cheapest sufficient mechanism is used
 * per pane (a pane whose rect didn't meaningfully change gets **no entry at all**, so no style is
 * written for it and nothing about it is invalidated). Past `MAX_ANIMATED_PANES` movers the whole
 * transition is abandoned as a unit rather than partially animated — a half-animated arrangement
 * reads far worse than a clean snap, and the snap is what the surrounding `contentPhase` sequence is
 * already hiding anyway.
 */
function computeStartPoses(
  from: LayoutNode,
  to: LayoutNode,
  containerSize: ContainerSize,
  reducedMotion: boolean | null,
  paneGrowthFallback: PaneGrowthFallback,
): Record<PaneId, PaneStartPose> | null {
  if (reducedMotion || containerSize.width <= 0 || containerSize.height <= 0) return null

  const fromRects = new Map(computeLayoutGeometry(from).leaves.map((leaf) => [leaf.id, leaf.rect] as const))
  const toLeaves = computeLayoutGeometry(to).leaves
  const poses: Record<PaneId, PaneStartPose> = {}

  for (const { id, rect } of toLeaves) {
    const previousRect: Rect | undefined = fromRects.get(id)
    if (!previousRect) {
      poses[id] = paneEnterMotion(resolvePaneGrowthOriginEdge(to, from, id, paneGrowthFallback))
      continue
    }
    const motion = paneRectMotion(previousRect, rect, containerSize)
    if (motion) poses[id] = motion
  }

  const movers = Object.keys(poses).length
  if (movers === 0 || movers > MAX_ANIMATED_PANES) return null
  return poses
}

/** `resolvePaneGrowthOrigin`, reduced to the single value `paneEnterMotion` needs — kept here rather than widening that function, which several other callers depend on the full shape of. */
function resolvePaneGrowthOriginEdge(existTree: LayoutNode, goneTree: LayoutNode, leafId: PaneId, fallback: PaneGrowthFallback) {
  const origin = resolvePaneGrowthOrigin(existTree, goneTree, leafId, fallback)
  return origin.kind === 'fade' ? ('fade' as const) : origin.edge
}
