import AsyncStorage from '@react-native-async-storage/async-storage'
import { randomUUID } from 'expo-crypto'
import { syncOrigin, type ServerConnection } from './serverConnection'

const MACHINE_ID_STORAGE_KEY = 'adhdisplay-companion/machineId'

/** This device's own `machineID` — generated once via `crypto.randomUUID()` (matching the pattern `electron/roleSetup.cjs` already uses for the same purpose on the Electron side) and persisted from then on, so the same physical device keeps being recognized across restarts. PIN generation is entirely server-side (see `sendPairingHeartbeat`) — this is the *only* identity this app ever generates itself. */
export async function getOrCreateMachineId(): Promise<string> {
  const existing = await AsyncStorage.getItem(MACHINE_ID_STORAGE_KEY)
  if (existing) return existing
  const created = randomUUID()
  await AsyncStorage.setItem(MACHINE_ID_STORAGE_KEY, created)
  return created
}

export interface PairingHeartbeatResult {
  status: 'approved' | 'pending'
  pin?: string
}

/**
 * `POST /display-machines/pairing-heartbeat` — called every ~5s while
 * unpaired (see `PairingScreen`). No `pin` field is ever sent: the server
 * generates and owns it, this call only ever learns the current one back
 * (see `server/index.ts`'s own comment on that route for why).
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
  if (response.status === 409) return { ok: false, monitors: [], needsPairing: true }
  if (!response.ok) throw new Error(`Heartbeat failed (${response.status})`)
  return response.json() as Promise<HeartbeatResult>
}
