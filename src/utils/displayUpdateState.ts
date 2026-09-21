import type { DisplayMachine } from '../types/displayMachine'
import { resolveDisplayConnectionStatus } from './displayConnection'

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
 * `null` means "nothing to show yet," not "current." A machine resolves to
 * `null` for two deliberate reasons: no `hubStatus` at all (the caller
 * hasn't fetched it yet), or nothing published for this machine's own
 * `runtimeVersion` yet.
 *
 * A native-stale machine that reports `updateTier: 1` resolves to
 * `usb-required` — it can't install an APK by any remote mechanism, so a
 * service visit is genuinely the only route and saying so is more useful
 * than showing nothing. This used to return `null` instead, on the grounds
 * that telling a Tier 1 device apart from a pre-Update-Channel one needed a
 * floor `versionCode` marking the first update-channel-capable release. It
 * doesn't: a device that reports a tier *at all* is already running
 * update-channel code, which is the same argument that already justified
 * trusting `updateTier` 2 and 3. Only a machine that has never reported a
 * tier (`undefined`) stays `null`, since that genuinely is unknowable.
 */
export function resolveDisplayUpdateState(machine: DisplayMachine, hubStatus?: UpdatesHubStatus | null, now?: number): DisplayUpdateState | null {
  // Anything short of a live heartbeat counts as offline for update purposes — pushing an update at
  // a display that isn't listening can only fail. The finer `reconnecting`/`never` grades this
  // resolver collapses here are still shown separately by the connection dot (see
  // `resolveDisplayConnectionStatus`), which is the single owner of the staleness thresholds.
  if (resolveDisplayConnectionStatus(machine.lastSeenAt, now) !== 'online') return 'offline'
  if (machine.versionCode === undefined) return 'unknown'
  if (!hubStatus?.currentApk) return null

  const nativeCurrent = machine.versionCode === hubStatus.currentApk.versionCode
  if (!nativeCurrent) {
    if (machine.updateTier === 2) return 'apk-available'
    if (machine.updateTier === 3) return 'apk-prompted'
    if (machine.updateTier === 1) return 'usb-required'
    return null // never reported a tier at all — see this function's own doc comment
  }

  const currentUpdateId = machine.runtimeVersion ? hubStatus.currentUpdateIdByRuntimeVersion[machine.runtimeVersion] : undefined
  if (!currentUpdateId) return null // nothing published for this runtime version yet
  return machine.updateId === currentUpdateId ? 'current' : 'ota-available'
}
