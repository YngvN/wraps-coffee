import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { GithubCredentials } from '../store'
import { fetchFileAtRef, fetchHead, fetchTree, type RemoteBlob } from './github'
import { APP_ROOT, launcherScriptName, listTrackedFiles, mapRepoPath, matchesRemote } from './paths'

/**
 * What an update would do, computed without downloading anything but a tree
 * listing. This is both the "check" result shown to the admin before they
 * commit, and the instruction set the apply step works from.
 */
export interface UpdatePlan {
  sha: string
  shortSha: string
  commitMessage: string
  committedAt: string
  installedVersion: string
  remoteVersion: string
  /** Files whose content differs from the install, or that the install lacks. Each carries the blob SHA to download. */
  changed: { path: string; sha: string; size: number }[]
  /** Files the install has that the repo no longer does. Not deleted in place — they simply aren't copied into the staged tree. */
  removed: string[]
  /** Every shipped file at this commit, used to build the staged tree. */
  all: { path: string; sha: string }[]
  /** True when dependencies must be reinstalled — much slower, and the only path that needs the kiosk window closed. */
  lockfileChanged: boolean
  /**
   * Launcher scripts (`start-adhdisplay.bat` and friends) that changed upstream.
   * The updater refuses to write these — see `paths.ts` — so a non-empty list
   * means this update is only partially applicable and the installer should be
   * re-run. Surfaced as a warning, never as a failure.
   */
  launcherScriptsChanged: string[]
}

/** Whether anything at all would change. A plan can be non-empty on files while still matching the last applied commit. */
export function planHasWork(plan: UpdatePlan): boolean {
  return plan.changed.length > 0 || plan.removed.length > 0
}

function installedVersion(): string {
  try {
    return (JSON.parse(readFileSync(join(APP_ROOT, 'package.json'), 'utf-8')) as { version?: string }).version ?? 'unknown'
  } catch {
    return 'unknown'
  }
}

/**
 * Diffs the repository at the tracked branch's head against the installed
 * tree, entirely from hashes.
 *
 * The comparison is exact rather than timestamp- or version-based: a git blob
 * SHA is `sha1("blob " + length + "\0" + contents)`, which `paths.ts` computes
 * locally, so "has this file changed" is answered without git, without a
 * download, and without trusting anyone to bump a version number per commit.
 */
export async function computePlan(credentials: GithubCredentials, token: string): Promise<UpdatePlan> {
  const head = await fetchHead(credentials, token)
  const tree = await fetchTree(credentials, token, head.sha)

  const shipped: RemoteBlob[] = []
  const launcherScriptsChanged: string[] = []
  for (const entry of tree) {
    const installPath = mapRepoPath(entry.path)
    if (installPath) {
      shipped.push({ ...entry, path: installPath })
      continue
    }
    // Not shipped by path, but it may still be a launcher script the installer
    // flattens into the app root — those we report on without ever writing.
    const scriptName = launcherScriptName(entry.path)
    if (scriptName && !matchesRemote(APP_ROOT, scriptName, entry.sha)) launcherScriptsChanged.push(scriptName)
  }

  const changed = shipped.filter((entry) => !matchesRemote(APP_ROOT, entry.path, entry.sha))

  const remotePaths = new Set(shipped.map((entry) => entry.path))
  const removed = listTrackedFiles(APP_ROOT).filter((path) => !remotePaths.has(path))

  const remotePackageJson = await fetchFileAtRef(credentials, token, 'package.json', head.sha)

  return {
    sha: head.sha,
    shortSha: head.sha.slice(0, 7),
    commitMessage: head.message,
    committedAt: head.committedAt,
    installedVersion: installedVersion(),
    remoteVersion: (JSON.parse(remotePackageJson) as { version?: string }).version ?? 'unknown',
    changed: changed.map((entry) => ({ path: entry.path, sha: entry.sha, size: entry.size })),
    removed,
    all: shipped.map((entry) => ({ path: entry.path, sha: entry.sha })),
    lockfileChanged: changed.some((entry) => entry.path === 'package-lock.json'),
    launcherScriptsChanged,
  }
}
