import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { mirrorFile } from './backup'
import * as store from './store'
import { registerBeforeUploadDeleteHook, stemOf, UPLOAD_VARIANT_SUFFIXES, UPLOADS_DIR } from './uploads'

// Deliberately doesn't import `ScreenConfig`/`ScreenSlot`/`ScreenSlotContent` from `../src/types/screen`
// — same DOM-lib boundary `storageCleanup.ts` already documents (that file's own `ScreenSlot.language`
// pulls in `LanguageCode`, which transitively re-exports a real React component using `window`/
// `document`, and this project's server-side tsconfig has no `dom` lib). Only the handful of fields
// actually read below are declared here, as a narrower read-only view of the same on-disk JSON shape —
// this is also the *canonical* copy of that shape now (`storageCleanup.ts` imports it from here rather
// than keeping its own separate copy, see this file's own exports below), since this module needs a
// richer view of it (`screenID`/`name`/`draft`) than that one ever did.

export interface MinimalBackgroundImage {
  imageUrl?: string
}
export interface MinimalSlotContent {
  kind?: string
  imageUrl?: string
  backgroundImage?: MinimalBackgroundImage
}
export interface MinimalScreenSlot {
  backgroundImage: Record<number, MinimalBackgroundImage | undefined>
  content: Record<number, MinimalSlotContent | undefined>
}
export interface MinimalScreenConfig {
  screenID: string
  name: string
  backgroundImage?: MinimalBackgroundImage
  paneSlots: Record<string, MinimalScreenSlot>
  draft?: { backgroundImage?: MinimalBackgroundImage; paneSlots?: Record<string, MinimalScreenSlot>; [key: string]: unknown }
  previewImages?: string[]
}

/** Pulls the `/uploads/<filename>` part out of a stored image URL — see `storageCleanup.ts`'s own former copy of this, now reused from here instead of duplicated. */
export function extractUploadFilename(url: string | undefined): string | undefined {
  if (!url) return undefined
  const match = /\/uploads\/([^/?]+)/.exec(url)
  return match?.[1]
}

function collectSlotImageFilenames(slot: MinimalScreenSlot, into: Set<string>) {
  for (const backgroundImage of Object.values(slot.backgroundImage)) {
    const filename = extractUploadFilename(backgroundImage?.imageUrl)
    if (filename) into.add(filename)
  }
  for (const content of Object.values(slot.content)) {
    if (!content) continue
    const ownBackground = extractUploadFilename(content.backgroundImage?.imageUrl)
    if (ownBackground) into.add(ownBackground)
    if (content.kind === 'image') {
      const filename = extractUploadFilename(content.imageUrl)
      if (filename) into.add(filename)
    }
  }
}

/** Every upload filename referenced anywhere across `screens` (background/pane-image/preview, live *and* draft state) — shared by `storageCleanup.ts` (the orphan sweep, scoped to the live store) and this file (scoped to one snapshot's own frozen `screens.json`, for lazy pinning and for filtering a per-screen image restore). */
export function collectImageFilenamesFromScreens(screens: MinimalScreenConfig[]): Set<string> {
  const referenced = new Set<string>()
  for (const screen of screens) {
    const topLevelBackground = extractUploadFilename(screen.backgroundImage?.imageUrl)
    if (topLevelBackground) referenced.add(topLevelBackground)
    const draftBackground = extractUploadFilename(screen.draft?.backgroundImage?.imageUrl)
    if (draftBackground) referenced.add(draftBackground)
    for (const slot of Object.values(screen.paneSlots)) collectSlotImageFilenames(slot, referenced)
    for (const slot of Object.values(screen.draft?.paneSlots ?? {})) collectSlotImageFilenames(slot, referenced)
    for (const previewUrl of screen.previewImages ?? []) {
      const filename = extractUploadFilename(previewUrl)
      if (filename) referenced.add(filename)
    }
  }
  return referenced
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, 'data')
const SNAPSHOTS_DIR = join(DATA_DIR, 'screens-snapshots')

export type SnapshotTier = 'daily' | 'weekly'

// Confirmed via your own explicit call: daily keeps the last 7, weekly the
// last 8 (~2 months) — see the plan's own "Retention" note on why weekly
// needed more than a single overwritten slot too.
const DAILY_RETENTION = 7
const WEEKLY_RETENTION = 8

// Calendar-boundary checked (not "24h since last snapshot") on a cheap
// periodic interval — self-healing if the server was offline exactly at a
// boundary, see this module's own doc comment below.
const CHECK_INTERVAL_MS = 20 * 60 * 1000

function tierDir(tier: SnapshotTier): string {
  return join(SNAPSHOTS_DIR, tier)
}

function snapshotFolder(tier: SnapshotTier, id: string): string {
  return join(tierDir(tier), id)
}

function screensJsonPath(tier: SnapshotTier, id: string): string {
  return join(snapshotFolder(tier, id), 'screens.json')
}

function imagesDirFor(tier: SnapshotTier, id: string): string {
  return join(snapshotFolder(tier, id), 'images')
}

/** Today's date, `YYYY-MM-DD`, in the server's own local timezone — the daily tier's own snapshot id. */
function todayId(now: Date): string {
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** This week's ISO-8601 week id (`YYYY-Www`, Monday-start, week 1 = the week containing the year's first Thursday) — the weekly tier's own snapshot id. Standard ISO week algorithm. */
function isoWeekId(now: Date): string {
  const date = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
  const dayNum = (date.getUTCDay() + 6) % 7 // Monday = 0 .. Sunday = 6
  date.setUTCDate(date.getUTCDate() - dayNum + 3) // move to this week's own Thursday
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4))
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3)
  const week = 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000))
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

interface SnapshotFile {
  /** Real capture timestamp — not implied by the folder's own date/week id, since the scheduler tick that actually creates a snapshot can land minutes (or, after an outage, hours) after the calendar boundary it's for. See this module's own doc comment. */
  capturedAt: string
  screens: unknown[]
}

function readSnapshotFile(tier: SnapshotTier, id: string): SnapshotFile | null {
  const path = screensJsonPath(tier, id)
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as SnapshotFile
  } catch (error) {
    console.error(`[screens-snapshots] could not read ${tier}/${id}/screens.json:`, error)
    return null
  }
}

function captureSnapshot(tier: SnapshotTier, id: string) {
  const screens = (store.get('admin.screens')?.value as unknown[] | undefined) ?? []
  const folder = snapshotFolder(tier, id)
  mkdirSync(folder, { recursive: true })
  const path = screensJsonPath(tier, id)
  const file: SnapshotFile = { capturedAt: new Date().toISOString(), screens }
  writeFileSync(path, JSON.stringify(file), 'utf-8')
  mirrorFile(path)
  console.log(`[screens-snapshots] captured ${tier}/${id} (${screens.length} screen(s)) — no images pinned yet, see this file's own lazy-pinning doc comment`)
}

/** Deletes one snapshot's own files individually (`unlinkSync` + `mirrorFile` per file), never a single recursive folder delete — see this module's own "Rotation" doc comment on why: `mirrorFile` only removes its own mirrored copy when it's told a specific source path is gone, so a bulk `rmSync` would leave the mirror accumulating every rotated-out snapshot forever while the primary store stays bounded. */
function removeSnapshotFolder(tier: SnapshotTier, id: string) {
  const folder = snapshotFolder(tier, id)
  const imagesDir = imagesDirFor(tier, id)
  if (existsSync(imagesDir)) {
    for (const name of readdirSync(imagesDir)) {
      const filePath = join(imagesDir, name)
      unlinkSync(filePath)
      mirrorFile(filePath)
    }
    rmdirSync(imagesDir)
  }
  const screensPath = screensJsonPath(tier, id)
  if (existsSync(screensPath)) {
    unlinkSync(screensPath)
    mirrorFile(screensPath)
  }
  if (existsSync(folder)) rmdirSync(folder)
}

function rotateTier(tier: SnapshotTier, retention: number) {
  const dir = tierDir(tier)
  if (!existsSync(dir)) return
  const withCapturedAt = readdirSync(dir)
    .filter((id) => statSync(join(dir, id)).isDirectory())
    .map((id) => ({ id, file: readSnapshotFile(tier, id) }))
    .filter((entry): entry is { id: string; file: SnapshotFile } => entry.file !== null)
    .sort((a, b) => b.file.capturedAt.localeCompare(a.file.capturedAt))
  for (const { id } of withCapturedAt.slice(retention)) {
    removeSnapshotFolder(tier, id)
    console.log(`[screens-snapshots] rotated out ${tier}/${id} (retention: ${retention})`)
  }
}

function checkAndCreateSnapshots() {
  const now = new Date()
  const dailyId = todayId(now)
  const weeklyId = isoWeekId(now)
  if (!readSnapshotFile('daily', dailyId)) captureSnapshot('daily', dailyId)
  if (!readSnapshotFile('weekly', weeklyId)) captureSnapshot('weekly', weeklyId)
  rotateTier('daily', DAILY_RETENTION)
  rotateTier('weekly', WEEKLY_RETENTION)
}

export interface SnapshotInfo {
  tier: SnapshotTier
  id: string
  capturedAt: string
  screenCount: number
}

/** Every retained snapshot across both tiers, newest-first by its real `capturedAt` timestamp — never by the folder's own date/week id, see this module's own doc comment on why those can diverge. */
export function listSnapshots(): SnapshotInfo[] {
  const results: SnapshotInfo[] = []
  for (const tier of ['daily', 'weekly'] as const) {
    const dir = tierDir(tier)
    if (!existsSync(dir)) continue
    for (const id of readdirSync(dir)) {
      if (!statSync(join(dir, id)).isDirectory()) continue
      const file = readSnapshotFile(tier, id)
      if (file) results.push({ tier, id, capturedAt: file.capturedAt, screenCount: file.screens.length })
    }
  }
  return results.sort((a, b) => b.capturedAt.localeCompare(a.capturedAt))
}

export function readSnapshotScreens(tier: SnapshotTier, id: string): MinimalScreenConfig[] | null {
  const file = readSnapshotFile(tier, id)
  return file ? (file.screens as MinimalScreenConfig[]) : null
}

export type ScreenDiffStatus = 'changed' | 'onlyInSnapshot' | 'onlyInLive'

export interface ScreenDiffEntry {
  screenID: string
  name: string
  status: ScreenDiffStatus
}

function liveScreens(): MinimalScreenConfig[] {
  return (store.get('admin.screens')?.value as MinimalScreenConfig[] | undefined) ?? []
}

/** Which screens actually differ between the live store and one snapshot — the whole-array restore's own confirm dialog shows this before the admin commits to overwriting every screen, not just the one they meant to fix. `null` if the snapshot itself doesn't exist. */
export function diffScreensAgainstLive(tier: SnapshotTier, id: string): ScreenDiffEntry[] | null {
  const snapshotScreens = readSnapshotScreens(tier, id)
  if (!snapshotScreens) return null
  const live = liveScreens()
  const liveByID = new Map(live.map((screen) => [screen.screenID, screen]))
  const snapByID = new Map(snapshotScreens.map((screen) => [screen.screenID, screen]))
  const entries: ScreenDiffEntry[] = []
  for (const [screenID, snapScreen] of snapByID) {
    const liveScreen = liveByID.get(screenID)
    if (!liveScreen) entries.push({ screenID, name: snapScreen.name, status: 'onlyInSnapshot' })
    else if (JSON.stringify(liveScreen) !== JSON.stringify(snapScreen)) entries.push({ screenID, name: liveScreen.name, status: 'changed' })
  }
  for (const [screenID, liveScreen] of liveByID) {
    if (!snapByID.has(screenID)) entries.push({ screenID, name: liveScreen.name, status: 'onlyInLive' })
  }
  return entries
}

/** Every retained snapshot in which `screenID`'s own entry genuinely differs from its current live state — skips a snapshot where this one screen happens to be identical to live, same "only show what's actually different" principle the assistant's own candidate list uses. Powers `ScreenCard`'s own per-screen restore picker. */
export function listSnapshotsForScreen(screenID: string): SnapshotInfo[] {
  const live = liveScreens().find((screen) => screen.screenID === screenID) ?? null
  return listSnapshots().filter(({ tier, id }) => {
    const snapshotScreens = readSnapshotScreens(tier, id)
    const snapScreen = snapshotScreens?.find((screen) => screen.screenID === screenID) ?? null
    if (!snapScreen) return false
    return JSON.stringify(snapScreen) !== JSON.stringify(live)
  })
}

/** The snapshot's own full `screens` array, ready to hand straight to `applyUpdate('admin.screens', ...)` — `null` if the snapshot doesn't exist. Pure data; the caller (an HTTP route in `server/index.ts`, the only place `applyUpdate` is in scope) is what actually applies it live. */
export function screensForWholeRestore(tier: SnapshotTier, id: string): unknown[] | null {
  const file = readSnapshotFile(tier, id)
  return file ? file.screens : null
}

/** `liveScreensArray` with just `screenID`'s own entry replaced by the snapshot's version (or appended, if it's somehow no longer present live) — every other screen is untouched. `null` if the snapshot, or that screen within it, doesn't exist. */
export function screensForSingleScreenRestore(tier: SnapshotTier, id: string, screenID: string, liveScreensArray: unknown[]): unknown[] | null {
  const snapshotScreens = readSnapshotScreens(tier, id)
  const snapScreen = snapshotScreens?.find((screen) => screen.screenID === screenID)
  if (!snapScreen) return null
  const typedLive = liveScreensArray as MinimalScreenConfig[]
  const exists = typedLive.some((screen) => screen.screenID === screenID)
  return exists ? typedLive.map((screen) => (screen.screenID === screenID ? snapScreen : screen)) : [...typedLive, snapScreen]
}

/** Maps a pinned filename (an original, or one of its `-suffix.webp` variants) back to the shared stem every one of an upload's own files share — same stem `stemOf(original)` already produces, so a variant and its own original always group together regardless of which one is being matched against a referenced-filenames set. */
function pinnedFileStem(name: string): string {
  return stemOf(name.replace(/-(?:small|thumb|blur|medium|tiny)\.webp$/, ''))
}

/** Copies every pinned image (original + whichever variants were pinned alongside it) from one snapshot's own `images/` folder back into the live uploads folder — skips a file already present live (filenames are unique-per-upload, see `server/uploads.ts`'s own `randomUUID()`-based naming, so an existing file at that path is always the same content, never a collision). `onlyForScreenIDs` narrows this to just the images referenced by those screens (the per-screen restore flow); omitted, every pinned file in the snapshot is copied back (the whole-array restore flow). */
export function copySnapshotImagesToUploads(tier: SnapshotTier, id: string, onlyForScreenIDs?: string[]) {
  const imagesDir = imagesDirFor(tier, id)
  if (!existsSync(imagesDir)) return

  let allowedStems: Set<string> | null = null
  if (onlyForScreenIDs) {
    const snapshotScreens = readSnapshotScreens(tier, id) ?? []
    const scoped = snapshotScreens.filter((screen) => onlyForScreenIDs.includes(screen.screenID))
    allowedStems = new Set([...collectImageFilenamesFromScreens(scoped)].map((filename) => stemOf(filename)))
  }

  for (const name of readdirSync(imagesDir)) {
    if (allowedStems && !allowedStems.has(pinnedFileStem(name))) continue
    const destPath = join(UPLOADS_DIR, name)
    if (existsSync(destPath)) continue
    copyFileSync(join(imagesDir, name), destPath)
    mirrorFile(destPath)
  }
}

const PIN_MAX_DIMENSION = 4096

/** Synchronous half of pinning: copies the live original plus whichever of its already-generated variant files (`-small`/`-thumb`/`-blur`/etc, see `UPLOAD_VARIANT_SUFFIXES`) currently exist, straight into the snapshot's own `images/` folder. Deliberately reuses the files `handleUpload` already generated rather than re-deriving them via `sharp` again — cheap, synchronous, pure disk I/O, safe to run inline before the live copy is unlinked. Idempotent (skips a file already pinned). */
function pinExistingFilesSync(originalFilename: string, destDir: string) {
  mkdirSync(destDir, { recursive: true })
  const stem = stemOf(originalFilename)
  const candidates = [originalFilename, ...UPLOAD_VARIANT_SUFFIXES.map((suffix) => `${stem}-${suffix}.webp`)]
  for (const name of candidates) {
    const sourcePath = join(UPLOADS_DIR, name)
    const destPath = join(destDir, name)
    if (!existsSync(sourcePath) || existsSync(destPath)) continue
    copyFileSync(sourcePath, destPath)
    mirrorFile(destPath)
  }
}

/**
 * Async half of pinning, deliberately kept off the synchronous delete path — see this module's own
 * "Cleanup-sweep I/O burst" note: `deleteUploadFiles` (and therefore a whole cleanup-sweep batch of
 * them) already blocks the server's single event loop for its own duration; a `sharp` decode+resize
 * pass per deletion would make that meaningfully worse for no benefit to the caller, who's only
 * waiting on the *deletion* to finish, not on how well-compressed the pinned archival copy ends up.
 * The original is stored uncapped (`server/uploads.ts`'s own documented posture) — this bounds the
 * *pinned* copy at `PIN_MAX_DIMENSION` after the fact, best-effort: a failure (or the process exiting
 * before this finishes) just leaves the pinned original at its uncapped size, never fatal, same
 * "best-effort, non-fatal" posture as `generateMissingVariant` in `uploads.ts`.
 */
function capPinnedOriginalAsync(originalFilename: string, destDir: string) {
  if (extname(originalFilename).toLowerCase() === '.gif') return // sharp only resizes an animated gif's first frame — leave it exactly as pinned rather than silently losing the animation
  const destPath = join(destDir, originalFilename)
  sharp(destPath)
    .metadata()
    .then((meta) => {
      if ((meta.width ?? 0) <= PIN_MAX_DIMENSION && (meta.height ?? 0) <= PIN_MAX_DIMENSION) return undefined
      return sharp(destPath)
        .resize({ width: PIN_MAX_DIMENSION, height: PIN_MAX_DIMENSION, fit: 'inside', withoutEnlargement: true })
        .toBuffer()
        .then((buffer) => {
          writeFileSync(destPath, buffer)
          mirrorFile(destPath)
        })
    })
    .catch((error: unknown) => console.error(`[screens-snapshots] could not cap pinned copy of ${originalFilename}:`, error))
}

/** Whether `originalFilename` is currently referenced by at least one retained snapshot's own frozen `screens.json` — used both by `pinIfSnapshotReferenced` (below) and by `storageCleanup.ts`'s own reporting, so a deleted-but-pinned image isn't counted as genuinely "freed" disk space. */
export function isFilenameSnapshotReferenced(originalFilename: string): boolean {
  return listSnapshots().some(({ tier, id }) => {
    const screens = readSnapshotScreens(tier, id)
    return screens ? collectImageFilenamesFromScreens(screens).has(originalFilename) : false
  })
}

/**
 * Registered against `server/uploads.ts`'s own `registerBeforeUploadDeleteHook` (see
 * `startScreensSnapshotScheduler` below) — called with an original upload's own filename right before
 * `deleteUploadFiles` unlinks anything. Only pins into a snapshot that actually still references this
 * exact filename right now — the whole point of *lazy* pinning is that the overwhelming majority of
 * deletions never touch a snapshot-referenced image at all, so this is a cheap no-op check for those.
 */
export function pinIfSnapshotReferenced(originalFilename: string) {
  for (const { tier, id } of listSnapshots()) {
    const screens = readSnapshotScreens(tier, id)
    if (!screens || !collectImageFilenamesFromScreens(screens).has(originalFilename)) continue
    const destDir = imagesDirFor(tier, id)
    pinExistingFilesSync(originalFilename, destDir)
    capPinnedOriginalAsync(originalFilename, destDir)
    console.log(`[screens-snapshots] pinned ${originalFilename} into ${tier}/${id} before it's deleted from live uploads`)
  }
}

/**
 * Starts the in-process scheduler (an immediate check, then every `CHECK_INTERVAL_MS`) and registers
 * this module's own lazy-pinning hook against `uploads.ts` — call once at server startup, after
 * `store.load()` (snapshot capture reads `store.get('admin.screens')`, so the store must already be
 * loaded). Checks by *calendar date* (today's date / this ISO week), not "N hours since last snapshot"
 * — both what "daily"/"weekly" actually mean to an admin, and self-healing: if the server was offline
 * exactly at a boundary, the very next check just creates the missed snapshot instead of silently
 * skipping it, rather than needing its own separate catch-up logic.
 */
export function startScreensSnapshotScheduler() {
  registerBeforeUploadDeleteHook(pinIfSnapshotReferenced)
  mkdirSync(SNAPSHOTS_DIR, { recursive: true })
  checkAndCreateSnapshots()
  setInterval(checkAndCreateSnapshots, CHECK_INTERVAL_MS)
}
