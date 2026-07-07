import type { Variants } from 'framer-motion'
import type { ScreenTransitionStyle } from '../../types/screen'

/** Animation variants for each supported transition style, shared by the screen-level slideshow rotation (`SlideshowLayout`) and any individual slot's own in-place rotation (`SplitLayout`). */
export const SCREEN_TRANSITIONS: Record<ScreenTransitionStyle, Variants> = {
  fade: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
  },
  slide: {
    initial: { opacity: 0, x: 60 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -60 },
  },
}
