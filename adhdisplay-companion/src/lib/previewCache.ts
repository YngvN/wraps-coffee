import AsyncStorage from '@react-native-async-storage/async-storage'
import * as FileSystem from 'expo-file-system'
import { Platform } from 'react-native'
import { syncOrigin, type ServerConnection } from './serverConnection'

const MANIFEST_STORAGE_KEY = 'adhdisplay-companion/screenPreviews'
const CACHE_DIR_NAME = 'screen-previews'

interface ManifestEntry {
  /** The exact URL last downloaded — also this entry's own version key, since a re-capture
   * (`screenPreviewCapture.ts`) always uploads under a new filename and deletes the old one, so a
   * changed URL is the only signal needed to know a re-download is due. */
  remoteUrl: string
  localUri: string
}
type Manifest = Record<string, ManifestEntry>

/** What `syncPreviewCache` needs from one entry of the hub's own `navigable-set` push — a relative,
 * origin-less path (see `toRelativeUploadUrl` server-side) rather than the full remote URL, since this
 * device is the one that knows which origin it actually reaches the hub on (`syncOrigin`). */
export interface PreviewCacheInput {
  screenId: string
  previewImage: string | null
}

let manifestMemo: Manifest | null = null

function cacheDir(): string {
  return `${FileSystem.documentDirectory}${CACHE_DIR_NAME}/`
}

async function loadManifest(): Promise<Manifest> {
  if (manifestMemo) return manifestMemo
  const raw = await AsyncStorage.getItem(MANIFEST_STORAGE_KEY)
  manifestMemo = raw ? (JSON.parse(raw) as Manifest) : {}
  return manifestMemo
}

async function saveManifest(manifest: Manifest): Promise<void> {
  manifestMemo = manifest
  await AsyncStorage.setItem(MANIFEST_STORAGE_KEY, JSON.stringify(manifest))
}

/** Best-effort delete — a file that's already gone (or never existed) is not a failure worth surfacing. */
async function deleteFileQuietly(uri: string): Promise<void> {
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true })
  } catch {
    // Ignore — see this function's own doc comment.
  }
}

/**
 * Keeps this device's own on-disk copy of every browsable screen's stage-1 screenshot in sync with the
 * hub's own `navigable-set` — call every time that message arrives (`remoteNav.ts`'s own subscription),
 * which is exactly the moment anything could have changed: the hub pushes it on every `device-hello`
 * (connect/reconnect) *and* on every `admin.screens` write. These are static screenshots, not something
 * that needs a live network round trip on every remote keypress, so each device keeps its own copy and
 * only re-fetches when a screen's own screenshot actually changed.
 *
 * Reconciles three ways against the previous manifest:
 *  - **new/changed** — a screen whose `previewImage` doesn't match what's on disk (first time seen, or
 *    a fresh capture uploaded under a new filename) is (re)downloaded, replacing the old file.
 *  - **deleted** — a screen no longer present in `screens` (deleted or unpublished) has its file
 *    removed and its manifest entry dropped.
 *  - **cleared** — a screen still present but whose `previewImage` is now `null` (never captured, or a
 *    capture that got wiped) has its file removed too, leaving no local preview for it.
 *
 * Downloads run sequentially and best-effort: a failed download leaves whatever was already cached (if
 * anything) in place and is simply retried on the next call — same posture as every other network call
 * in this app (see `sendHeartbeat`'s own doc comment). Returns `screenId -> local file uri` for every
 * screen that ends up with a cached image, for `remoteNav.ts` to fold into its own `navigableSet`
 * state.
 *
 * A no-op on web — `expo-file-system` has no react-native-web implementation, and this app also ships
 * as an Electron/web build (`installer/adhdisplay-companion.iss`) — falling back to returning the
 * *remote* URL unchanged, since `RemoteNavPreview`'s `<Image>` can load either a `file://` or `http://`
 * uri identically.
 */
export async function syncPreviewCache(connection: ServerConnection, screens: PreviewCacheInput[]): Promise<Record<string, string>> {
  if (Platform.OS === 'web') {
    const result: Record<string, string> = {}
    for (const screen of screens) {
      if (screen.previewImage) result[screen.screenId] = `${syncOrigin(connection)}${screen.previewImage}`
    }
    return result
  }

  await FileSystem.makeDirectoryAsync(cacheDir(), { intermediates: true }).catch(() => {
    // Already exists — makeDirectoryAsync has no "idempotent" option of its own, unlike deleteAsync.
  })

  const manifest = { ...(await loadManifest()) }
  const screenById = new Map(screens.map((screen) => [screen.screenId, screen]))

  // Deleted or cleared — drop the file and the manifest entry.
  for (const screenId of Object.keys(manifest)) {
    const current = screenById.get(screenId)
    if (!current || !current.previewImage) {
      await deleteFileQuietly(manifest[screenId].localUri)
      delete manifest[screenId]
    }
  }

  // New or changed — sequential, not Promise.all, to avoid every screen's screenshot downloading at
  // once over what may be a modest LAN link.
  for (const screen of screens) {
    if (!screen.previewImage) continue
    const remoteUrl = `${syncOrigin(connection)}${screen.previewImage}`
    const existing = manifest[screen.screenId]
    if (existing?.remoteUrl === remoteUrl) continue
    const localUri = `${cacheDir()}${screen.screenId}-${Date.now()}.webp`
    try {
      await FileSystem.downloadAsync(remoteUrl, localUri)
      if (existing) await deleteFileQuietly(existing.localUri)
      manifest[screen.screenId] = { remoteUrl, localUri }
    } catch {
      // Best-effort — see this function's own doc comment. `existing` (if any) stays untouched.
    }
  }

  await saveManifest(manifest)
  const result: Record<string, string> = {}
  for (const [screenId, entry] of Object.entries(manifest)) result[screenId] = entry.localUri
  return result
}
