import { wsSyncOrigin, type ServerConnection } from './serverConnection'

const INITIAL_RECONNECT_DELAY_MS = 500
const MAX_RECONNECT_DELAY_MS = 10_000

/**
 * Everything this socket can receive from the hub — see the Update Channel
 * spec's own "push mechanism" design. `navigable-set`/`effective-screen`
 * are the Remote Screen Navigation spec's own additions (commit 9's server
 * side, consumed here starting commit 10b) — `effective-screen`'s
 * `screenId` is nullable, matching `DisplayMonitor.assignedScreenID`
 * (no screen assigned shows the standby screensaver).
 */
export type DeviceServerMessage =
  | { type: 'check-update' }
  | { type: 'install-update'; mechanism: 'apk' }
  | { type: 'navigable-set'; screens: { screenId: string; name: string }[] }
  | { type: 'effective-screen'; screenId: string | null }

type MessageListener = (message: DeviceServerMessage) => void
type ConnectionListener = (connected: boolean) => void

let socket: WebSocket | null = null
let reconnectDelay = INITIAL_RECONNECT_DELAY_MS
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let currentConnection: ServerConnection | null = null
let currentMachineID: string | null = null
let connected = false
const listeners = new Set<MessageListener>()
const connectionListeners = new Set<ConnectionListener>()

/** Updates the shared connection flag and notifies subscribers, but only on an actual change — mirrors `syncClient.ts`'s own `setConnected` on the admin-dashboard side. */
function setConnected(next: boolean) {
  if (connected === next) return
  connected = next
  for (const listener of connectionListeners) listener(connected)
}

function sendHello() {
  if (!socket || socket.readyState !== WebSocket.OPEN || !currentMachineID) return
  socket.send(JSON.stringify({ type: 'device-hello', machineID: currentMachineID }))
}

function scheduleReconnect() {
  socket = null
  setConnected(false)
  if (!currentConnection) return // disconnectDeviceSocket() was called — nothing to reconnect to
  if (reconnectTimer) clearTimeout(reconnectTimer)
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    ensureSocket()
  }, reconnectDelay)
  reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY_MS)
}

function ensureSocket(): WebSocket | null {
  if (!currentConnection || !currentMachineID) return null
  if (socket && socket.readyState !== WebSocket.CLOSED && socket.readyState !== WebSocket.CLOSING) return socket

  const ws = new WebSocket(wsSyncOrigin(currentConnection))
  socket = ws

  ws.addEventListener('open', () => {
    reconnectDelay = INITIAL_RECONNECT_DELAY_MS
    setConnected(true)
    sendHello()
  })

  ws.addEventListener('message', (event) => {
    let message: DeviceServerMessage
    try {
      message = JSON.parse(event.data as string)
    } catch {
      return
    }
    for (const listener of listeners) listener(message)
  })

  ws.addEventListener('close', scheduleReconnect)
  ws.addEventListener('error', () => ws.close())

  return ws
}

/**
 * Opens (or reuses) this device's own persistent WS connection to the hub,
 * identifying itself via `device-hello` — the mechanism the hub uses to
 * push `check-update`/`install-update` to this exact device. A real native
 * socket (reconnect/backoff modeled directly on `src/lib/syncClient.ts` on
 * the admin-dashboard side, since React Native implements the same standard
 * `WebSocket` API), chosen over piggybacking on the 20s heartbeat response
 * for near-instant push, at the cost of being new native-adjacent surface
 * area this app didn't have before — see the Update Channel spec's own
 * "push mechanism" design section for the tradeoff.
 *
 * Call once pairing resolves, same lifecycle as the heartbeat loop itself
 * (see `App.tsx`). Calling again with the same `connection`/`machineID`
 * while already connected is a no-op — this matters because the effect that
 * calls this can re-run on a `waiting`→`displaying` transition without this
 * needing to tear down and reopen the socket every time a screen gets
 * assigned.
 */
export function connectDeviceSocket(connection: ServerConnection, machineID: string) {
  if (currentConnection?.host === connection.host && currentConnection.wsPort === connection.wsPort && currentMachineID === machineID && socket) {
    return
  }
  currentConnection = connection
  currentMachineID = machineID
  reconnectDelay = INITIAL_RECONNECT_DELAY_MS
  ensureSocket()
}

/** Tears down this device's own socket and stops reconnecting — call on disconnect (see `App.tsx`'s `handleDisconnect`), same lifecycle end as the heartbeat loop stopping. */
export function disconnectDeviceSocket() {
  currentConnection = null
  currentMachineID = null
  if (reconnectTimer) clearTimeout(reconnectTimer)
  reconnectTimer = null
  socket?.close()
  socket = null
  setConnected(false)
}

/** Subscribes to every message pushed over this device's own socket, connected or not (a message simply never arrives while disconnected — no queueing). Returns an unsubscribe function. */
export function subscribeToDeviceMessages(listener: MessageListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Subscribes to this device's own socket connection state — `true` once `open` fires, `false` from `close` until the next successful reconnect. Calls `listener` immediately with the current state, same as `syncClient.ts`'s own `subscribeToConnectionStatus` on the admin-dashboard side. `remoteNav.ts` uses this to disable browse mode while disconnected. Returns an unsubscribe function. */
export function subscribeToDeviceConnectionStatus(listener: ConnectionListener): () => void {
  connectionListeners.add(listener)
  listener(connected)
  return () => connectionListeners.delete(listener)
}

/**
 * Commits a remote-navigation screen selection (Remote Screen Navigation
 * spec §D1) — sent once, on OK, never per-keypress while browsing. A silent
 * no-op if the socket isn't currently open (e.g. a hub outage mid-browse) —
 * `remoteNav.ts` already disables browse mode while disconnected, so this
 * should never actually be reachable in that state, but no queueing/retry
 * here regardless, matching every other best-effort send on this socket.
 */
export function sendScreenOverride(screenId: string) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return
  socket.send(JSON.stringify({ type: 'screen-override', screenId }))
}
