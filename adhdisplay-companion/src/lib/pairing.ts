import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Application from 'expo-application'
import { randomUUID } from 'expo-crypto'
import * as Updates from 'expo-updates'
import { Platform } from 'react-native'
import { resolveUpdateTier } from './packageInstaller'
import { syncOrigin, type ServerConnection } from './serverConnection'

const MACHINE_ID_STORAGE_KEY = 'adhdisplay-companion/machineId'

/**
 * This device's own `machineID`, persisted from first run on so the same
 * physical device keeps being recognized across restarts, including across
 * a disconnect (see `clearServerConnection` in `serverConnection.ts`, which
 * deliberately leaves this alone). This is the *only* identity this app ever
 * generates itself — its last 4 characters double as the disambiguation
 * suffix shown on both this app's own `PairingScreen` and Display Manager's
 * pending card, see `PairingScreen.tsx`'s own doc comment.
 *
 * Seeded from `Application.getAndroidId()` (wraps `Settings.Secure.ANDROID_ID`)
 * on Android, not a fresh `crypto.randomUUID()` — `ANDROID_ID` survives app
 * reinstall and app-data clear (only regenerating on a factory reset), which
 * a `randomUUID()` cached solely in `AsyncStorage` does not. This matters
 * because a display's screen assignment (Update Channel spec §5.5) and
 * remote-navigation override are both keyed by `machineID` server-side — if
 * this id isn't durable, any event that clears app data (including, on
 * non-device-owner units, an app-data clear that happens to accompany a
 * Tier 3 sideload) silently orphans the display from its own pairing
 * record. Non-Android platforms (this app also ships to iOS/Windows/Linux)
 * have no equivalent durable id available to an app, so they keep the
 * original `randomUUID()` behavior. Existing paired devices are unaffected
 * either way — a `machineID` already cached in `AsyncStorage` is always
 * reused as-is, never replaced.
 */
export async function getOrCreateMachineId(): Promise<string> {
  const existing = await AsyncStorage.getItem(MACHINE_ID_STORAGE_KEY)
  if (existing) return existing
  const created = (Platform.OS === 'android' ? Application.getAndroidId() : null) ?? randomUUID()
  await AsyncStorage.setItem(MACHINE_ID_STORAGE_KEY, created)
  return created
}

const DEVICE_LABEL_STORAGE_KEY = 'adhdisplay-companion/deviceLabel'

/**
 * An admin's dashboard rename (Display Manager's `customLabel` field), pushed down via `sendHeartbeat`'s own
 * `customLabel` response field and persisted here so it survives across restarts *and* across a switch to a
 * different server that's never configured a `customLabel` of its own for this device — same durability contract
 * as `machineID` above, and for the same reason: never cleared by `clearServerConnection`. `null`/absent means
 * "no rename configured yet," in which case `App.tsx` falls back to the generic `ADHDisplay Companion (${Platform.OS})`
 * label.
 */
export async function getStoredDeviceLabel(): Promise<string | null> {
  return AsyncStorage.getItem(DEVICE_LABEL_STORAGE_KEY)
}

export async function setStoredDeviceLabel(label: string): Promise<void> {
  await AsyncStorage.setItem(DEVICE_LABEL_STORAGE_KEY, label)
}

export interface PairingHeartbeatResult {
  status: 'approved' | 'pending'
}

/**
 * `POST /display-machines/pairing-heartbeat` — called every ~5s while
 * unpaired (see `PairingScreen`). No secret is exchanged in either
 * direction: this device just shows up in Display Manager's own "Pending
 * approval" section for an admin to approve with one click.
 */
export async function sendPairingHeartbeat(connection: ServerConnection, machineID: string, label: string): Promise<PairingHeartbeatResult> {
  const response = await fetch(`${syncOrigin(connection)}/display-machines/pairing-heartbeat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ machineID, label }),
  })
  if (!response.ok) throw new Error(`Pairing heartbeat failed (${response.status})`)
  return response.json() as Promise<PairingHeartbeatResult>
}

/** This device's own single synthetic "monitor" id — same simplification the `url` (plain browser tab) connection type already uses, see `DisplayConnect.tsx` on the web side. */
export const DEVICE_MONITOR_ID = 'device'

export interface HeartbeatResult {
  ok: boolean
  monitors: { id: string; label: string; assignedScreenID: string | null }[]
  needsPairing?: boolean
  /** This machine's own `customLabel` as currently configured on the server that answered this heartbeat (sanitized server-side), or `null` if none is set — see `getStoredDeviceLabel`'s own doc comment for what this app does with it. */
  customLabel: string | null
}

/**
 * `POST /display-machines/heartbeat` — called every 20s once approved (see
 * `App.tsx`'s own heartbeat loop, matching `HEARTBEAT_INTERVAL_MS` elsewhere
 * in this codebase). A `409 { needsPairing: true }` means this device was
 * removed in Display Manager and must pair again from scratch — surfaced
 * here as `{ ok: false, needsPairing: true }` rather than a thrown error,
 * since the caller needs to branch on it, not just log-and-retry like a
 * plain network failure.
 *
 * Also self-reports this build's own version fields (Update Channel spec
 * §5.2) on every beat, unconditionally — same "overwritten every heartbeat"
 * semantics as `label` above, deliberately never defaulted or held back if
 * momentarily unavailable, so the server's own resolved state can tell a
 * genuinely-unreporting (pre-this-commit) client apart from a reporting one.
 * `versionCode`/`versionName` come from the native build itself
 * (`Application.nativeBuildVersion`/`nativeApplicationVersion`, populated
 * from `app.json`'s `android.versionCode`/`version` at build time — see
 * `scripts/build-tv-apk.js`), `runtimeVersion`/`updateId`/`isEmbeddedLaunch`
 * from `expo-updates`, present even before commit 4 wires up an actual
 * `updates.url` (they describe *this launch*, not a live update check).
 * `updateTier` comes from `resolveUpdateTier()` (`packageInstaller.ts`),
 * which asks the native module's own device-owner/install-unknown-apps
 * checks — resolves to `1` on any platform without that native module
 * (iOS/web/Electron, or an Android build predating commit 6/7).
 */
export async function sendHeartbeat(connection: ServerConnection, machineID: string, label: string): Promise<HeartbeatResult> {
  const versionCode = Platform.OS === 'android' ? Number(Application.nativeBuildVersion) : undefined
  const updateTier = await resolveUpdateTier()
  const response = await fetch(`${syncOrigin(connection)}/display-machines/heartbeat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      machineID,
      label,
      connectionType: 'mobile',
      monitors: [{ id: DEVICE_MONITOR_ID, label }],
      versionCode: Number.isFinite(versionCode) ? versionCode : undefined,
      versionName: Application.nativeApplicationVersion ?? undefined,
      runtimeVersion: Updates.runtimeVersion || undefined,
      updateId: Updates.updateId,
      isEmbeddedLaunch: Updates.isEmbeddedLaunch,
      updateTier,
    }),
  })
  if (response.status === 409) return { ok: false, monitors: [], needsPairing: true, customLabel: null }
  if (!response.ok) throw new Error(`Heartbeat failed (${response.status})`)
  return response.json() as Promise<HeartbeatResult>
}
