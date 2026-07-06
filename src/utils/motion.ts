import type { Variants, Transition } from 'framer-motion'

/** Framer Motion props produced by {@link pageTransition}. */
export interface PageTransitionProps {
  variants: Variants
  transition: Transition
}

/**
 * Framer Motion variants and transition for animating route changes: the
 * incoming page slides in over the outgoing page, which stays in place
 * underneath until it's covered and unmounted.
 *
 * @param isHome - Whether the incoming route is the home page. The home
 * page slides in from the left; every other page slides in from the right.
 * @param reducedMotion - When `true` (the user prefers reduced motion), the
 * page swap happens instantly without sliding.
 */
export function pageTransition(isHome: boolean, reducedMotion = false): PageTransitionProps {
  if (reducedMotion) {
    return {
      variants: {
        enter: { x: 0, zIndex: 1 },
        center: { x: 0, zIndex: 1 },
        exit: { x: 0, zIndex: 0 },
      },
      transition: { duration: 0 },
    }
  }

  return {
    variants: {
      enter: { x: isHome ? '-100%' : '100%', zIndex: 1 },
      center: { x: 0, zIndex: 1 },
      exit: { x: 0, zIndex: 0 },
    },
    transition: { duration: 0.5, ease: [0.4, 0, 0.2, 1] },
  }
}
