/** How a display registered itself: `electron` — a kiosk machine's own detected monitor (see `electron/displayManager.cjs`); `url` — a plain browser tab that visited `/display-connect` (no Electron involved), identified by a `localStorage`-persisted id instead of a real monitor. */
export type DisplayConnectionType = 'electron' | 'url'

/** One physical monitor (or, for a `url`-connection machine, the one synthetic "monitor" standing in for that browser tab). `id` is stable across heartbeats from the same machine/tab so an admin's `assignedScreenID` choice survives them. */
export interface DisplayMonitor {
  id: string
  label: string
  assignedScreenID: string | null
}

/** A machine (or browser tab) that has heartbeated itself in at least once — see `POST /display-machines/heartbeat` in `server/index.ts`. `machineID` is generated once and persisted (see `display-role.json` for Electron, `localStorage` for a `url` connection) so the same physical device/tab keeps being recognized across restarts/reloads. */
export interface DisplayMachine {
  machineID: string
  label: string
  connectionType: DisplayConnectionType
  monitors: DisplayMonitor[]
  lastSeenAt: string
}
