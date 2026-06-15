import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useLocation, useOutlet } from 'react-router-dom'
import { pageTransition } from '../utils/motion'

/**
 * Animates route changes for the routed page content.
 *
 * The incoming page slides in over the outgoing page: from the right when
 * navigating to any page, and from the left when navigating to the home
 * page. The outgoing page stays in place until it's fully covered, then
 * unmounts. Respects `prefers-reduced-motion` by swapping pages instantly.
 */
export function PageTransition() {
  const location = useLocation()
  const outlet = useOutlet()
  const reducedMotion = useReducedMotion()
  const isHome = location.pathname === '/'
  const { variants, transition } = pageTransition(isHome, reducedMotion ?? false)

  return (
    <AnimatePresence initial={false}>
      <motion.div
        key={location.pathname}
        className="page-transition"
        variants={variants}
        initial="enter"
        animate="center"
        exit="exit"
        transition={transition}
      >
        {outlet}
      </motion.div>
    </AnimatePresence>
  )
}
