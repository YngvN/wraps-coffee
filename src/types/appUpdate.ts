/**
 * Types shared between the in-app updater's server module
 * (`server/appUpdate/`) and its admin UI (`AppUpdateSettingsView`).
 *
 * The updater pulls the newest code from GitHub and applies it in place, so a
 * change no longer requires re-running the Windows installer on the kiosk. Not
 * related to `src/types/displayMachine.ts`'s `DisplayUpdateProgress`, which
 * tracks Expo OTA updates being pushed *out* to Companion display machines.
 */

/** Where an in-flight update has got to. Mirrors `AppUpdateState` in `server/appUpdate/state.ts`. */
export interface AppUpdateState {
  runId: string
  startedAt: string
  updatedAt: string
  status: 'running' | 'succeeded' | 'failed'
  step: AppUpdateStep
  percent: number
  fromVersion: string
  toVersion: string
  sha: string
  changedFiles: number
  lockfileChanged: boolean
  error?: string
  logTail?: string[]
  launcherScriptsChanged?: string[]
}

/**
 * The phases of an update, in order. The first four run while the server is
 * still alive and are reported by it; `swapping` and `restarting` are written
 * by the detached helper, because by then the server has been killed.
 */
export type AppUpdateStep =
  | 'downloading'
  | 'staging'
  | 'installing-deps'
  | 'building'
  | 'handing-off'
  | 'swapping'
  | 'restarting'
  | 'done'

/** What an update would change, computed from hashes without downloading anything. */
export interface UpdatePlan {
  sha: string
  shortSha: string
  commitMessage: string
  committedAt: string
  installedVersion: string
  remoteVersion: string
  changed: { path: string; sha: string; size: number }[]
  removed: string[]
  all: { path: string; sha: string }[]
  /** Dependencies changed — a much slower update, and the only one that needs `npm install` to run. */
  lockfileChanged: boolean
  /** Launcher scripts that changed upstream but cannot be applied in place (see `server/appUpdate/paths.ts`); the installer must be re-run to pick these up. */
  launcherScriptsChanged: string[]
}

/** Which repository the kiosk tracks. The token is never sent to a client — only whether one exists, and its last four characters. */
export interface AppUpdateConfig {
  owner: string
  repo: string
  branch: string
  hasToken: boolean
  tokenHint: string | null
}

export type AppUpdateCheckResult = { ok: true; updateAvailable: boolean; plan: UpdatePlan } | { ok: false; error: string }
