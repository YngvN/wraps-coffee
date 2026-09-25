import { useCallback, useState } from 'react'

/**
 * One order-board preference remembered on this device in `localStorage` — for per-tablet
 * conveniences (a dark kitchen and a bright counter can each keep their own) that need no admin and no
 * screen edit. Storage can be missing or throw in a locked-down WebView: reads then fall back to
 * `fallback`, and a write simply isn't persisted (the choice still applies until the page reloads).
 * `parse` validates whatever was stored, since it may be stale or hand-edited.
 */
export function useDeviceSetting<T extends string>(key: string, parse: (stored: string | null) => T, fallback: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      return parse(window.localStorage.getItem(key))
    } catch {
      return fallback
    }
  })
  const set = useCallback(
    (next: T) => {
      setValue(next)
      try {
        window.localStorage.setItem(key, next)
      } catch {
        // Not persisted this time.
      }
    },
    [key],
  )
  return [value, set]
}
