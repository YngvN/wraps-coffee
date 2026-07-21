import type { PaneEdge } from '../../utils/layoutGeometry'

/** Matches the existing CSS grid-ratio transition's own duration (`SplitLayout.tsx`'s `gridTransition`), so a simultaneous shape change and ratio change read as one animated system rather than two out-of-sync ones. Also doubles as the "borders moving" phase's own duration in the stage-transition sequence (see `SplitLayout.tsx`'s `contentPhase` state machine) — kept as one constant so the two can never drift apart. */
export const PANE_GROWTH_DURATION_SECONDS = 0.5

/** A pane's own content fade/slide duration (`LayoutPane.tsx`'s `transitionDuration`), and — doubled, once for the exit half and once for the enter half — how long the stage-transition sequence's own "old content exiting" and "new content entering" phases each last (see `SplitLayout.tsx`'s `contentPhase` state machine). Kept as one constant so the timer logic and the actual animation prop can never drift apart. */
export const CONTENT_TRANSITION_DURATION_SECONDS = 0.6

/** The widest extra delay (see `paneTransitionDelaySeconds` below) a single pane's own content transition can be staggered by, so a multi-pane stage advance doesn't have every pane leave/arrive in perfect lockstep — a small per-pane offset each makes the whole thing read as less mechanical. Kept in one place so `SplitLayout.tsx`'s own `EXIT_PHASE_DURATION_SECONDS` (which has to wait out the *worst-case* delayed pane before it's safe to move the borders) can never drift out of sync with the actual range being drawn from. */
export const PANE_TRANSITION_STAGGER_SECONDS = 0.3

/** How long the stage-transition sequence's own "old content exiting" phase actually waits before moving the borders — long enough for even the most-delayed pane (`PANE_TRANSITION_STAGGER_SECONDS`) to still get its own full `CONTENT_TRANSITION_DURATION_SECONDS` exit animation in before the grid reflows underneath it. */
export const EXIT_PHASE_DURATION_SECONDS = CONTENT_TRANSITION_DURATION_SECONDS + PANE_TRANSITION_STAGGER_SECONDS

/**
 * A small extra delay (0..`PANE_TRANSITION_STAGGER_SECONDS`) for one pane's
 * own exit or enter transition — deterministic per `leafId`+`role` (a
 * simple string hash, not `Math.random()`) so it's stable across renders
 * with no state/effect of its own needed to hold it, while still differing
 * pane-to-pane (and, within one pane, differing between its own exit and
 * enter) enough that a multi-pane stage advance doesn't have every pane
 * leave/arrive in perfect lockstep. `Math.random()` would need to be rolled
 * either during render (an impure call, forbidden by this codebase's
 * `react-hooks/purity` rule) or inside a `useEffect` (itself forbidden from
 * calling `setState` synchronously, and a real one costs an extra
 * post-commit frame anyway) — a pure hash sidesteps both.
 */
export function paneTransitionDelaySeconds(leafId: string, role: 'exit' | 'enter'): number {
  const input = `${leafId}:${role}`
  let hash = 0
  for (let i = 0; i < input.length; i++) hash = (Math.imul(hash, 31) + input.charCodeAt(i)) | 0
  const unit = (hash >>> 0) / 0xffffffff
  return unit * PANE_TRANSITION_STAGGER_SECONDS
}

/** The fully-revealed `clip-path` — no clipping at all. */
export const FULL_REVEAL_CLIP_PATH = 'inset(0% 0% 0% 0%)'

/** The `clip-path` that hides everything but a zero-thickness sliver flush against `edge` — the starting frame of a pane's grow-in, or the ending frame of its collapse-out. Clips the *opposite* side fully away (100%), leaving the near side (flush against `edge`) at 0%. */
export function collapsedClipPath(edge: PaneEdge): string {
  switch (edge) {
    case 'left':
      return 'inset(0% 100% 0% 0%)'
    case 'right':
      return 'inset(0% 0% 0% 100%)'
    case 'top':
      return 'inset(0% 0% 100% 0%)'
    case 'bottom':
      return 'inset(100% 0% 0% 0%)'
  }
}
