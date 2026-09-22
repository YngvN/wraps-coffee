import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { UPDATE_ROOT } from './paths'

/**
 * The update's progress record.
 *
 * This is a plain file rather than a `SyncedKey`, and that is the whole point:
 * the process reporting progress is the one that gets killed partway through,
 * so a WebSocket broadcast cannot survive its own broadcaster. Both the server
 * (before it hands off) and the detached helper (after the server is dead)
 * write here, and the admin UI polls `GET /app-update/status`, treating a
 * connection failure as the "restarting" phase rather than an error.
 *
 * It also means no `SYNCED_KEYS` entry — and therefore no way for a client to
 * forge a "succeeded" state over the sync socket.
 */
export interface AppUpdateState {
  runId: string
  startedAt: string
  updatedAt: string
  status: 'running' | 'succeeded' | 'failed'
  step: AppUpdateStep
  /** 0-100, for the download phase and the overall bar. */
  percent: number
  fromVersion: string
  toVersion: string
  sha: string
  changedFiles: number
  lockfileChanged: boolean
  /** Populated on failure. Already redacted of anything token-shaped. */
  error?: string
  /** Last lines of npm/build output on failure — the only way to debug a kiosk you can't reach. */
  logTail?: string[]
  /** Launcher scripts that changed upstream but cannot be applied in place; the admin must re-run the installer. */
  launcherScriptsChanged?: string[]
}

export type AppUpdateStep =
  | 'downloading'
  | 'staging'
  | 'installing-deps'
  | 'building'
  | 'handing-off'
  | 'swapping'
  | 'restarting'
  | 'done'

const STATE_FILE = join(UPDATE_ROOT, 'state.json')

/**
 * Anything token-shaped is stripped before it reaches the state file, which is
 * served to the admin UI and written to logs. `npm` and `fetch` both echo full
 * URLs on failure, and a PAT in a query string would otherwise land in both.
 */
export function redact(text: string): string {
  return text.replace(/gh[pousr]_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{20,}/g, '<redacted token>')
}

export function readState(): AppUpdateState | null {
  if (!existsSync(STATE_FILE)) return null
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf-8')) as AppUpdateState
  } catch {
    return null
  }
}

/**
 * Writes the state atomically — a temp file plus a rename — because the admin
 * UI polls this file roughly every two seconds and a torn read during a plain
 * `writeFileSync` would surface as a JSON parse error mid-update.
 */
export function writeState(state: AppUpdateState) {
  mkdirSync(UPDATE_ROOT, { recursive: true })
  const temp = `${STATE_FILE}.tmp`
  writeFileSync(temp, JSON.stringify(state, null, 2), 'utf-8')
  renameSync(temp, STATE_FILE)
}

/** Merges a patch into the current state and stamps `updatedAt`. */
export function patchState(patch: Partial<AppUpdateState>): AppUpdateState | null {
  const current = readState()
  if (!current) return null
  const next: AppUpdateState = { ...current, ...patch, updatedAt: new Date().toISOString() }
  writeState(next)
  return next
}

/**
 * Reconciles a state left behind by a server that died mid-update.
 *
 * Called once at boot. If the stored state says `running` but this process has
 * only just started, the helper either finished (and the version on disk now
 * matches the target) or it was interrupted — by a failed swap, a killed
 * helper, or the machine losing power. Either way the record must reach a
 * terminal state, or the UI shows a spinner forever.
 */
export function reconcileAfterRestart(currentVersion: string): void {
  const state = readState()
  if (!state || state.status !== 'running') return

  if (state.step === 'restarting' || state.step === 'swapping' || state.step === 'handing-off') {
    const succeeded = currentVersion === state.toVersion || state.toVersion === 'unknown'
    writeState({
      ...state,
      updatedAt: new Date().toISOString(),
      status: succeeded ? 'succeeded' : 'failed',
      step: 'done',
      percent: 100,
      error: succeeded
        ? undefined
        : `The update was interrupted while applying. The previous version was restored or left in place; the tree from before the update is kept in ${UPDATE_ROOT}.`,
    })
    return
  }

  // Died before the hand-off: nothing was swapped, so the install is untouched.
  writeState({
    ...state,
    updatedAt: new Date().toISOString(),
    status: 'failed',
    step: 'done',
    error: 'The server restarted before the update was applied. Nothing was changed.',
  })
}
