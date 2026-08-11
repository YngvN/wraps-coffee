import type { PaneEdge } from '../../utils/layoutGeometry'

/** Matches the existing CSS grid-ratio transition's own duration (`SplitLayout.tsx`'s `gridTransition`), so a simultaneous shape change and ratio change read as one animated system rather than two out-of-sync ones. Only applies to *editor*-driven changes now (dragging a divider, splitting a pane) — a stage transition no longer animates its geometry at all (see `BORDER_TRANSITION_DURATION_SECONDS`). */
export const PANE_GROWTH_DURATION_SECONDS = 0.5

/**
 * How long a slot border takes to shrink away, and later to grow back in, in
 * the stage-transition sequence (see `SplitLayout.tsx`'s `contentPhase` state
 * machine and `SplitBorderLine.tsx`).
 *
 * This is what replaced animating the grid itself. Previously a stage
 * transition animated `grid-template-columns`/`-rows` over
 * `PANE_GROWTH_DURATION_SECONDS` while the borders stayed fully opaque —
 * both layout-affecting properties, so Chromium re-ran layout on the main
 * thread every single frame of it, with the highest-contrast thing on screen
 * (a 4px line) gliding along carrying every dropped frame with it. Now the
 * borders shrink out, the geometry *snaps* in one reflow behind a screen
 * with nothing distinguishable left on it, and the borders grow back at
 * their new positions. The border animation itself is a `transform` on its
 * own element, so it composites without touching layout at all.
 *
 * Deliberately shorter than the old geometry animation: the whole point is
 * to spend fewer frames animating, and a border thinning to nothing reads
 * fine much faster than a pane sliding across the screen does.
 */
export const BORDER_TRANSITION_DURATION_SECONDS = 0.2

/** A pane's own content fade/slide duration (`LayoutPane.tsx`'s `transitionDuration`), and — doubled, once for the exit half and once for the enter half — how long the stage-transition sequence's own "old content exiting" and "new content entering" phases each last (see `SplitLayout.tsx`'s `contentPhase` state machine). Kept as one constant so the timer logic and the actual animation prop can never drift apart. */
export const CONTENT_TRANSITION_DURATION_SECONDS = 0.4

/** The widest extra delay (see `paneTransitionDelaySeconds` below) a single pane's own content transition can be staggered by, so a multi-pane stage advance doesn't have every pane leave/arrive in perfect lockstep — a small per-pane offset each makes the whole thing read as less mechanical. Kept in one place so `EXIT_PHASE_DURATION_SECONDS` (which has to wait out the *worst-case* delayed pane before it's safe to reflow the grid) can never drift out of sync with the actual range being drawn from. Halved from its original 0.3 alongside the border rework: the stagger is paid twice per transition (once leaving, once arriving) and is pure waiting, so it was the cheapest place to win back time without touching how any individual pane's own animation feels. */
export const PANE_TRANSITION_STAGGER_SECONDS = 0.1

/** How long the stage-transition sequence's own "old content exiting" phase actually waits before snapping the grid — long enough for even the most-delayed pane (`PANE_TRANSITION_STAGGER_SECONDS`) to still get its own full `CONTENT_TRANSITION_DURATION_SECONDS` exit animation in, and for every border to have finished shrinking away, before the grid reflows underneath it. */
export const EXIT_PHASE_DURATION_SECONDS = CONTENT_TRANSITION_DURATION_SECONDS + PANE_TRANSITION_STAGGER_SECONDS

/**
 * How long a border waits, once the old content has started leaving, before
 * it begins shrinking away (`SplitBorderLine`). Applies to the *hide*
 * direction only — growing back in `'holding'` starts immediately, since by
 * then the geometry has already snapped and the border arriving is the whole
 * point of that phase.
 *
 * Without this the borders vanished in the first fraction of the exit while
 * the panes were still sliding, so content spent most of its exit animation
 * sliding through empty space with nothing framing it. Holding the lines in
 * place until the panes have essentially left keeps the arrangement legible
 * for as long as there is still something in it to frame.
 *
 * Derived rather than hardcoded so it can't drift out of sync with either
 * duration it depends on: it's whatever is left of the exit phase after
 * reserving the shrink itself, minus a small margin so the line is provably
 * at zero thickness *before* the grid reflows rather than landing exactly on
 * that frame. That ordering is what the whole snap-behind-a-blank-screen
 * design rests on.
 */
export const BORDER_EXIT_DELAY_SECONDS = Math.max(0, EXIT_PHASE_DURATION_SECONDS - BORDER_TRANSITION_DURATION_SECONDS - 0.05)

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
