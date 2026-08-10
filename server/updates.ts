import AdmZip from 'adm-zip'
import { createHash, createSign } from 'node:crypto'
import {
  closeSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mirrorFile } from './backup'
import { CORS_HEADERS, sendJson } from './http'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, 'data')

/**
 * Everything under here is `server/data/updates/` — a subdirectory of the
 * regular `DATA_DIR`, not a new sibling top-level directory, specifically so
 * it's covered by the existing backup path with no changes to
 * `server/backup.ts` beyond the `copyDirContents` recursion fix (see that
 * function's own comment) — `createBackupZip`'s `addLocalFolder(DATA_DIR,
 * 'data')` already walks it recursively for free.
 */
export const UPDATES_DIR = join(DATA_DIR, 'updates')
export const UPDATE_BUNDLES_DIR = join(UPDATES_DIR, 'bundles')
mkdirSync(UPDATE_BUNDLES_DIR, { recursive: true })

/** One native APK per `versionCode`, e.g. `apk/214.apk` — dropped in by the same out-of-band publish process that writes `current-apk.json` below (this module's own doc comment). Retention (current + previous only, spec §5.1/§6) is that process's job, same as `UPDATE_BUNDLES_DIR`. */
export const UPDATE_APK_DIR = join(UPDATES_DIR, 'apk')
mkdirSync(UPDATE_APK_DIR, { recursive: true })

const CURRENT_APK_FILE = join(UPDATES_DIR, 'current-apk.json')
const ROLLBACK_FLAGS_FILE = join(UPDATES_DIR, 'rollback.json')

/**
 * The native APK the hub currently considers "current" fleet-wide — set by
 * the out-of-band publish process (see this module's own doc comment below),
 * never by a route in this server, so there's deliberately no HTTP write
 * path for it. Read by `getUpdatesStatus` for Display Manager's own state
 * resolution (`src/utils/displayUpdateState.ts`) to tell whether a given
 * display's own reported `versionCode` is behind.
 */
interface CurrentApkInfo {
  versionCode: number
  versionName: string
  runtimeVersion: string
}

function readCurrentApkInfo(): CurrentApkInfo | null {
  if (!existsSync(CURRENT_APK_FILE)) return null
  try {
    return JSON.parse(readFileSync(CURRENT_APK_FILE, 'utf-8')) as CurrentApkInfo
  } catch {
    return null
  }
}

function writeCurrentApkInfo(info: CurrentApkInfo) {
  writeFileSync(CURRENT_APK_FILE, JSON.stringify(info), 'utf-8')
  mirrorFile(CURRENT_APK_FILE)
}

/**
 * `GET /updates/apk/current` — the file a Tier 2/3 companion device
 * actually downloads (Update Channel spec §3.3.2), public/no-auth, same
 * LAN-trust posture as the manifest/asset routes above. Serves whatever
 * `current-apk.json` currently points at; the client is expected to verify
 * the downloaded bytes' own signing certificate against its embedded
 * expectation before installing (`PackageInstallerModule.kt`,
 * `plugins/withPackageInstaller.js`) — this route does not sign or attach
 * any integrity metadata of its own, it's a plain file GET.
 */
export function handleUpdatesApk(res: ServerResponse) {
  const currentApk = readCurrentApkInfo()
  if (!currentApk) {
    sendJson(res, 404, { error: 'No current APK published' })
    return
  }
  const filePath = join(UPDATE_APK_DIR, `${currentApk.versionCode}.apk`)
  if (!filePath.startsWith(UPDATE_APK_DIR) || !existsSync(filePath)) {
    sendJson(res, 404, { error: 'Current APK file not found on disk' })
    return
  }
  res.writeHead(200, {
    'Content-Type': 'application/vnd.android.package-archive',
    // Safe for the same reason the manifest asset route's own header is: this exact versionCode
    // identifies exactly these bytes, and a published APK is never mutated in place — a new
    // native release always gets a new versionCode and its own new file.
    'Cache-Control': 'public, max-age=31536000, immutable',
    ...CORS_HEADERS,
  })
  res.end(readFileSync(filePath))
}

/** Same formula `adhdisplay-companion/scripts/build-tv-apk.js`'s own `computeVersionCode` uses — kept in exact sync (not imported, since that script lives in a separate package with its own module boundary) so a hand-typed `versionCode` that doesn't match its own `versionName` gets caught here too, not just client-side. */
function computeVersionCodeFromVersionName(versionName: string): number | null {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(versionName)
  if (!match) return null
  const [, major, minor, patch] = match.map(Number)
  if (minor >= 100 || patch >= 100) return null
  return major * 10000 + minor * 100 + patch
}

/** The exact filename `build-tv-apk.js` itself produces — cross-checked against the caller's own `versionCode`/`versionName` query params below so a stale or hand-renamed file gets caught before it ever reaches disk. */
function expectedApkFilename(versionName: string, versionCode: number): string {
  return `adhdisplay-companion-${versionName}-${versionCode}.apk`
}

const MAX_APK_UPLOAD_BYTES = 250 * 1024 * 1024

/** Streams the request body to `destPath` with a hard size cap enforced mid-transfer (not after the fact) — same shape as `videoUploads.ts`'s own `streamBodyToFile`, since an APK is the same "large binary body, must not buffer the whole thing in memory" case a video upload already is. Cleans up the partial file itself on any failure. */
async function streamRequestBodyToFile(req: IncomingMessage, destPath: string, maxBytes: number): Promise<void> {
  const writeStream = createWriteStream(destPath)
  let total = 0
  try {
    for await (const chunk of req) {
      total += (chunk as Buffer).length
      if (total > maxBytes) throw new Error('PAYLOAD_TOO_LARGE')
      writeStream.write(chunk)
    }
    await new Promise<void>((resolve, reject) => writeStream.end((error?: Error | null) => (error ? reject(error) : resolve())))
  } catch (error) {
    writeStream.destroy()
    if (existsSync(destPath)) unlinkSync(destPath)
    throw error
  }
}

/** `true` only if `filePath` is a real, signed APK — a plain zip whose central directory contains both `AndroidManifest.xml` and at least one `META-INF/*.{RSA,EC,DSA}` signing-block entry. Cheap magic-byte check first (every zip, valid or not, starts with this) before bothering to open it as a zip at all. */
function looksLikeSignedApk(filePath: string): boolean {
  const header = Buffer.alloc(4)
  const fd = openSync(filePath, 'r')
  try {
    readSync(fd, header, 0, 4, 0)
  } finally {
    closeSync(fd)
  }
  if (!header.equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) return false

  try {
    const zip = new AdmZip(filePath)
    const entries = zip.getEntries().map((entry) => entry.entryName)
    const hasManifest = entries.includes('AndroidManifest.xml')
    const hasSigningBlock = entries.some((name) => /^META-INF\/.*\.(RSA|EC|DSA)$/.test(name))
    return hasManifest && hasSigningBlock
  } catch {
    return false
  }
}

/** Keeps only the newest `keep` versionCodes' own `.apk` files under `UPDATE_APK_DIR`, deleting the rest — every publish is 60MB+ on disk (and again in the backup mirror), so this is not optional bookkeeping. Never touches `CURRENT_APK_FILE` itself, only the numbered files sitting alongside it. */
function pruneOldApks(keep: number) {
  const versionCodes = readdirSync(UPDATE_APK_DIR)
    .filter((name) => name.endsWith('.apk'))
    .map((name) => Number(name.slice(0, -'.apk'.length)))
    .filter((versionCode) => Number.isFinite(versionCode))
    .sort((a, b) => b - a)
  for (const versionCode of versionCodes.slice(keep)) {
    const filePath = join(UPDATE_APK_DIR, `${versionCode}.apk`)
    unlinkSync(filePath)
    mirrorFile(filePath)
  }
}

/**
 * `POST /updates/apk?versionCode=&versionName=&runtimeVersion=&filename=[&overwrite=1]` — the
 * admin-authenticated counterpart to `handleUpdatesApk` above, publishing a new Tier 2/3 APK build
 * (`adhdisplay-companion/scripts/build-tv-apk.js`'s own `dist/` output) onto this hub. Auth/section
 * gating happens in `server/index.ts` before this is ever called, same as every other write route.
 *
 * Raw binary body (the `.apk` file itself), same convention `/uploads` and `/uploads/video` already
 * use — no multipart parser in this codebase, and this isn't the route to introduce one. Streamed to
 * a `.part` temp file first (mid-transfer size cap enforced, see `streamRequestBodyToFile`), validated
 * as a real signed APK, then atomically renamed into place — an aborted upload must never leave a
 * truncated file sitting at the exact path `handleUpdatesApk` serves from.
 */
export async function handleUpdatesApkPublish(req: IncomingMessage, res: ServerResponse, query: URLSearchParams) {
  const versionCodeRaw = query.get('versionCode')
  const versionName = query.get('versionName')
  const runtimeVersion = query.get('runtimeVersion')
  const filename = query.get('filename')
  const overwrite = query.get('overwrite') === '1'

  const versionCode = versionCodeRaw ? Number(versionCodeRaw) : NaN
  if (!Number.isInteger(versionCode) || versionCode <= 0) {
    sendJson(res, 400, { error: 'versionCode must be a positive integer' })
    return
  }
  if (!versionName || !/^\d+\.\d+\.\d+$/.test(versionName)) {
    sendJson(res, 400, { error: 'versionName must look like "0.2.30"' })
    return
  }
  if (!runtimeVersion) {
    sendJson(res, 400, { error: 'runtimeVersion is required' })
    return
  }
  if (!filename) {
    sendJson(res, 400, { error: 'filename is required' })
    return
  }
  const computedVersionCode = computeVersionCodeFromVersionName(versionName)
  if (computedVersionCode !== versionCode) {
    sendJson(res, 400, { error: `versionCode ${versionCode} doesn't match versionName ${versionName} (expected ${computedVersionCode})` })
    return
  }
  if (filename !== expectedApkFilename(versionName, versionCode)) {
    sendJson(res, 400, { error: `filename doesn't match the expected build-tv-apk.js naming convention: ${expectedApkFilename(versionName, versionCode)}` })
    return
  }
  const contentType = req.headers['content-type']
  if (contentType !== 'application/vnd.android.package-archive' && contentType !== 'application/octet-stream') {
    sendJson(res, 400, { error: 'Content-Type must be application/vnd.android.package-archive or application/octet-stream' })
    return
  }

  const currentApk = readCurrentApkInfo()
  if (currentApk && versionCode < currentApk.versionCode && !overwrite) {
    sendJson(res, 409, { error: `versionCode ${versionCode} is older than the currently published ${currentApk.versionCode} — pass ?overwrite=1 to publish it anyway` })
    return
  }
  const apkPath = join(UPDATE_APK_DIR, `${versionCode}.apk`)
  if (existsSync(apkPath) && !overwrite) {
    sendJson(res, 409, { error: `versionCode ${versionCode} has already been published — pass ?overwrite=1 to replace it` })
    return
  }

  const tempPath = `${apkPath}.part`
  try {
    await streamRequestBodyToFile(req, tempPath, MAX_APK_UPLOAD_BYTES)
  } catch {
    sendJson(res, 413, { error: `File too large (${MAX_APK_UPLOAD_BYTES / (1024 * 1024)}MB limit)` })
    return
  }

  if (!looksLikeSignedApk(tempPath)) {
    unlinkSync(tempPath)
    sendJson(res, 400, { error: "This doesn't look like a signed APK (expected a zip containing AndroidManifest.xml and a META-INF signing block)" })
    return
  }

  renameSync(tempPath, apkPath)
  mirrorFile(apkPath)
  const info: CurrentApkInfo = { versionCode, versionName, runtimeVersion }
  writeCurrentApkInfo(info)
  pruneOldApks(3)

  sendJson(res, 200, info)
}

/** One runtimeVersion → whether Display Manager's own "revert to previous update" (commit 5) has pinned that runtime version to serve its previous bundle instead of its newest one. */
type RollbackFlags = Record<string, boolean>

function readRollbackFlags(): RollbackFlags {
  if (!existsSync(ROLLBACK_FLAGS_FILE)) return {}
  try {
    return JSON.parse(readFileSync(ROLLBACK_FLAGS_FILE, 'utf-8')) as RollbackFlags
  } catch {
    return {}
  }
}

/** Flips one runtimeVersion's rollback pin — called by Display Manager's own rollback action (commit 5), not exposed as its own route here since commit 3 only ships serving, not the admin action that triggers this. */
export function setRollbackFlag(runtimeVersion: string, rolledBack: boolean) {
  const flags = readRollbackFlags()
  if (rolledBack) flags[runtimeVersion] = true
  else delete flags[runtimeVersion]
  writeFileSync(ROLLBACK_FLAGS_FILE, JSON.stringify(flags), 'utf-8')
  mirrorFile(ROLLBACK_FLAGS_FILE)
}

interface UpdateAssetDescriptor {
  key: string
  /** Path relative to this update's own directory (`UPDATE_BUNDLES_DIR/<runtimeVersion>/<updateId>/`). */
  path: string
  contentType: string
}

/**
 * One published update's own metadata, written by the out-of-band publish
 * process as `<updateId>/metadata.json` alongside the actual bundle/asset
 * files it describes — see this module's own doc comment for the full
 * on-disk contract a future publish script needs to follow. Deliberately
 * self-describing (an update's own folder carries everything needed to
 * serve it) rather than indexed through a separate pointer file, so
 * "current" and "previous" per runtime version are just "newest" and
 * "second-newest by `createdAt`" among whatever folders exist under that
 * runtime version — nothing to keep in sync on publish beyond dropping the
 * files in, and pruning old folders (§5.1/§6: retain only current+previous)
 * is entirely the publish process's own job, not enforced here.
 *
 * Deliberately has no `id` field of its own — the update's id IS its own
 * folder name (`<updateId>/metadata.json`'s own parent directory), not a
 * value repeated inside the file. Two independent sources for the same id
 * (a folder name AND a JSON field) can drift apart if a publish script ever
 * gets them out of sync — this file only tracks one, so there's nothing to
 * validate or drift.
 */
interface PublishedUpdateMetadata {
  runtimeVersion: string
  createdAt: string
  launchAsset: UpdateAssetDescriptor
  assets: UpdateAssetDescriptor[]
}

/** A `PublishedUpdateMetadata` plus the folder name it was actually read from, attached separately from whatever the JSON itself contains — see that interface's own doc comment for why. Everything downstream (`updateDir`, asset URLs, the manifest's own `id` field) uses `id` from here, never anything re-parsed out of the metadata file. */
interface ResolvedUpdate extends PublishedUpdateMetadata {
  id: string
}

function updateDir(runtimeVersion: string, updateId: string): string {
  return join(UPDATE_BUNDLES_DIR, runtimeVersion, updateId)
}

/** Every published update for one runtime version, newest first. */
function listPublishedUpdates(runtimeVersion: string): ResolvedUpdate[] {
  const runtimeDir = join(UPDATE_BUNDLES_DIR, runtimeVersion)
  if (!existsSync(runtimeDir)) return []
  const updates: ResolvedUpdate[] = []
  for (const updateId of readdirSync(runtimeDir)) {
    const metadataPath = join(runtimeDir, updateId, 'metadata.json')
    if (!existsSync(metadataPath)) continue
    try {
      const metadata = JSON.parse(readFileSync(metadataPath, 'utf-8')) as PublishedUpdateMetadata
      updates.push({ ...metadata, id: updateId })
    } catch {
      // A partially-written or corrupt metadata.json (e.g. an interrupted manual copy) — skip it
      // rather than fail the whole manifest response for every other, valid update.
    }
  }
  return updates.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}

/** The update this hub currently serves for `runtimeVersion` — the newest one, or the second-newest if Display Manager's own rollback action has pinned this runtime version (see `setRollbackFlag`). `null` if nothing has ever been published for it. */
function resolveServedUpdate(runtimeVersion: string): ResolvedUpdate | null {
  const updates = listPublishedUpdates(runtimeVersion)
  if (updates.length === 0) return null
  const rolledBack = readRollbackFlags()[runtimeVersion] === true
  if (rolledBack && updates.length > 1) return updates[1]
  return updates[0]
}

/** SHA256 → base64url, memoized per absolute file path — every published asset/bundle file is immutable once written (same convention `server/uploads.ts` already relies on for its own long-cache `Cache-Control`), so a hash never needs recomputing once read. */
const hashCache = new Map<string, string>()

function hashFileBase64Url(filePath: string): string {
  const cached = hashCache.get(filePath)
  if (cached) return cached
  const digest = createHash('sha256').update(readFileSync(filePath)).digest('base64url')
  hashCache.set(filePath, digest)
  return digest
}

function assetManifestEntry(update: ResolvedUpdate, asset: UpdateAssetDescriptor, host: string) {
  const filePath = join(updateDir(update.runtimeVersion, update.id), asset.path)
  return {
    hash: hashFileBase64Url(filePath),
    key: asset.key,
    contentType: asset.contentType,
    url: `http://${host}/updates/assets/${hashFileBase64Url(filePath)}?runtimeVersion=${encodeURIComponent(update.runtimeVersion)}&updateId=${encodeURIComponent(update.id)}&path=${encodeURIComponent(asset.path)}`,
  }
}

const MULTIPART_BOUNDARY = 'adhdisplay-updates-boundary'

function writeMultipartPart(res: ServerResponse, name: string, contentType: string, body: string, extraHeaders?: Record<string, string>) {
  res.write(`--${MULTIPART_BOUNDARY}\r\n`)
  res.write(`Content-Disposition: form-data; name="${name}"\r\n`)
  res.write(`Content-Type: ${contentType}\r\n`)
  for (const [key, value] of Object.entries(extraHeaders ?? {})) res.write(`${key}: ${value}\r\n`)
  res.write('\r\n')
  res.write(body)
  res.write('\r\n')
}

/**
 * Same key `adhdisplay-companion/codeSigning/CODE_SIGNING.md` documents —
 * read from its one real location rather than copied here, so there's
 * never a second copy of a private key to keep in sync (or forget to).
 * `codeSigningMetadata.keyid` in `adhdisplay-companion/app.json` must stay
 * "main" to match `CODE_SIGNING_KEY_ID` below — the client only trusts a
 * signature whose `keyid` matches what it was built expecting.
 */
const CODE_SIGNING_PRIVATE_KEY_PATH = join(__dirname, '..', 'adhdisplay-companion', 'codeSigning', 'private-key.pem')
const CODE_SIGNING_KEY_ID = 'main'

let codeSigningPrivateKey: string | null | undefined // undefined = not read yet, null = read but doesn't exist
let warnedMissingCodeSigningKey = false

function readCodeSigningPrivateKey(): string | null {
  if (codeSigningPrivateKey !== undefined) return codeSigningPrivateKey
  if (!existsSync(CODE_SIGNING_PRIVATE_KEY_PATH)) {
    codeSigningPrivateKey = null
  } else {
    codeSigningPrivateKey = readFileSync(CODE_SIGNING_PRIVATE_KEY_PATH, 'utf-8')
  }
  return codeSigningPrivateKey
}

/**
 * Signs the exact bytes about to be served as the "manifest" part — see
 * `handleUpdatesManifest` below, which calls this with the same
 * `JSON.stringify(manifest)` result it then writes as the response body.
 * Signing at serve time, over the literal bytes being sent, rather than
 * once at publish time, sidesteps a real problem a precomputed signature
 * would have: `assetManifestEntry`'s own asset/launch `url` fields are
 * built from *this specific request's* `host`, so a signature computed
 * once ahead of time could never match what's actually served to a
 * different device reaching this hub via a different hostname. Algorithm
 * is `rsa-v1_5-sha256` (Node's `'RSA-SHA256'`, PKCS#1 v1.5 padding — the
 * only algorithm the Expo Updates Protocol v1 spec currently defines),
 * matching `codeSigningMetadata.alg` in `adhdisplay-companion/app.json`.
 * Returns `null` (not a thrown error) if the private key hasn't been
 * generated yet — see `CODE_SIGNING.md` — so a hub running before that
 * manual step just serves unsigned manifests, same as always.
 */
function signManifest(manifestJson: string): string | null {
  const privateKey = readCodeSigningPrivateKey()
  if (!privateKey) {
    if (!warnedMissingCodeSigningKey) {
      console.warn(
        `[updates] ${CODE_SIGNING_PRIVATE_KEY_PATH} not found — serving unsigned manifests. See adhdisplay-companion/codeSigning/CODE_SIGNING.md.`,
      )
      warnedMissingCodeSigningKey = true
    }
    return null
  }
  const sign = createSign('RSA-SHA256')
  sign.update(manifestJson, 'utf8')
  sign.end()
  return sign.sign(privateKey, 'base64')
}

/**
 * `GET /updates/manifest` — the Expo Updates Protocol v1 endpoint
 * `expo-updates` polls (commit 4 wires the client side up to call this,
 * triggered by a native WS push per that commit's own design). Public, no
 * auth — same LAN-trust posture as the heartbeat route, and the protocol
 * itself has no room for a bearer token (the client is `expo-updates`'
 * own native module, not this app's own fetch code).
 *
 * This is the piece the Update Channel spec itself flags as the main
 * implementation risk (§2.2) — the exact `multipart/mixed` framing and
 * header set below follows the protocol as documented, but has not been
 * exercised against a real `expo-updates` client (that needs commit 4's
 * on-device build, per this plan's own verification section). Treat this
 * as a solid first pass, not a verified-correct implementation.
 */
export function handleUpdatesManifest(req: IncomingMessage, res: ServerResponse, host: string) {
  const protocolVersion = req.headers['expo-protocol-version']
  const runtimeVersion = req.headers['expo-runtime-version']
  const platform = req.headers['expo-platform']

  if (typeof runtimeVersion !== 'string' || typeof platform !== 'string') {
    sendJson(res, 400, { error: 'Missing expo-runtime-version or expo-platform request header' })
    return
  }
  if (protocolVersion !== '1') {
    sendJson(res, 400, { error: 'Unsupported expo-protocol-version — this hub only serves protocol 1' })
    return
  }

  const update = resolveServedUpdate(runtimeVersion)
  const currentUpdateId = req.headers['expo-current-update-id']

  // `res.writeHead()` finalizes and sends the response headers immediately — every header this
  // response could ever need (including `expo-signature`, once a signature exists to attach) has
  // to be known *before* this one call, never added via a later `res.setHeader()`, which throws
  // once headers are already sent. Signing (when there's a manifest to sign) happens below, before
  // this call, for exactly that reason — an earlier version of this function tried to `setHeader`
  // after `writeHead` and threw `ERR_HTTP_HEADERS_SENT` on every real request, caught in testing.
  let manifestJson: string | null = null
  let signature: string | null = null
  if (update && update.id !== currentUpdateId) {
    const manifest = {
      id: update.id,
      createdAt: update.createdAt,
      runtimeVersion: update.runtimeVersion,
      launchAsset: assetManifestEntry(update, update.launchAsset, host),
      assets: update.assets.map((asset) => assetManifestEntry(update, asset, host)),
      metadata: {},
      extra: {},
    }
    // Signed over these exact bytes — the same string is what gets written as the manifest part's
    // own body below, never re-serialized, so the two can never drift apart. See signManifest's
    // own doc comment for why signing happens here (per request) rather than once at publish time.
    manifestJson = JSON.stringify(manifest)
    signature = signManifest(manifestJson)
  }

  res.writeHead(200, {
    'Content-Type': `multipart/mixed; boundary=${MULTIPART_BOUNDARY}`,
    'expo-protocol-version': '1',
    'expo-sfv-version': '0',
    'Cache-Control': 'private, no-store',
    ...(signature ? { 'expo-signature': `sig="${signature}", keyid="${CODE_SIGNING_KEY_ID}"` } : {}),
    ...CORS_HEADERS,
  })

  if (!manifestJson) {
    // Nothing new for this runtime version (either nothing has ever been published for it, or the
    // client is already running the update this hub would serve) — a `noUpdateAvailable` directive,
    // not a manifest part. See spec §2.6/§5.4: the client's own `checkForUpdateAsync()` treats this as
    // "you're current," distinct from an actual fetch-and-apply.
    writeMultipartPart(res, 'directive', 'application/json', JSON.stringify({ type: 'noUpdateAvailable' }))
    res.write(`--${MULTIPART_BOUNDARY}--\r\n`)
    res.end()
    return
  }

  // The client's own multipart parser (`FileDownloader.kt`'s `parseMultipartRemoteUpdateResponse`) reads
  // `expo-signature` off this "manifest" part's own headers, not the top-level HTTP response header set
  // above — confirmed against a real device, which otherwise rejects an unsigned-looking manifest
  // ("No expo-signature header specified") despite the top-level header being present and valid.
  writeMultipartPart(
    res,
    'manifest',
    'application/json',
    manifestJson,
    signature ? { 'expo-signature': `sig="${signature}", keyid="${CODE_SIGNING_KEY_ID}"` } : undefined,
  )
  res.write(`--${MULTIPART_BOUNDARY}--\r\n`)
  res.end()
}

/**
 * `GET /updates/assets/:hash?runtimeVersion=&updateId=&path=` — serves one
 * asset or the launch bundle from a published update. The URL embeds
 * `runtimeVersion`/`updateId`/`path` (set by `assetManifestEntry` above,
 * inside the manifest this hub itself just handed the client) rather than
 * requiring a hash-only global lookup across every published update ever —
 * same reasoning `server/uploads.ts`'s `handleServeUpload` gets away with a
 * flat filename lookup: the caller always already has the exact URL this
 * hub gave it. `hash` in the path is re-verified against the actual file on
 * disk (not just trusted from the query string) so a mismatched/stale URL
 * fails closed instead of serving the wrong bytes.
 */
export function handleUpdatesAsset(res: ServerResponse, hash: string, query: URLSearchParams) {
  const runtimeVersion = query.get('runtimeVersion')
  const updateId = query.get('updateId')
  const assetPath = query.get('path')
  if (!runtimeVersion || !updateId || !assetPath) {
    sendJson(res, 400, { error: 'Missing runtimeVersion/updateId/path query parameters' })
    return
  }

  const dir = updateDir(runtimeVersion, updateId)
  const filePath = join(dir, assetPath)
  if (!filePath.startsWith(dir) || !existsSync(filePath) || !statSync(filePath).isFile()) {
    sendJson(res, 404, { error: 'Not found' })
    return
  }
  if (hashFileBase64Url(filePath) !== hash) {
    sendJson(res, 404, { error: 'Not found' })
    return
  }

  const metadataPath = join(dir, 'metadata.json')
  const metadata = JSON.parse(readFileSync(metadataPath, 'utf-8')) as PublishedUpdateMetadata
  const descriptor = [metadata.launchAsset, ...metadata.assets].find((asset) => asset.path === assetPath)

  res.writeHead(200, {
    'Content-Type': descriptor?.contentType ?? 'application/octet-stream',
    // Safe for the same reason server/uploads.ts's own long-cache header is: this exact hash
    // identifies exactly these bytes, and a published update's files are never mutated in place.
    'Cache-Control': 'public, max-age=31536000, immutable',
    ...CORS_HEADERS,
  })
  res.end(readFileSync(filePath))
}

export interface UpdatesStatus {
  currentApk: CurrentApkInfo | null
  /** The `id` of the update this hub currently serves per runtime version — what `src/utils/displayUpdateState.ts` compares a display's own reported `updateId` against to resolve `ota-available` vs `current`. */
  currentUpdateIdByRuntimeVersion: Record<string, string>
  /** Every runtime version Display Manager's own "revert to previous update" action (spec §2.6) currently has pinned back — separate from `currentUpdateIdByRuntimeVersion` (which already reflects the pin's *effect*) since the UI also needs the boolean itself, to render "Revert" vs "Undo rollback". */
  rolledBackRuntimeVersions: string[]
}

/** Backing data for `GET /updates/status` (admin-facing, read by Display Manager — see `server/index.ts`) and, once wired into `resolveDisplayUpdateState`, full per-display state resolution. Scans only the runtime versions actually present on disk, not an exhaustive registry. */
export function getUpdatesStatus(): UpdatesStatus {
  const currentUpdateIdByRuntimeVersion: Record<string, string> = {}
  if (existsSync(UPDATE_BUNDLES_DIR)) {
    for (const runtimeVersion of readdirSync(UPDATE_BUNDLES_DIR)) {
      const served = resolveServedUpdate(runtimeVersion)
      if (served) currentUpdateIdByRuntimeVersion[runtimeVersion] = served.id
    }
  }
  const rolledBackRuntimeVersions = Object.entries(readRollbackFlags())
    .filter(([, rolledBack]) => rolledBack)
    .map(([runtimeVersion]) => runtimeVersion)
  return { currentApk: readCurrentApkInfo(), currentUpdateIdByRuntimeVersion, rolledBackRuntimeVersions }
}

/**
 * Sweeps every file already on disk under `UPDATES_DIR` through `mirrorFile`
 * once at server startup. Needed specifically because this directory's own
 * files are written by an out-of-band publish process (per this module's
 * doc comment — a manual copy or a future build-pipeline script, never a
 * route in this server), so none of the usual `writeFileSync`-plus-
 * `mirrorFile` call sites CLAUDE.md's Backup section describes ever run for
 * them. Without this sweep, a manually-copied update would silently sit
 * outside backup coverage forever, only entering it if some *other* code
 * path happened to touch the same path through `mirrorFile` later — this
 * sweep is that path. Cheap: `mirrorFile` itself is a debounced no-op copy
 * for a file that already matches its backup mirror.
 */
export function sweepUpdatesDirForBackup() {
  const walk = (dir: string) => {
    if (!existsSync(dir)) return
    for (const name of readdirSync(dir)) {
      const path = join(dir, name)
      if (statSync(path).isDirectory()) walk(path)
      else mirrorFile(path)
    }
  }
  walk(UPDATES_DIR)
}
