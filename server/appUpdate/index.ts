import { getGithubCredentials, setGithubCredentials, type GithubCredentials } from '../store'
import { GithubError } from './github'
import { computePlan, planHasWork, type UpdatePlan } from './plan'
import { runUpdate } from './apply'
import { readState, type AppUpdateState } from './state'

/**
 * In-app updater: pulls the newest code from GitHub and applies it, so a code
 * change no longer means re-running the Windows installer on the kiosk.
 *
 * The install is an unpacked source tree, not a git checkout, and no git binary
 * exists on the machine — so the diff is computed from git blob hashes against
 * the GitHub Trees API and only changed files are downloaded. See `paths.ts`
 * for the path map (and for which directories are machine-owned and must never
 * be replaced), `apply.ts` for why the build happens in a staging tree before
 * anything is swapped, and `state.ts` for why progress is a file rather than a
 * `SyncedKey`.
 *
 * Not to be confused with `server/updates.ts`, which serves Expo OTA bundles to
 * the Companion Android TV app — a different feature with a different audience.
 */

export { reconcileAfterRestart } from './state'
export type { AppUpdateState } from './state'
export type { UpdatePlan } from './plan'

/** Whether an update is being applied right now. Guards against a second apply landing mid-swap. */
export function isRunning(): boolean {
  return readState()?.status === 'running'
}

export function getState(): AppUpdateState | null {
  return readState()
}

/** The settings blob, with the token replaced by a hint. The real token is never sent to a client. */
export function getPublicConfig(): { owner: string; repo: string; branch: string; hasToken: boolean; tokenHint: string | null } {
  const credentials = getGithubCredentials()
  return {
    owner: credentials.owner,
    repo: credentials.repo,
    branch: credentials.branch,
    hasToken: Boolean(credentials.token),
    tokenHint: credentials.token ? `…${credentials.token.slice(-4)}` : null,
  }
}

export function saveConfig(patch: Partial<GithubCredentials>): void {
  setGithubCredentials(patch)
}

export type CheckResult =
  | { ok: true; updateAvailable: boolean; plan: UpdatePlan }
  | { ok: false; error: string }

/** Resolves the stored token, or an error telling the admin what to do about it. */
function requireToken(): { credentials: GithubCredentials; token: string } | { error: string } {
  const credentials = getGithubCredentials()
  if (!credentials.token) return { error: 'No GitHub token is configured. Add a fine-grained personal access token with Contents: Read on this repository.' }
  return { credentials, token: credentials.token }
}

export async function check(): Promise<CheckResult> {
  const resolved = requireToken()
  if ('error' in resolved) return { ok: false, error: resolved.error }
  try {
    const plan = await computePlan(resolved.credentials, resolved.token)
    return { ok: true, updateAvailable: planHasWork(plan), plan }
  } catch (error) {
    return { ok: false, error: error instanceof GithubError ? error.message : `Could not check for updates: ${String(error)}` }
  }
}

/**
 * Starts an update and returns as soon as it is under way — the whole run takes
 * minutes, far longer than any HTTP request should be held open, and the
 * caller follows it through `GET /app-update/status` instead.
 *
 * `dryRun` stops after the staged build succeeds, without swapping anything.
 * That is the only mode that works off Windows, and it is how the download →
 * stage → build pipeline is exercised on a dev machine.
 */
export async function start(dryRun: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  if (isRunning()) return { ok: false, error: 'An update is already running.' }
  const resolved = requireToken()
  if ('error' in resolved) return { ok: false, error: resolved.error }

  let plan: UpdatePlan
  try {
    plan = await computePlan(resolved.credentials, resolved.token)
  } catch (error) {
    return { ok: false, error: error instanceof GithubError ? error.message : String(error) }
  }
  if (!planHasWork(plan)) return { ok: false, error: 'Already up to date.' }

  // Deliberately not awaited: the run outlives this request, and on a real
  // apply it outlives this process.
  void runUpdate(plan, resolved.credentials, resolved.token, dryRun)
  return { ok: true }
}
