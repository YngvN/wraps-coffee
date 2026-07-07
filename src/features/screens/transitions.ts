import type { Variants } from 'framer-motion'
import type { ScreenTransitionStyle, SlideTransitionDirection } from '../../types/screen'

const FADE_VARIANTS: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
}

/** The incoming slide's starting offset for each entry direction — e.g. `'left'` starts to the left of its resting position and slides in from there. */
const SLIDE_OFFSETS: Record<SlideTransitionDirection, { x: number; y: number }> = {
  left: { x: -60, y: 0 },
  right: { x: 60, y: 0 },
  up: { x: 0, y: -60 },
  down: { x: 0, y: 60 },
}

/** Slide variants for a given entry direction: the incoming slide starts offset toward `direction` and animates to its resting position, while the outgoing slide exits toward the opposite side, as if pushed out by the one entering. */
function slideVariants(direction: SlideTransitionDirection): Variants {
  const { x, y } = SLIDE_OFFSETS[direction]
  return {
    initial: { opacity: 0, x, y },
    animate: { opacity: 1, x: 0, y: 0 },
    exit: { opacity: 0, x: -x, y: -y },
  }
}

/** Resolves the animation variants for a slot's own in-place slide rotation, given the screen's chosen transition style and (only meaningful for `'slide'`) entry direction. */
export function resolveTransitionVariants(style: ScreenTransitionStyle, direction: SlideTransitionDirection): Variants {
  return style === 'slide' ? slideVariants(direction) : FADE_VARIANTS
}
