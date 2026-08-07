import type { DisplayMachine } from '../types/displayMachine'

/**
 * A display is considered offline once its last heartbeat is older than
 * this — 4.5x the companion app's own 20s heartbeat interval (see
 * `HEARTBEAT_INTERVAL_MS` in `adhdisplay-companion/App.tsx`), generous
 * enough to absorb one or two missed beats from a flaky LAN without
 * flapping the badge.
 */
const OFFLINE_THRESHOLD_MS = 90_000

export type DisplayUpdateState = 'current' | 'ota-available' | 'apk-available' | 'apk-prompted' | 'usb-required' | 'unknown' | 'offline'

/** The hub-side reference this resolver compares a machine's own reported fields against — see `getUpdatesStatus` in `server/updates.ts`, which both `server/index.ts`'s `GET /updates/status` route and (indirectly, via that route) `DisplayManagerView.tsx` read this from. */
export interface UpdatesHubStatus {
  currentApk: { versionCode: number; versionName: string; runtimeVersion: string } | null
  currentUpdateIdByRuntimeVersion: Record<string, string>
  rolledBackRuntimeVersions: string[]
}

/**
 * Resolves one display's update state deterministically — see the Update
 * Channel spec §5.3 ("server-side, deterministic, NOT in UI"). A single
 * shared pure function, imported by both `server/index.ts` and
 * `DisplayManagerView.tsx` directly, rather than reimplemented per side —
 * the "not in UI" requirement is about there being exactly one source of
 * truth for the resolution logic, not about which process happens to call
 * it, and this function has no server-only dependencies (no filesystem, no
 * secrets) that would force a round-trip.
 *
 * `null` means "nothing to show yet," not "current." A machine can resolve
 * to `null` for a few separate, deliberate reasons: no `hubStatus` at all
 * (the caller hasn't fetched it yet), nothing published for this machine's
 * own `runtimeVersion` yet, or — for a native-stale, Tier-1 machine
 * specifically — `usb-required` needing a floor `versionCode` marking the
 * first update-channel-capable release, which genuinely can't be hardcoded
 * yet: it's only knowable once a real first release actually ships with a
 * real version number, and guessing one would violate the same "fail
 * visible" rule that keeps `unknown` from ever collapsing into `current`.
 * `apk-available`/`apk-prompted` (Tier 2/3) don't have this problem — a
 * device that reports `updateTier` 2 or 3 at all necessarily already has
 * commit 7's own code, so there's no equivalent "which build first had
 * this" ambiguity to resolve.
 */
export function resolveDisplayUpdateState(machine: DisplayMachine, hubStatus?: UpdatesHubStatus | null): DisplayUpdateState | null {
  const lastSeenMs = new Date(machine.lastSeenAt).getTime()
  if (!Number.isFinite(lastSeenMs) || Date.now() - lastSeenMs > OFFLINE_THRESHOLD_MS) return 'offline'
  if (machine.versionCode === undefined) return 'unknown'
  if (!hubStatus?.currentApk) return null

  const nativeCurrent = machine.versionCode === hubStatus.currentApk.versionCode
  if (!nativeCurrent) {
    if (machine.updateTier === 2) return 'apk-available'
    if (machine.updateTier === 3) return 'apk-prompted'
    return null // usb-required — see this function's own doc comment
  }

  const currentUpdateId = machine.runtimeVersion ? hubStatus.currentUpdateIdByRuntimeVersion[machine.runtimeVersion] : undefined
  if (!currentUpdateId) return null // nothing published for this runtime version yet
  return machine.updateId === currentUpdateId ? 'current' : 'ota-available'
}
