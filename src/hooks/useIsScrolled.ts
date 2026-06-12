import { useEffect, useState } from 'react'

/**
 * Tracks whether the page has been scrolled past `threshold` pixels from
 * the top. Used to drive scroll-triggered reveal/exit animations, such as
 * the header logo reveal and hero exit on the homepage.
 *
 * @param threshold - Scroll distance in pixels after which `true` is returned.
 */
export function useIsScrolled(threshold = 10): boolean {
  const [isScrolled, setIsScrolled] = useState(() => window.scrollY > threshold)

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > threshold)
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [threshold])

  return isScrolled
}
