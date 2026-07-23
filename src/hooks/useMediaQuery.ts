import { useEffect, useState } from 'react'

/**
 * Tracks whether a CSS media query currently matches, updating live as the
 * underlying condition (e.g. viewport width) changes.
 *
 * @param query A CSS media query string, e.g. `'(min-width: 768px)'`.
 * @returns Whether `query` currently matches.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)

  useEffect(() => {
    const media = window.matchMedia(query)
    setMatches(media.matches)

    const handleChange = (event: MediaQueryListEvent) => setMatches(event.matches)
    media.addEventListener('change', handleChange)
    return () => media.removeEventListener('change', handleChange)
  }, [query])

  return matches
}
