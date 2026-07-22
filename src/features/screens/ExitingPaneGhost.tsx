import { motion } from 'framer-motion'
import type { NewsSlotSettings } from '../../hooks/useCurrentNewsHeadline'
import type { LanguageCode } from '../../i18n'
import type { BackgroundImage, PaneId, ScreenConfig, ScreenSlot, ScreenSlotContent, TextSizes } from '../../types/screen'
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
  /** Threaded straight through to the wrapped `LayoutPane`. See `LayoutTree`'s own prop of the same name. */
  screenBackgroundImage?: BackgroundImage
  /** `.split-layout`'s own measured pixel size — combined with this ghost's own `rect` to compute the wrapped `LayoutPane`'s own `screenBackgroundWindow`, same as `LayoutTree.tsx` does for a live leaf. See `SplitLayout.tsx`'s own `containerSize`. */
  containerSize: { width: number; height: number }
  /** Threaded straight through to the wrapped `LayoutPane`, same re-basing role as `LayoutTree.tsx`'s own prop of the same name. See `SplitLayout.tsx`'s own `screenBackgroundCoverRect`. */
  screenBackgroundCoverRect?: { left: number; top: number; width: number; height: number }
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
 * re-implementing pane rendering — `paneSlots[leafId]` is guaranteed still
 * present, since removing a leaf from the tree never touches `paneSlots`
 * (orphaned entries are deliberately left in place).
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
  screenBackgroundImage,
  containerSize,
  screenBackgroundCoverRect,
  onCollapseComplete,
  newsSlots,
  stageTick,
  onRequestStageAdvance,
}: ExitingPaneGhostProps) {
  const collapsedPath = growth.kind !== 'fade' ? collapsedClipPath(growth.edge) : FULL_REVEAL_CLIP_PATH
  const screenBackgroundWindow =
    containerSize.width > 0 && containerSize.height > 0 && screenBackgroundCoverRect
      ? {
          left: (rect.x / 100) * containerSize.width - screenBackgroundCoverRect.left,
          top: (rect.y / 100) * containerSize.height - screenBackgroundCoverRect.top,
          screenWidth: screenBackgroundCoverRect.width,
          screenHeight: screenBackgroundCoverRect.height,
        }
      : undefined

  return (
    <motion.div
      className="split-layout__pane-ghost"
      style={{ position: 'absolute', left: `${rect.x}%`, top: `${rect.y}%`, width: `${rect.width}%`, height: `${rect.height}%`, pointerEvents: 'none' }}
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
        screenBackgroundImage={screenBackgroundImage}
        screenBackgroundWindow={screenBackgroundWindow}
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
