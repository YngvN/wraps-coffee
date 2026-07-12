import { useEffect, useRef } from 'react'
import { pushBackLevel } from '../lib/backStack'

/**
 * Registers one level of in-app sub-view/panel nesting with the shared
 * browser-history back stack (see `src/lib/backStack.ts`) for as long as
 * `active` is true — so the browser's own back action (mouse back button,
 * Alt+←, a swipe-back gesture) closes it exactly the way clicking its own
 * explicit Back button does. Wire that Back button's `onClick` to the
 * module's own `goBack` (not to `onBack` directly) so both paths go through
 * the identical `popstate` flow. `onBack` is this level's real close logic
 * — call it yourself too, from anywhere else this level can also close
 * (Cancel, Save, Escape); this hook only needs to know when that happened
 * (via `active` turning false) to clean up its own history entry without
 * running `onBack` a second time once the browser's back stack later
 * "catches up" to it.
 */
export function useBackLevel(active: boolean, onBack: () => void) {
  const onBackRef = useRef(onBack)
  /** Whether this level's most recent close happened through the back stack itself (the browser's own back, or `goBack()`) rather than some other in-app action — decides whether the effect cleanup below still needs to release the pushed history entry itself. */
  const closedViaStack = useRef(false)

  // Keeps the ref in step with the latest `onBack` after every render,
  // rather than writing it inline during render itself (React's own rule —
  // a ref is only ever safe to read/write outside of render).
  useEffect(() => {
    onBackRef.current = onBack
  })

  useEffect(() => {
    if (!active) return
    closedViaStack.current = false
    const level = pushBackLevel(() => {
      closedViaStack.current = true
      onBackRef.current()
    })
    return () => {
      if (!closedViaStack.current) level.release()
    }
  }, [active])
}
