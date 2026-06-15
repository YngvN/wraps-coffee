import type { Target, Transition, Variants, ViewportOptions } from 'framer-motion'

/** Direction an element "rains in" from when revealed: a side or from below. */
export type RevealDirection = 'left' | 'right' | 'up'

/** Framer Motion props produced by {@link reveal}. */
export interface RevealProps {
  initial: Target
  whileInView: Target
  viewport: ViewportOptions
  transition: Transition
}

/**
 * Framer Motion props for a "rain in" scroll reveal: the element fades in
 * while sliding into place from `direction`, animating once the first time
 * it scrolls into view.
 *
 * @param direction - Side the element slides in from (`'left'`/`'right'`),
 * or `'up'` to slide in from below.
 * @param delay - Seconds to wait before starting the animation, used to
 * stagger multiple elements revealing in sequence.
 * @param reducedMotion - When `true` (the user prefers reduced motion), the
 * element is shown in its final position immediately, without animating.
 */
export function reveal(direction: RevealDirection, delay = 0, reducedMotion = false): RevealProps {
  if (reducedMotion) {
    return {
      initial: { opacity: 1, x: 0, y: 0 },
      whileInView: { opacity: 1, x: 0, y: 0 },
      viewport: { once: true, amount: 0.3 },
      transition: { duration: 0 },
    }
  }

  const offset: Target = direction === 'left' ? { x: -60 } : direction === 'right' ? { x: 60 } : { y: 40 }
  const target: Target = direction === 'up' ? { y: 0 } : { x: 0 }

  return {
    initial: { opacity: 0, ...offset },
    whileInView: { opacity: 1, ...target },
    viewport: { once: true, amount: 0.3 },
    transition: { duration: 0.6, ease: 'easeOut', delay },
  }
}

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
