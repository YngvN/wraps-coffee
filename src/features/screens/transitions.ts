import type { Variants } from 'framer-motion'
import type { ScreenTransitionStyle, SlideTransitionDirection } from '../../types/screen'

const FADE_VARIANTS: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
}

/** The incoming slide's starting offset for each entry direction, as a percentage of its own (pane-filling) box — e.g. `'left'` starts one full width to the left of its resting position and slides in from fully off-screen. */
const SLIDE_OFFSETS: Record<SlideTransitionDirection, { x: string; y: string }> = {
  left: { x: '-100%', y: '0%' },
  right: { x: '100%', y: '0%' },
  up: { x: '0%', y: '-100%' },
  down: { x: '0%', y: '100%' },
}

/** Slide variants for a given entry direction: the incoming slide starts fully offset toward `direction` and slides in to its resting position, then later exits back out through that *same* side rather than the opposite one — `direction` is picked per pane (see `paneDefaultSlideDirection`) specifically because that side is an actual screen edge, while the opposite side is often a border shared with a neighboring pane, so the exit has to retrace the entrance rather than "push through" the far side. No fade, since `.split-layout__pane`'s own `overflow: hidden` already clips each slide out of view the moment it's off its resting spot. */
function slideVariants(direction: SlideTransitionDirection): Variants {
  const { x, y } = SLIDE_OFFSETS[direction]
  return {
    initial: { opacity: 1, x, y },
    animate: { opacity: 1, x: '0%', y: '0%' },
    exit: { opacity: 1, x, y },
  }
}

/** Resolves the animation variants for a slot's own in-place slide rotation, given the screen's chosen transition style and (only meaningful for `'slide'`) entry direction. */
export function resolveTransitionVariants(style: ScreenTransitionStyle, direction: SlideTransitionDirection): Variants {
  return style === 'slide' ? slideVariants(direction) : FADE_VARIANTS
}
