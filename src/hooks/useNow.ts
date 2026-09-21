import { useEffect, useState } from 'react'

/**
 * A `Date.now()` value that re-renders the calling component on an
 * interval, for UI whose correctness depends on the passage of time rather
 * than on any state change — a "last seen 3 minutes ago" label, or the
 * Display Manager's own connection dots, which otherwise only re-resolve
 * when something *else* happens to trigger a render and so can sit showing
 * a green dot for a display that went quiet ten minutes ago.
 *
 * The default 30s cadence is deliberately coarser than the 20s heartbeat it
 * observes: this exists to stop a stale indicator persisting indefinitely,
 * not to make the transition land on an exact second.
 */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(interval)
  }, [intervalMs])

  return now
}
