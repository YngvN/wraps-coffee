import { useEffect, useState } from 'react'

const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'touchstart', 'keydown', 'wheel'] as const

/** True once `timeoutMs` has passed with no mouse movement, touch, key press, scroll, or click — reset back to `false` by any of those. Always `false` while `enabled` is false, and resets immediately if `enabled`/`timeoutMs` change. */
export function useIdleTimer(timeoutMs: number, enabled: boolean): boolean {
  const [idle, setIdle] = useState(false)

  useEffect(() => {
    if (!enabled) return undefined

    let timeoutId: ReturnType<typeof setTimeout>

    const reset = () => {
      setIdle(false)
      clearTimeout(timeoutId)
      timeoutId = setTimeout(() => setIdle(true), timeoutMs)
    }

    ACTIVITY_EVENTS.forEach((event) => window.addEventListener(event, reset))
    reset()

    return () => {
      ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, reset))
      clearTimeout(timeoutId)
    }
  }, [timeoutMs, enabled])

  // Masks a possibly-stale `true` left over from before `enabled` turned
  // false, without needing to reset `idle` synchronously inside the effect
  // above (which the "set-state-in-effect" lint rule flags).
  return enabled && idle
}
