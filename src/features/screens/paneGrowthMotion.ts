import type { PaneEdge } from '../../utils/layoutGeometry'

/** Matches the existing CSS grid-ratio transition's own duration (`SplitLayout.tsx`'s `gridTransition`), so a simultaneous shape change and ratio change read as one animated system rather than two out-of-sync ones. */
export const PANE_GROWTH_DURATION_SECONDS = 0.5

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
