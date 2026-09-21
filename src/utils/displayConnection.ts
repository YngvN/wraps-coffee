/**
 * A display is still considered live this long after its last heartbeat —
 * 4.5x the companion app's own 20s heartbeat interval (see
 * `HEARTBEAT_INTERVAL_MS` in `adhdisplay-companion/App.tsx`), generous
 * enough to absorb one or two missed beats from a flaky LAN without
 * flapping the indicator. Originally lived (as `OFFLINE_THRESHOLD_MS`)
 * inside `displayUpdateState.ts`, where it was private and only ever
 * surfaced through the mobile-only update badge; it moved here so the
 * connection dot and the update resolver can't drift apart.
 */
export const DISPLAY_ONLINE_THRESHOLD_MS = 90_000

/**
 * How long past `DISPLAY_ONLINE_THRESHOLD_MS` a display is reported as
 * merely `reconnecting` rather than `offline`. A display that misses its
 * heartbeat window is usually mid-reboot, mid-Wi-Fi-roam or mid-update
 * rather than genuinely gone, and calling that "offline" in red trains an
 * admin to ignore the colour. Ten minutes is deliberately longer than a
 * companion app's own cold start plus an OTA reload.
 */
export const DISPLAY_RECONNECTING_THRESHOLD_MS = 600_000

/**
 * How live a display is, as shown by its own status dot. `'never'` is
 * distinct from `'offline'` on purpose: a machine with no usable
 * `lastSeenAt` at all has never actually checked in (a hand-seeded or
 * corrupted entry), which is a different problem from one that checked in
 * and then stopped — and colouring it red would report a healthy fleet as
 * broken.
 */
export type DisplayConnectionStatus = 'online' | 'reconnecting' | 'offline' | 'never'

/**
 * Resolves a display's connection status from its own last heartbeat.
 * Pure and clock-injectable — `now` is passed in (rather than read from
 * `Date.now()` internally) so a caller re-rendering on a ticker, such as
 * `useNow` in the Display Manager, actually re-resolves instead of
 * returning a value memoized against a stale render.
 */
export function resolveDisplayConnectionStatus(lastSeenAt: string | undefined, now: number = Date.now()): DisplayConnectionStatus {
  const lastSeenMs = lastSeenAt ? new Date(lastSeenAt).getTime() : Number.NaN
  if (!Number.isFinite(lastSeenMs)) return 'never'

  const age = now - lastSeenMs
  if (age <= DISPLAY_ONLINE_THRESHOLD_MS) return 'online'
  if (age <= DISPLAY_RECONNECTING_THRESHOLD_MS) return 'reconnecting'
  return 'offline'
}
