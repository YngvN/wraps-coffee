/**
 * How this deployment's kiosk windows should open when a Windows machine
 * boots — read by `installer/start-wraps-coffee.bat`'s own `:launch_window`
 * subroutine (via `GET /window-launch-method`), which is what actually acts
 * on it. `auto` (the default) keeps that script's original behavior: a
 * native Electron kiosk window if Electron installed successfully, falling
 * back to Microsoft Edge's own `--kiosk` mode otherwise (see
 * `wraps-coffee.iss` for why Electron's own binary download can fail even
 * when the rest of `npm install` succeeds). `electron`/`edge` force one or
 * the other outright regardless of what's installed — mainly useful for
 * comparing the two on real hardware.
 */
export type WindowLaunchMethod = 'auto' | 'electron' | 'edge'

/** Machine-level, not per-device — same posture as `ScreenAddressSettings`: stored server-side via dedicated `/window-launch-method` routes, read directly by a plain HTTP GET from the Windows batch script (which has no WebSocket client), not part of the generic synced-key system. */
export interface WindowLaunchSettings {
  method: WindowLaunchMethod
}

export const DEFAULT_WINDOW_LAUNCH_SETTINGS: WindowLaunchSettings = { method: 'auto' }
