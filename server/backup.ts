import AdmZip from 'adm-zip'
import type { IncomingMessage } from 'node:http'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

// Deliberately has zero imports from ./store or ./uploads - it only ever
// operates on plain file paths. store.ts/uploads.ts import `mirrorFile` from
// here, so importing either of them back would create a circular import;
// the HTTP routes in index.ts (which already import all three modules) are
// what call `store.load()` again after a restore to refresh in-memory state.

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, 'data')
const UPLOADS_DIR = join(__dirname, 'uploads')

// Sibling of the app's own root folder (e.g. C:\ADHDisplay -> C:\ADHDisplayBackup)
// so deleting the main install folder can't take the backup down with it.
const APP_ROOT = join(__dirname, '..')
export const BACKUP_ROOT = join(APP_ROOT, '..', 'ADHDisplayBackup')
const BACKUP_DATA_DIR = join(BACKUP_ROOT, 'data')
const BACKUP_UPLOADS_DIR = join(BACKUP_ROOT, 'uploads')
const MANIFEST_FILE = join(BACKUP_ROOT, 'backup-manifest.json')

// Pre-rename sibling folder name, from when this app was called "Wraps
// Coffee". New writes (`mirrorFileNow`) always target BACKUP_ROOT above -
// these are only ever read from, as a fallback, so an install upgrading from
// before the rename doesn't lose access to a backup it already has on disk
// under the old folder name. See `resolveBackupReadDirs`.
const LEGACY_BACKUP_ROOT = join(APP_ROOT, '..', 'WrapsCoffeeBackup')
const LEGACY_BACKUP_DATA_DIR = join(LEGACY_BACKUP_ROOT, 'data')
const LEGACY_BACKUP_UPLOADS_DIR = join(LEGACY_BACKUP_ROOT, 'uploads')
const LEGACY_MANIFEST_FILE = join(LEGACY_BACKUP_ROOT, 'backup-manifest.json')

/** Resolves which sibling backup folder to read from: the current-named one if present, else the pre-rename `WrapsCoffeeBackup` one - so a backup from before the app's rename to ADHDisplay is still found and restorable. */
function resolveBackupReadDirs(): { dataDir: string; uploadsDir: string; manifestFile: string } {
  if (existsSync(BACKUP_DATA_DIR)) return { dataDir: BACKUP_DATA_DIR, uploadsDir: BACKUP_UPLOADS_DIR, manifestFile: MANIFEST_FILE }
  if (existsSync(LEGACY_BACKUP_DATA_DIR)) return { dataDir: LEGACY_BACKUP_DATA_DIR, uploadsDir: LEGACY_BACKUP_UPLOADS_DIR, manifestFile: LEGACY_MANIFEST_FILE }
  return { dataDir: BACKUP_DATA_DIR, uploadsDir: BACKUP_UPLOADS_DIR, manifestFile: MANIFEST_FILE }
}

// Bump this - and add an explicit migration/fallback in restoreBackupFromZip/
// restoreFromBackupFolder below - if a future change would ever stop an older
// backup from restoring cleanly. Usually it wouldn't: every synced key and
// setting is just a flat JSON file, and `store.ts`'s own loadKey already
// falls back to a fresh default for any file that's missing, so an old
// backup that predates a newer key restores fine on its own. Bumped to 2 when
// the `admin.extensions` synced key was renamed to `admin.integrations` (the
// "Extensions" feature became "Integrations") - a rename changes an existing
// file's name rather than adding a new one, so it needs its own fallback
// instead of relying on the "missing file -> default" behavior above; see
// `migrateLegacyDataFile` in store.ts, run on every boot (including right
// after a restore, since the HTTP route that calls this file's restore
// functions always calls `store.load()` again afterward).
const BACKUP_FORMAT_VERSION = 2

interface BackupManifest {
  formatVersion: number
  updatedAt: string
}

function touchManifest() {
  mkdirSync(BACKUP_ROOT, { recursive: true })
  const manifest: BackupManifest = { formatVersion: BACKUP_FORMAT_VERSION, updatedAt: new Date().toISOString() }
  writeFileSync(MANIFEST_FILE, JSON.stringify(manifest), 'utf-8')
}

// A handful of keys get written far more often than the rest — most notably
// `admin-displayMachines.json`, rewritten on every display's own ~20s
// heartbeat (see `mergeDisplayMachineHeartbeat` in server/index.ts). Mirroring
// perfectly synchronously on every single one of those scales the mirror's
// own cost (a full copy + manifest write) with fleet size for no real
// benefit, since nothing reads the backup folder in real time anyway (only a
// manual "restore" does). Coalescing same-path calls that land within this
// window into a single mirror pass keeps the backup "continuously up to
// date" for any practical purpose while cutting redundant disk I/O — a
// low-frequency key (almost everything else) still gets mirrored within
// `MIRROR_DEBOUNCE_MS` of its own write, same as before in every way that
// matters.
const MIRROR_DEBOUNCE_MS = 1000
const pendingMirrors = new Map<string, ReturnType<typeof setTimeout>>()

function mirrorFileNow(absolutePath: string) {
  const backupPath = absolutePath.startsWith(DATA_DIR)
    ? join(BACKUP_DATA_DIR, relative(DATA_DIR, absolutePath))
    : join(BACKUP_UPLOADS_DIR, relative(UPLOADS_DIR, absolutePath))

  mkdirSync(dirname(backupPath), { recursive: true })
  if (existsSync(absolutePath)) {
    copyFileSync(absolutePath, backupPath)
  } else if (existsSync(backupPath)) {
    rmSync(backupPath)
  }
  touchManifest()
}

/**
 * Mirrors a single file under server/data or server/uploads to the
 * equivalent path under the sibling ADHDisplayBackup folder, or removes the
 * mirrored copy if `absolutePath` no longer exists (a deletion). Called
 * right after every real write (or delete) in store.ts/uploads.ts. Debounced
 * per-path (see `MIRROR_DEBOUNCE_MS`) rather than mirrored instantly every
 * time — a burst of writes to the same file within that window (e.g. several
 * kiosks heartbeating in close succession) only ever costs one real mirror
 * pass, reading whatever's on disk once things settle rather than once per
 * write. Call `flushPendingMirrors` first if a caller needs the backup
 * folder guaranteed current *right now* (see `restoreFromBackupFolder`).
 */
export function mirrorFile(absolutePath: string) {
  const existing = pendingMirrors.get(absolutePath)
  if (existing) clearTimeout(existing)
  pendingMirrors.set(
    absolutePath,
    setTimeout(() => {
      pendingMirrors.delete(absolutePath)
      mirrorFileNow(absolutePath)
    }, MIRROR_DEBOUNCE_MS),
  )
}

/** Immediately runs every still-pending debounced mirror instead of waiting for its own timer — so a restore-from-folder (or any other reader of the backup folder) never sees a stale copy just because its own debounce window hadn't elapsed yet. */
export function flushPendingMirrors() {
  for (const [absolutePath, timer] of pendingMirrors) {
    clearTimeout(timer)
    pendingMirrors.delete(absolutePath)
    mirrorFileNow(absolutePath)
  }
}

/**
 * Recurses into subdirectories rather than skipping them — `createBackupZip`
 * (via `addLocalFolder`) and `mirrorFile` (a plain per-path copy, agnostic
 * to depth) both already handle nested paths under `DATA_DIR`/`UPLOADS_DIR`
 * correctly, so a non-recursive restore here used to be the one place a
 * subdirectory (e.g. `server/data/updates/`, see `server/updates.ts`) would
 * go INTO a backup zip but silently not come back OUT on restore. No
 * `BACKUP_FORMAT_VERSION` bump needed for this fix specifically — it's
 * strictly additive (every flat-file backup taken before this change still
 * restores exactly as it did before), which is exactly the "usually it
 * wouldn't" case this constant's own comment already describes.
 */
function copyDirContents(sourceDir: string, destDir: string) {
  mkdirSync(destDir, { recursive: true })
  for (const name of readdirSync(sourceDir)) {
    const sourcePath = join(sourceDir, name)
    const destPath = join(destDir, name)
    if (statSync(sourcePath).isDirectory()) copyDirContents(sourcePath, destPath)
    else copyFileSync(sourcePath, destPath)
  }
}

function hasAnyDataFiles(): boolean {
  return existsSync(DATA_DIR) && readdirSync(DATA_DIR).some((name) => name.endsWith('.json'))
}

/**
 * Runs once at server startup, before `store.load()` seeds anything. On a
 * genuinely fresh install (no per-key files under server/data yet) with a
 * sibling ADHDisplayBackup folder present (or the pre-rename WrapsCoffeeBackup
 * one, see `resolveBackupReadDirs`), restores from it first - this is the
 * "check if the backup folder is there and import" behavior, done here (once,
 * cross-platform) rather than in the Windows-only installer.
 */
export function restoreFromSiblingBackupIfFresh() {
  if (hasAnyDataFiles()) return
  const { dataDir, uploadsDir } = resolveBackupReadDirs()
  if (!existsSync(dataDir)) return
  console.log('[backup] fresh install with a sibling backup folder present — restoring from it')
  copyDirContents(dataDir, DATA_DIR)
  if (existsSync(uploadsDir)) copyDirContents(uploadsDir, UPLOADS_DIR)
}

/** Whether a usable sibling backup folder exists, and when it was last updated — lets the Settings UI show/hide "Restore from backup folder". */
export function backupStatus(): { folderBackupAvailable: boolean; updatedAt: string | null } {
  const { dataDir, manifestFile } = resolveBackupReadDirs()
  if (!existsSync(dataDir)) return { folderBackupAvailable: false, updatedAt: null }
  if (!existsSync(manifestFile)) return { folderBackupAvailable: true, updatedAt: null }
  flushPendingMirrors()
  const manifest = JSON.parse(readFileSync(manifestFile, 'utf-8')) as BackupManifest
  return { folderBackupAvailable: true, updatedAt: manifest.updatedAt }
}

/** Zips the current server/data + server/uploads into an in-memory buffer, for the "Create backup" download. */
export function createBackupZip(): Buffer {
  const zip = new AdmZip()
  if (existsSync(DATA_DIR)) zip.addLocalFolder(DATA_DIR, 'data')
  if (existsSync(UPLOADS_DIR)) zip.addLocalFolder(UPLOADS_DIR, 'uploads')
  return zip.toBuffer()
}

const MAX_RESTORE_ZIP_BYTES = 200 * 1024 * 1024 // generous - a backup includes every uploaded image

/** Reads a raw `POST /backups/restore` body (a zip file, not JSON) up to a size limit — same size-guarded reading loop `uploads.ts`'s own local `readBody` uses, kept as its own small copy here rather than importing across modules (see the module-level note on why this file never imports from `./uploads`). */
export async function readRestoreZipBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of req) {
    total += (chunk as Buffer).length
    if (total > MAX_RESTORE_ZIP_BYTES) throw new Error('PAYLOAD_TOO_LARGE')
    chunks.push(chunk as Buffer)
  }
  return Buffer.concat(chunks)
}

/**
 * Extracts an uploaded zip and, if it looks like a real backup (has a
 * `data/` folder inside it — a cheap guard against restoring an unrelated
 * zip), overwrites server/data and server/uploads with its contents. Doesn't
 * refresh `store`'s in-memory state itself (see the module-level note on why
 * this file never imports from `./store`) — the caller (the HTTP route in
 * server/index.ts) calls `store.load()` again afterward.
 */
export function restoreBackupFromZip(zipBuffer: Buffer): { ok: true } | { ok: false; error: string } {
  const zip = new AdmZip(zipBuffer)
  const entries = zip.getEntries()
  if (!entries.some((entry) => entry.entryName.startsWith('data/'))) {
    return { ok: false, error: "This doesn't look like an ADHDisplay backup zip — no data/ folder found inside it." }
  }

  const stagingDir = join(BACKUP_ROOT, '.restore-staging')
  rmSync(stagingDir, { recursive: true, force: true })
  zip.extractAllTo(stagingDir, true)

  const stagedData = join(stagingDir, 'data')
  const stagedUploads = join(stagingDir, 'uploads')
  if (existsSync(stagedData)) copyDirContents(stagedData, DATA_DIR)
  if (existsSync(stagedUploads)) copyDirContents(stagedUploads, UPLOADS_DIR)
  rmSync(stagingDir, { recursive: true, force: true })

  return { ok: true }
}

/** Same idea as `restoreBackupFromZip`, but reads straight from the sibling ADHDisplayBackup folder (or the pre-rename WrapsCoffeeBackup one, see `resolveBackupReadDirs`) on this same machine's disk — no upload needed. */
export function restoreFromBackupFolder(): { ok: true } | { ok: false; error: string } {
  const { dataDir, uploadsDir } = resolveBackupReadDirs()
  if (!existsSync(dataDir)) {
    return { ok: false, error: 'No ADHDisplayBackup folder found next to the app.' }
  }
  // A still-pending debounced mirror (see `mirrorFile`) means the backup
  // folder could be up to `MIRROR_DEBOUNCE_MS` behind the live data this
  // exact moment — force those through first so a restore never pulls in a
  // copy that's staler than it needs to be.
  flushPendingMirrors()
  copyDirContents(dataDir, DATA_DIR)
  if (existsSync(uploadsDir)) copyDirContents(uploadsDir, UPLOADS_DIR)
  return { ok: true }
}
