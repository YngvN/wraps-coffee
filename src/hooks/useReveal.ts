import { useReducedMotion } from 'framer-motion'
import { reveal, type RevealDirection, type RevealProps } from '../utils/motion'

/**
 * Returns a {@link reveal} bound to the user's `prefers-reduced-motion`
 * setting, so scroll-in animations are skipped (elements appear in their
 * final position immediately) when reduced motion is requested.
 */
export function useReveal(): (direction: RevealDirection, delay?: number) => RevealProps {
  const reducedMotion = useReducedMotion()
  return (direction, delay = 0) => reveal(direction, delay, reducedMotion ?? false)
}
