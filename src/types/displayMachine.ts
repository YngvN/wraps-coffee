/** How a display registered itself: `electron` — a kiosk machine's own detected monitor (see `electron/displayManager.cjs`); `url` — a plain browser tab that visited `/display-connect` (no Electron involved), identified by a `localStorage`-persisted id instead of a real monitor; `mobile` — the ADHDisplay Companion app (Expo, Android/iOS/Windows/Linux), which must be approved by an admin clicking Approve in Display Manager (see `DisplayPairingRequest`) before its heartbeat is accepted, unlike the other two. */
export type DisplayConnectionType = 'electron' | 'url' | 'mobile'

/** One physical monitor (or, for a `url`-connection machine, the one synthetic "monitor" standing in for that browser tab). `id` is stable across heartbeats from the same machine/tab so an admin's `assignedScreenID` choice survives them. */
export interface DisplayMonitor {
  id: string
  label: string
  assignedScreenID: string | null
}

/** A machine (or browser tab) that has heartbeated itself in at least once — see `POST /display-machines/heartbeat` in `server/index.ts`. `machineID` is generated once and persisted (see `display-role.json` for Electron, `localStorage` for a `url` connection) so the same physical device/tab keeps being recognized across restarts/reloads. */
export interface DisplayMachine {
  machineID: string
  /** This machine's own self-reported name, re-sent (and so overwritten) on every heartbeat — never what an admin typed into Display Manager's own label field, see `customLabel`. */
  label: string
  /** An admin's own override for this machine's displayed name (Display Manager's own editable label field) — kept as a separate field, rather than writing straight into `label` itself, specifically so it survives this machine's own next heartbeat (which always overwrites `label` unconditionally) the same way `assignedScreenID` already survives one. `null`/absent falls back to showing `label`. */
  customLabel?: string | null
  connectionType: DisplayConnectionType
  monitors: DisplayMonitor[]
  lastSeenAt: string
}

/**
 * A `mobile` (ADHDisplay Companion) device that has announced itself via
 * `POST /display-machines/pairing-heartbeat` but hasn't yet been approved by
 * an admin clicking Approve in Display Manager. A separate, parallel array
 * to `DisplayMachine` — not a `pairingStatus` field bolted onto it — so
 * every existing consumer of `admin.displayMachines` (Display Manager's own
 * assignment dropdown, `server/assistant/entities/displayManager.ts`,
 * `server/storageCleanup.ts`'s staleness sweep, `ScreenDisplay.tsx`'s
 * machine lookup, `DeveloperDocsView.tsx`) keeps assuming every entry there
 * is a real, joined display, with no filtering to add. Precedent:
 * `admin.displayMachineCloseRequests` already lives alongside
 * `admin.displayMachines` as its own array for a related-but-distinct
 * concern.
 */
export interface DisplayPairingRequest {
  machineID: string
  label: string
  createdAt: string
  lastSeenAt: string
}
