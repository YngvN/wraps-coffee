import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, posix, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

/**
 * The install root — `C:\ADHDisplay` on a kiosk, the repo root in development.
 * Derived from this module's own location (`<root>/server/appUpdate/`) rather
 * than `process.cwd()`, which is whatever directory `npm run preview:kiosk`
 * happened to be launched from.
 */
export const APP_ROOT = join(__dirname, '..', '..')

/**
 * Scratch root for an update in flight, a *sibling* of the install rather than
 * a child of it — same volume, so the final swap is a handful of instant
 * `renameSync` calls instead of a multi-minute copy, and nothing inside
 * `{app}` has to be walked around while the tree is being rebuilt. Same
 * placement precedent as `server/backup.ts`'s sibling `ADHDisplayBackup`
 * folder.
 *
 * Deliberately NOT under `server/data/`: this is disposable scratch, and
 * `server/backup.ts` mirrors that whole directory into every backup zip.
 */
export const UPDATE_ROOT = join(APP_ROOT, '..', 'ADHDisplayUpdate')

/** The fully-built candidate tree. Swapped into `{app}` only after it compiles. */
export const NEXT_DIR = join(UPDATE_ROOT, 'next')

/** The pre-swap tree, kept after a successful update as the manual escape hatch. */
export const PREVIOUS_DIR = join(UPDATE_ROOT, 'previous')

/**
 * Paths that belong to the machine, not to the repository. Never replaced,
 * never deleted, and — critically — never treated as "deleted upstream" just
 * because GitHub's tree doesn't list them.
 *
 * `server/data/` and `server/uploads/` hold every product, screen and user,
 * plus `display-role.json`, whose machine ID must not be cloned between
 * installs (`electron/roleSetup.cjs`). `server/news-image-cache/` is a
 * disposable cache. `public/fonts/` is the one that will bite you: it is 41 MB
 * of ~2000 files, it is **gitignored** (so it does not exist in any GitHub
 * tree listing), it is put on the kiosk by the installer's own `public\*`
 * entry, and `vite build` copies it into `dist/`. Treating it as deleted
 * upstream would wipe every font on every screen, and the only symptom would
 * be that the screens quietly fall back to a system font.
 *
 * Each entry matches `.gitignore`'s own list — keep them together.
 */
const PRESERVED_PREFIXES = ['server/data/', 'server/uploads/', 'server/news-image-cache/', 'public/fonts/']

/** Whole subtrees that ship verbatim, repo path === install path. */
export const MIRRORED_DIRS = ['src/', 'server/', 'public/', 'electron/']

/** Individual repo-root files that ship. */
export const ROOT_FILES = [
  'package.json',
  'package-lock.json',
  'vite.config.ts',
  'tsconfig.json',
  'tsconfig.app.json',
  'tsconfig.node.json',
  'index.html',
]

/**
 * The launcher/helper scripts that `installer/adhdisplay.iss` flattens from
 * `installer/` into the app root.
 *
 * **These are deliberately never written by the updater.** `start-adhdisplay.bat`
 * is being executed by a live `cmd.exe` at the moment any update runs, and
 * `cmd.exe` re-reads a running batch file from disk by byte offset every time
 * it loops — the `:server_watchdog` loop at `installer/start-adhdisplay.bat:79`
 * does exactly that, forever. Replacing the file underneath it makes the next
 * `goto` land at an arbitrary offset in the new file and execute whatever
 * fragment happens to be there. On a kiosk that is a brick.
 *
 * So this list exists only so `check` can *detect* that they drifted and tell
 * the admin that this particular update needs the installer re-run. It must
 * never be fed to the swap.
 */
export const LAUNCHER_SCRIPT_EXTENSIONS = ['.bat', '.ps1', '.vbs', '.cjs']

/**
 * Maps a path as GitHub reports it (POSIX, repo-relative) to its path inside
 * the install, or `null` for everything the install does not contain — `QA/`,
 * `docs/`, `diagnostics/`, `.github/`, `installer/`, and above all
 * `adhdisplay-companion/`, whose committed release APK is 936 MB of the
 * repository's ~1025 MB. Skipping those is the whole reason an update moves
 * kilobytes instead of a gigabyte.
 *
 * This is the mirror image of `installer/adhdisplay.iss`'s `[Files]` section
 * minus the launcher scripts above, and it is the one part of this feature
 * that rots silently: a file added to the installer but not here installs on a
 * fresh machine and then never updates again.
 */
export function mapRepoPath(repoPath: string): string | null {
  if (isPreserved(repoPath)) return null
  if (MIRRORED_DIRS.some((dir) => repoPath.startsWith(dir))) return repoPath
  if (ROOT_FILES.includes(repoPath)) return repoPath
  return null
}

/** Whether a path belongs to the machine rather than the repo — see `PRESERVED_PREFIXES`. */
export function isPreserved(installPath: string): boolean {
  return PRESERVED_PREFIXES.some((prefix) => installPath === prefix.slice(0, -1) || installPath.startsWith(prefix))
}

/** The repo path of a launcher script that the installer flattens to `{app}\<name>`, or `null`. Used for drift detection only — never for writing. */
export function launcherScriptName(repoPath: string): string | null {
  if (!repoPath.startsWith('installer/')) return null
  const name = repoPath.slice('installer/'.length)
  if (name.includes('/')) return null
  return LAUNCHER_SCRIPT_EXTENSIONS.some((ext) => name.endsWith(ext)) ? name : null
}

/**
 * Computes the same SHA-1 git itself would store for this content, so a remote
 * tree listing can be diffed against the local install with no git binary
 * present (there is none on the kiosk) and nothing downloaded.
 */
export function gitBlobSha(contents: Buffer): string {
  return createHash('sha1').update(`blob ${contents.length}\0`).update(contents).digest('hex')
}

/** `gitBlobSha` of a file inside `root`, or `null` if it isn't there. */
export function blobShaAt(root: string, installPath: string): string | null {
  const absolute = join(root, installPath)
  if (!existsSync(absolute) || !statSync(absolute).isFile()) return null
  return gitBlobSha(readFileSync(absolute))
}

/**
 * Git's own heuristic for "is this a text file": a NUL byte in the first 8000
 * bytes means binary. Used only to decide whether line-ending normalization
 * could apply, so a false negative costs one needless download, never a wrong
 * result.
 */
function looksBinary(contents: Buffer): boolean {
  return contents.subarray(0, 8000).includes(0)
}

/**
 * Whether the installed file already matches what the repository holds.
 *
 * Not simply `blobShaAt(...) === remoteSha`, because this repository's
 * `.gitattributes` sets `* text=auto`: git stores every text file LF-normalized
 * but checks it out with CRLF on Windows, which is exactly what is on the
 * kiosk. A raw byte comparison would therefore report every text file as
 * changed forever — measured: 5 of 699 files differ this way even on macOS, and
 * on a Windows checkout it is nearly all of them, which would turn every update
 * into a full ~6.5 MB re-download of files whose content is identical.
 *
 * So a file counts as unchanged when either its bytes or its LF-normalized
 * bytes hash to the remote blob. Normalizing is what git is doing on the other
 * side of the comparison, so this makes the two agree rather than papering over
 * a difference: the only change it can hide is one purely of line endings,
 * which neither `tsc` nor `vite` can observe.
 */
export function matchesRemote(root: string, installPath: string, remoteSha: string): boolean {
  const absolute = join(root, installPath)
  if (!existsSync(absolute) || !statSync(absolute).isFile()) return false
  const contents = readFileSync(absolute)
  if (gitBlobSha(contents) === remoteSha) return true
  if (looksBinary(contents)) return false
  return gitBlobSha(Buffer.from(contents.toString('binary').replace(/\r\n/g, '\n'), 'binary')) === remoteSha
}

/**
 * Every file under the mirrored trees of `root`, as POSIX relative paths,
 * skipping preserved and generated directories.
 *
 * Used to spot files deleted upstream: anything listed here but absent from the
 * remote tree was removed in a later commit and must be removed locally too, or
 * a deleted module keeps being imported. The `isPreserved` skip is what keeps
 * `public/fonts`'s 2000 untracked files from being read as 2000 deletions.
 */
export function listTrackedFiles(root: string): string[] {
  const found: string[] = []
  const walk = (absoluteDir: string) => {
    if (!existsSync(absoluteDir)) return
    for (const entry of readdirSync(absoluteDir, { withFileTypes: true })) {
      const absolute = join(absoluteDir, entry.name)
      const relative = absolute.slice(root.length + 1).split(sep).join(posix.sep)
      if (entry.isDirectory()) {
        if (isPreserved(relative) || relative === 'node_modules' || relative === 'dist') continue
        walk(absolute)
      } else if (entry.isFile() && entry.name !== '.DS_Store') {
        found.push(relative)
      }
    }
  }
  for (const dir of MIRRORED_DIRS) walk(join(root, dir))
  for (const file of ROOT_FILES) {
    if (existsSync(join(root, file))) found.push(file)
  }
  return found
}
