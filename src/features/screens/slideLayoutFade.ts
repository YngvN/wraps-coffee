import type { Transition, Variants } from 'framer-motion'

/**
 * Fades a slide's own internal layout container in/out when its *shape* itself changes (see
 * `WeatherSlide.tsx`'s `isVertical`/`TransitSlide.tsx`'s `effectiveColumnCount`) — not a per-item
 * entrance/exit variant like `weatherItemVariants`/`transitRowVariants`, this is for the *container*
 * swap itself. `exit` carries its own instant `transition` (overriding whatever duration the caller's
 * own `transition` prop supplies for `initial`/`animate`, per Framer Motion's own "a variant's embedded
 * transition wins over the element's transition prop" rule) so the old shape disappears immediately
 * instead of fading out — only the incoming shape's fade-in is meant to be perceptible, since fading
 * both ways doubles the perceived transition time for no visual benefit.
 */
export const SLIDE_LAYOUT_FADE_VARIANTS: Variants = { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0, transition: { duration: 0 } } }

/** `reducedMotion` (from `useReducedMotion()`) collapses this to an instant cut, matching every other transition in the screens feature. */
export function slideLayoutFadeTransition(reducedMotion: boolean | null): Transition {
  return { duration: reducedMotion ? 0 : 0.2, ease: 'easeInOut' }
}
