import { motion } from 'framer-motion'
import type { NewsSlotSettings } from '../../hooks/useCurrentNewsHeadline'
import type { LanguageCode } from '../../i18n'
import type { PaneId, ScreenConfig, ScreenSlot, ScreenSlotContent, TextSizes } from '../../types/screen'
import type { Rect } from '../../utils/layoutGeometry'
import type { PaneGrowthOrigin } from '../../utils/paneGrowth'
import { collapsedClipPath, FULL_REVEAL_CLIP_PATH, PANE_GROWTH_DURATION_SECONDS } from './paneGrowthMotion'
import { LayoutPane } from './LayoutPane'

interface ExitingPaneGhostProps {
  leafId: PaneId
  /** This leaf's own last-known rect (0-100 space, relative to `.split-layout`'s own outer box) — captured from the tree it was last part of, since its own grid cell (and possibly that cell's whole ancestor chain) may no longer exist in the current tree at all. */
  rect: Rect
  growth: PaneGrowthOrigin
  slot: ScreenSlot
  stage: number
  transitionStyle: ScreenConfig['transitionStyle']
  resolveTextSizes: (leafId: PaneId, stage: number, content: ScreenSlotContent) => TextSizes
  defaultPaneLanguage: LanguageCode
  /** Called once the collapse animation finishes, so the caller (`SplitLayout`) can prune this ghost from its own tracking state. */
  onCollapseComplete: (leafId: PaneId) => void
  /** Threaded straight through to the wrapped `LayoutPane`. See `LayoutTree`'s own prop of the same name. */
  newsSlots: NewsSlotSettings[]
  /** Threaded straight through to the wrapped `LayoutPane`. See `LayoutTree`'s own prop of the same name. */
  stageTick: number | undefined
  /** Threaded straight through to the wrapped `LayoutPane`. See `SplitLayout`'s own prop of the same name. */
  onRequestStageAdvance?: () => void
}

/**
 * A just-removed pane's own farewell — absolutely positioned at its own
 * last-known rect (outside the live grid entirely, since that cell no
 * longer exists), collapsing back into `growth`'s own edge the same way a
 * newly-appeared pane grows out of one (see `resolvePaneGrowthOrigin` in
 * `src/utils/paneGrowth.ts` for why this is the exact reverse of the same
 * algorithm). Wraps a read-only `LayoutPane` (every interactive prop
 * omitted, exactly like a locked screen renders one today) rather than
 * re-implementing pane rendering — `paneSlots[leafId]` is present for
 * ordinary deletes (`deleteLeaf` never touches `paneSlots`, orphaned
 * entries are deliberately left in place), but *not* guaranteed for a leaf
 * that disappeared via undo/redo (which swaps in a whole prior
 * `ScreenConfig` snapshot, `paneSlots` included, rather than just the
 * tree) — `SplitLayout.tsx`'s own caller skips ever mounting this component
 * at all once `paneSlots[leafId]` is missing, rather than rendering it with
 * an undefined `slot`.
 */
export function ExitingPaneGhost({
  leafId,
  rect,
  growth,
  slot,
  stage,
  transitionStyle,
  resolveTextSizes,
  defaultPaneLanguage,
  onCollapseComplete,
  newsSlots,
  stageTick,
  onRequestStageAdvance,
}: ExitingPaneGhostProps) {
  const collapsedPath = growth.kind !== 'fade' ? collapsedClipPath(growth.edge) : FULL_REVEAL_CLIP_PATH

  return (
    <motion.div
      className="split-layout__pane-ghost"
      // Paints its own opaque `--screen-bg` so it still occludes the live
      // panes it's floating over. It used to get that for free from
      // `.split-layout__pane`'s own opaque background; panes are transparent
      // now (their backdrop moved onto the content slots), so without this a
      // collapsing ghost would be see-through.
      style={{ position: 'absolute', left: `${rect.x}%`, top: `${rect.y}%`, width: `${rect.width}%`, height: `${rect.height}%`, pointerEvents: 'none', background: 'var(--screen-bg)' }}
      initial={{ clipPath: FULL_REVEAL_CLIP_PATH, opacity: 1 }}
      animate={{ clipPath: collapsedPath, opacity: growth.kind === 'fade' ? 0 : 1 }}
      transition={{ duration: PANE_GROWTH_DURATION_SECONDS, ease: 'easeInOut' }}
      onAnimationComplete={() => onCollapseComplete(leafId)}
    >
      <LayoutPane
        leafId={leafId}
        slot={slot}
        stage={stage}
        transitionStyle={transitionStyle}
        slideDirection="right"
        resolveTextSizes={resolveTextSizes}
        defaultPaneLanguage={defaultPaneLanguage}
        editingFocus={undefined}
        transitionDuration={0.6}
        reducedMotion={false}
        canDelete={false}
        locked={false}
        newsSlots={newsSlots}
        stageTick={stageTick}
        onRequestStageAdvance={onRequestStageAdvance}
      />
    </motion.div>
  )
}
