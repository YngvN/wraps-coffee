import AsyncStorage from '@react-native-async-storage/async-storage'
import { randomUUID } from 'expo-crypto'
import { syncOrigin, type ServerConnection } from './serverConnection'

const MACHINE_ID_STORAGE_KEY = 'adhdisplay-companion/machineId'

/** This device's own `machineID` — generated once via `crypto.randomUUID()` (matching the pattern `electron/roleSetup.cjs` already uses for the same purpose on the Electron side) and persisted from then on, so the same physical device keeps being recognized across restarts, including across a disconnect (see `clearServerConnection` in `serverConnection.ts`, which deliberately leaves this alone). This is the *only* identity this app ever generates itself — its last 4 characters double as the disambiguation suffix shown on both this app's own `PairingScreen` and Display Manager's pending card, see `PairingScreen.tsx`'s own doc comment. */
export async function getOrCreateMachineId(): Promise<string> {
  const existing = await AsyncStorage.getItem(MACHINE_ID_STORAGE_KEY)
  if (existing) return existing
  const created = randomUUID()
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
 */
export async function sendHeartbeat(connection: ServerConnection, machineID: string, label: string): Promise<HeartbeatResult> {
  const response = await fetch(`${syncOrigin(connection)}/display-machines/heartbeat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      machineID,
      label,
      connectionType: 'mobile',
      monitors: [{ id: DEVICE_MONITOR_ID, label }],
    }),
  })
  if (response.status === 409) return { ok: false, monitors: [], needsPairing: true, customLabel: null }
  if (!response.ok) throw new Error(`Heartbeat failed (${response.status})`)
  return response.json() as Promise<HeartbeatResult>
}
