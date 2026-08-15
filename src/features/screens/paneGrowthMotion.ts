import type { PaneEdge } from '../../utils/layoutGeometry'

/**
 * Sole on/off switch for animating a *stage-driven* pane **creation** (a leaf appearing between two
 * stage checkpoints — see `SplitLayout.tsx`'s own `growingSplitPaths`) instead of the default
 * snap-behind-a-blank-screen treatment described in `BORDER_TRANSITION_DURATION_SECONDS`'s own doc
 * comment below: the brand-new divider paints once at a synthetic ratio matching wherever the origin
 * pane's edge already was, then glides open to its real ratio, so the origin pane visibly makes room
 * rather than both panes jumping to their final sizes in one frame.
 *
 * Flip to `false` to instantly revert to that snap treatment — e.g. to isolate whether this is
 * responsible for a real-hardware performance regression (it reintroduces some of the exact
 * `grid-template` animation cost snap-behind-a-blank-screen was built to avoid, though scoped to just
 * the one divider actually opening rather than the whole tree).
 *
 * Deletion is deliberately **not** covered — see `SplitLayout.tsx`'s own `exitingGhosts` block for what
 * was measured when the existing ghost machinery was pointed at stage-driven deletions, and what the
 * deletion side would actually need instead.
 */
export const ENABLE_STAGE_STRUCTURAL_GROWTH = true

/**
 * Sole on/off switch for the **geometry-driven flat pane layer** (`FlatPaneLayer.tsx`) — rendering
 * every leaf as one absolutely-positioned pane at its own `computeLayoutGeometry` rect, keyed by
 * `PaneId`, instead of `LayoutTree.tsx`'s recursive nested CSS grids.
 *
 * Two things depend on it, and they're the same thing seen from two sides:
 *
 *  - **DOM identity.** `LayoutTree`'s output element type flips between `<LayoutPane>` and a split
 *    `<div>` at a given tree position, and the recursion carries no keys across depths, so React
 *    unmounts and rebuilds whole subtrees on any restructure — panes fully remount, losing `<video>`
 *    playback, scroll offsets, `useCrossfadeSlot` state and their applied shrink-to-fit transform.
 *    Flattened, a pane's identity is its `PaneId` and nothing else, so it survives.
 *  - **Animating a restructure.** A transition becomes "interpolate each pane's rect between two
 *    known endpoints", which is well-defined for creation, deletion and arbitrary restructures alike
 *    — as opposed to interpolating nested grid templates, which only has anything to interpolate when
 *    the tree's *shape* is preserved.
 *
 * `false` (the default) leaves the nested-grid path completely untouched — it is the fallback, not
 * dead code, and is what still runs whenever the flat path can't be used (every editing surface
 * always does, since the draggable dividers and corner handles have not been re-homed onto the flat
 * layer; only the read-only kiosk/thumbnail render takes it).
 *
 * **It ships off**, despite the flat path measuring well on the desktop harness, because its cost on
 * the real kiosk is unverified: the Android TV numbers behind the go-ahead were taken against an
 * earlier build whose resize animation turned out to be partly inert, and the device became
 * unavailable before they could be retaken against the corrected one. Turn it on once a kiosk
 * measurement replaces those — see `QA/Reports/geometry-pane-model-2026-08-15.md`.
 */
export const ENABLE_FLAT_PANE_LAYOUT = false

/**
 * Matches the existing CSS grid-ratio transition's own duration (`SplitLayout.tsx`'s
 * `gridTransition`), so a simultaneous shape change and ratio change read as one animated system
 * rather than two out-of-sync ones. Only applies to *editor*-driven changes now (dragging a divider,
 * splitting a pane) — a stage transition no longer animates its geometry at all (see
 * `BORDER_TRANSITION_DURATION_SECONDS`).
 *
 * Shortened from 0.5s: every frame of this is a real layout pass (a grid track resize re-lays out
 * everything inside both cells), so its cost is directly proportional to its length — 0.3s is ~18
 * frames at 60Hz instead of ~30, i.e. 40% less layout work. That is a cost argument, not a measured
 * perceptual one: no side-by-side comparison of the two durations was run, only the frame cost. If a
 * transition ever reads as too abrupt, this is the first number to put back. Anything that needs to
 * *outlast* this animation derives its own timing from this constant rather than hardcoding a
 * matching number, so changing it stays a one-line change.
 */
export const PANE_GROWTH_DURATION_SECONDS = 0.3

/**
 * How far a divider has to actually move (in percentage points of the whole arrangement, along its
 * own axis) before a stage transition bothers animating it at all — see `SplitLayout.tsx`'s own
 * `negligibleMoveSplitPaths`.
 *
 * Paying `PANE_GROWTH_DURATION_SECONDS` worth of per-frame layout to glide a border a distance the
 * eye can't resolve is pure waste: at 2% of a 1920px-wide screen that's ~38px of travel spread over
 * the whole animation, i.e. ~2px per frame. Below this, the border simply takes its new position on
 * the commit the geometry changes — which is exactly what every *non*-stable divider on the screen is
 * already doing at that same moment, so nothing about it reads as inconsistent.
 */
export const NEGLIGIBLE_DIVIDER_MOVE_PERCENT = 2

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
