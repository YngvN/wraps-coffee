import type { ScreenConfig } from '../../../types/screen'
import type { DisplayMachine, DisplayMonitor, DisplayScreenOverride } from '../../../types/displayMachine'

/**
 * The screen one monitor is *actually* showing right now, as opposed to the
 * one an admin assigned it. `null` means the bouncing-company-name standby
 * screensaver (see `DisplayStandby`), which is what an unassigned monitor
 * shows — not "unknown".
 *
 * Precedence matches the rendering path rather than this view's own form
 * fields: a remote-navigation override (`admin.displayScreenOverride`, set
 * from the TV's own remote) wins over `monitor.assignedScreenID`, because
 * that is what the device is really rendering until the override is cleared.
 * Showing the assigned screen's thumbnail while the TV displays something
 * else is precisely the mismatch the D1 safety model exists to prevent.
 *
 * An override is stored per *machine*, not per monitor — only `mobile`
 * (companion) displays can set one and they have a single monitor — so it
 * applies to every monitor on that machine.
 */
export function resolveDisplayedScreen(
  machine: DisplayMachine,
  monitor: DisplayMonitor,
  screens: ScreenConfig[],
  overrides: DisplayScreenOverride[],
): ScreenConfig | null {
  const override = overrides.find((entry) => entry.machineID === machine.machineID)
  const screenId = override?.screenId ?? monitor.assignedScreenID
  if (!screenId) return null
  return screens.find((screen) => screen.screenID === screenId) ?? null
}
