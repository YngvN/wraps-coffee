import { useCallback, useMemo, useSyncExternalStore } from 'react'

/**
 * Tracks whether a CSS media query currently matches, updating live as the
 * underlying condition (e.g. viewport width) changes.
 *
 * A `MediaQueryList` is an external store — something that changes outside
 * React and has to be subscribed to — so this reads it via
 * `useSyncExternalStore` rather than mirroring it into `useState` from an
 * effect. That's what the API exists for, and it removes the two problems the
 * mirrored version had: a `useState` initializer only runs on the very first
 * render, so a changed `query` needed the effect to synchronously `setState`
 * to re-sync (which this codebase's own lint rule forbids, for good reason —
 * it's a render-then-immediately-re-render round trip), and between the first
 * render and that effect the returned value was briefly the *old* query's
 * answer. Reading the live value at render time has neither issue.
 *
 * @param query A CSS media query string, e.g. `'(min-width: 768px)'`.
 * @returns Whether `query` currently matches.
 */
export function useMediaQuery(query: string): boolean {
  const media = useMemo(() => window.matchMedia(query), [query])
  // Stable per `media`, so `useSyncExternalStore` re-subscribes only when the
  // query itself actually changes rather than on every render.
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      media.addEventListener('change', onStoreChange)
      return () => media.removeEventListener('change', onStoreChange)
    },
    [media],
  )

  return useSyncExternalStore(subscribe, () => media.matches)
}
