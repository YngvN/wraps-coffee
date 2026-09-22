import { spawn, spawnSync } from 'node:child_process'
import { copyFileSync, cpSync, existsSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { GithubCredentials } from '../store'
import { fetchBlob } from './github'
import { APP_ROOT, NEXT_DIR, PREVIOUS_DIR, UPDATE_ROOT, gitBlobSha } from './paths'
import type { UpdatePlan } from './plan'
import { patchState, redact, writeState, type AppUpdateState } from './state'

const IS_WINDOWS = process.platform === 'win32'

/** Junctioned into the staged tree rather than copied — see `linkPreserved`. */
const LINKED_DIRS = ['node_modules', 'public/fonts']

/**
 * Makes the live install's heavy directories visible inside the staged tree
 * without copying them.
 *
 * `node_modules` is ~1 GB and `public/fonts` is 41 MB of ~2000 files, and the
 * build needs both: `tsc`/`vite` resolve through `node_modules`, and Vite's
 * `publicDir` copy is what puts `dist/fonts/google-fonts.css` in the output.
 * A Windows directory junction costs nothing, needs no admin rights (unlike a
 * symlink) and both tools resolve straight through it.
 */
function linkPreserved(): void {
  for (const relative of LINKED_DIRS) {
    const target = join(APP_ROOT, relative)
    const link = join(NEXT_DIR, relative)
    if (!existsSync(target)) continue
    mkdirSync(dirname(link), { recursive: true })
    if (IS_WINDOWS) {
      spawnSync('cmd', ['/c', 'mklink', '/J', link, target], { stdio: 'ignore' })
    } else {
      symlinkSync(target, link)
    }
  }
}

/**
 * Removes the junctions before the swap.
 *
 * **Never use `rmSync(link, { recursive: true })` here.** A recursive delete
 * follows a junction into its target, which would destroy the live
 * `node_modules` or every installed font — unrecoverable on a kiosk with no
 * git and a café internet connection. `rmdir` without `/s` removes the link
 * itself and refuses to touch what it points at; `unlinkSync`/non-recursive
 * `rmSync` is the POSIX equivalent. This is the most dangerous line in the
 * feature.
 */
function unlinkPreserved(): void {
  for (const relative of LINKED_DIRS) {
    const link = join(NEXT_DIR, relative)
    if (!existsSync(link)) continue
    if (IS_WINDOWS) spawnSync('cmd', ['/c', 'rmdir', link], { stdio: 'ignore' })
    else rmSync(link, { recursive: false, force: true })
  }
}

/** Runs a command in the staged tree, collecting output for the failure log. */
function run(command: string, args: string[], cwd: string): Promise<{ ok: boolean; output: string[] }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd, shell: IS_WINDOWS })
    const output: string[] = []
    const collect = (chunk: Buffer) => {
      for (const line of chunk.toString('utf-8').split('\n')) {
        if (line.trim()) output.push(redact(line.trimEnd()))
      }
      // Keep only a tail — an npm install can emit tens of thousands of lines.
      if (output.length > 400) output.splice(0, output.length - 400)
    }
    child.stdout.on('data', collect)
    child.stderr.on('data', collect)
    child.on('error', (error) => resolve({ ok: false, output: [...output, redact(String(error))] }))
    child.on('close', (code) => resolve({ ok: code === 0, output }))
  })
}

/**
 * Builds the complete candidate tree in `C:\ADHDisplayUpdate\next`, then — only
 * if it compiles — hands off to the detached helper that swaps it in.
 *
 * Everything expensive and fallible happens here, while the server is still
 * running and the kiosk is still serving the old build. A broken commit fails
 * at `npm run build` with the live install untouched, which turns the scariest
 * failure mode ("the kiosk is down and the new code doesn't compile") into an
 * error message.
 *
 * The staged tree is assembled to match the repository exactly: files whose
 * hash already matches are copied from the install, the rest are downloaded.
 * Files the install has but the repo no longer does are simply never copied,
 * so there is no delete path to get wrong.
 */
export async function runUpdate(plan: UpdatePlan, credentials: GithubCredentials, token: string, dryRun: boolean): Promise<void> {
  const state: AppUpdateState = {
    runId: `${Date.now()}`,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: 'running',
    step: 'downloading',
    percent: 0,
    fromVersion: plan.installedVersion,
    toVersion: plan.remoteVersion,
    sha: plan.sha,
    changedFiles: plan.changed.length,
    lockfileChanged: plan.lockfileChanged,
    launcherScriptsChanged: plan.launcherScriptsChanged.length ? plan.launcherScriptsChanged : undefined,
  }
  writeState(state)

  try {
    // Remove any junctions left behind by a previous run BEFORE the recursive
    // delete below. A run that died between `linkPreserved` and
    // `unlinkPreserved` leaves `next/node_modules` and `next/public/fonts`
    // pointing at the live install, and a recursive delete that follows a
    // junction would empty the real `node_modules` and every installed font —
    // unrecoverable on a kiosk with no git and a café connection. Doing this
    // first makes the delete safe regardless of how the platform happens to
    // treat junctions.
    unlinkPreserved()
    rmSync(NEXT_DIR, { recursive: true, force: true })
    mkdirSync(NEXT_DIR, { recursive: true })

    const toDownload = new Map(plan.changed.map((entry) => [entry.path, entry.sha]))
    let done = 0
    for (const entry of plan.all) {
      const destination = join(NEXT_DIR, entry.path)
      mkdirSync(dirname(destination), { recursive: true })
      if (toDownload.has(entry.path)) {
        const contents = await fetchBlob(credentials, token, entry.sha)
        // The blobs endpoint is addressed by hash, so this should never fire —
        // but writing unverified bytes into the tree that is about to become
        // the running app is not a risk worth taking.
        if (gitBlobSha(contents) !== entry.sha) throw new Error(`Downloaded ${entry.path} did not match its expected hash.`)
        writeFileSync(destination, contents)
        done += 1
        patchState({ percent: Math.round((done / Math.max(toDownload.size, 1)) * 60), step: 'downloading' })
      } else {
        copyFileSync(join(APP_ROOT, entry.path), destination)
      }
    }

    patchState({ step: 'staging', percent: 65 })
    linkPreserved()

    if (plan.lockfileChanged) {
      // A dependency changed, so the junction can't be used — npm would write
      // through it into the live install. Copy instead, which also reuses the
      // already-downloaded Electron and sharp binaries rather than refetching
      // them over a café connection.
      patchState({ step: 'installing-deps', percent: 70 })
      unlinkPreserved()
      cpSync(join(APP_ROOT, 'node_modules'), join(NEXT_DIR, 'node_modules'), { recursive: true })
      if (existsSync(join(APP_ROOT, 'public/fonts'))) {
        cpSync(join(APP_ROOT, 'public/fonts'), join(NEXT_DIR, 'public/fonts'), { recursive: true })
      }
      const install = await run('npm', ['install', '--no-audit', '--no-fund'], NEXT_DIR)
      if (!install.ok) {
        fail('Installing dependencies failed. Nothing on this machine was changed.', install.output)
        return
      }
    }

    patchState({ step: 'building', percent: 80 })
    const build = await run('npm', ['run', 'build'], NEXT_DIR)
    if (!build.ok) {
      fail('The new version failed to build. Nothing on this machine was changed.', build.output)
      return
    }

    if (dryRun) {
      patchState({ status: 'succeeded', step: 'done', percent: 100, error: undefined })
      return
    }

    patchState({ step: 'handing-off', percent: 90 })
    handOff(plan)
  } catch (error) {
    fail(redact(error instanceof Error ? error.message : String(error)))
  }
}

function fail(message: string, logTail?: string[]): void {
  patchState({ status: 'failed', step: 'done', error: message, logTail })
}

/**
 * Spawns the detached helper and returns immediately.
 *
 * The helper must outlive this process — it is about to kill it — so it is
 * `detached` with `stdio: 'ignore'` and `unref`'d, the same shape as
 * `server/assistant/ollamaClient.ts`'s Ollama launch. It runs from a copy in
 * the update root rather than from `{app}`, because Windows refuses to rename
 * a directory that is any running process's working directory.
 */
function handOff(plan: UpdatePlan): void {
  const helperSource = join(APP_ROOT, 'apply-update.ps1')
  const helper = join(UPDATE_ROOT, 'apply-update.ps1')
  if (!existsSync(helperSource)) {
    fail('The update helper script (apply-update.ps1) is missing from the install. Re-run the installer once to add it.')
    return
  }
  copyFileSync(helperSource, helper)
  writeFileSync(join(UPDATE_ROOT, 'plan.json'), JSON.stringify({ sha: plan.sha, toVersion: plan.remoteVersion, appDir: APP_ROOT }), 'utf-8')

  const child = spawn(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', helper, '-AppDir', APP_ROOT, '-UpdateRoot', UPDATE_ROOT],
    { cwd: UPDATE_ROOT, detached: true, stdio: 'ignore' },
  )
  child.unref()
}

export { NEXT_DIR, PREVIOUS_DIR }
