import { useCallback, useRef } from 'react'

/** How long the `.search-highlight` pulse (see `global.scss`) stays applied to a target element before it's removed again. */
const HIGHLIGHT_DURATION_MS = 2000

/**
 * Shared "scroll to this row and flash it" primitive for search deep links
 * that land on a plain row/checkbox/card rather than opening a modal (news
 * source checkboxes, coming-soon cards, message board posts, user rows).
 * Register each addressable element with `ref={registerRef(id)}`, then call
 * `triggerHighlight(id)` once its container has actually opened/mounted —
 * this scrolls the matching element into view and toggles the shared
 * `.search-highlight` CSS class directly via `classList` rather than React
 * state, since a highlight pulse is a transient DOM effect that shouldn't
 * force a re-render of a potentially long list.
 */
export function useScrollToAndHighlight() {
  const nodesRef = useRef(new Map<string, HTMLElement>())
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const registerRef = useCallback(
    (id: string) => (node: HTMLElement | null) => {
      if (node) nodesRef.current.set(id, node)
      else nodesRef.current.delete(id)
    },
    [],
  )

  const triggerHighlight = useCallback((id: string) => {
    const node = nodesRef.current.get(id)
    if (!node) return
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    node.scrollIntoView({ behavior: 'smooth', block: 'center' })
    node.classList.add('search-highlight')
    timeoutRef.current = setTimeout(() => {
      node.classList.remove('search-highlight')
      timeoutRef.current = null
    }, HIGHLIGHT_DURATION_MS)
  }, [])

  return { registerRef, triggerHighlight }
}
