import { wsUrl } from './localServer'
import type { ClientMessage, ServerMessage, SyncedKey } from '../types/sync'

type Listener = (value: unknown) => void
type SnapshotEntry = { seeded: boolean; value: unknown }

const INITIAL_RECONNECT_DELAY_MS = 500
const MAX_RECONNECT_DELAY_MS = 10_000
const WRITE_DEBOUNCE_MS = 400

/** Per-key subscriber registry — every mounted `useLocalStorage` instance for a synced key registers here. */
const listeners = new Map<SyncedKey, Set<Listener>>()

/** Keys this tab has ever declared to the server via `hello`, re-sent in full on every reconnect (the server's own interest map for this connection was just recreated empty). */
const declaredKeys = new Set<SyncedKey>()

const pendingWrites = new Map<SyncedKey, ReturnType<typeof setTimeout>>()

let socket: WebSocket | null = null
let authToken: string | null = null
let reconnectDelay = INITIAL_RECONNECT_DELAY_MS

function notify(key: SyncedKey, value: unknown) {
  for (const listener of listeners.get(key) ?? []) listener(value)
}

/** Reads whatever this tab already has for `key` — session tier first, then local — to compare against a seeded snapshot value. */
function readLocal(key: SyncedKey): unknown {
  try {
    const raw = window.sessionStorage.getItem(key) ?? window.localStorage.getItem(key)
    return raw ? JSON.parse(raw) : undefined
  } catch {
    return undefined
  }
}

/**
 * If a key's snapshot value is still the server's bundled seed (`seeded:
 * true`) and this device already has different real local history, that
 * history wins — publish it up rather than adopting the placeholder. See
 * "First-sync safety" in the sync-server plan.
 */
function handleSnapshot(state: Partial<Record<SyncedKey, SnapshotEntry>>) {
  for (const [key, entry] of Object.entries(state) as [SyncedKey, SnapshotEntry][]) {
    if (entry.seeded) {
      const localValue = readLocal(key)
      if (localValue !== undefined && JSON.stringify(localValue) !== JSON.stringify(entry.value)) {
        publish(key, localValue)
        continue
      }
    }
    notify(key, entry.value)
  }
}

function sendHello(keys: SyncedKey[]) {
  const ws = socket
  if (!ws || keys.length === 0) return
  const message: ClientMessage = { type: 'hello', keys }
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message))
  } else {
    ws.addEventListener('open', () => ws.send(JSON.stringify(message)), { once: true })
  }
}

function scheduleReconnect() {
  socket = null
  setTimeout(() => {
    ensureSocket()
  }, reconnectDelay)
  reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY_MS)
}

function ensureSocket(): WebSocket {
  if (socket && socket.readyState !== WebSocket.CLOSED && socket.readyState !== WebSocket.CLOSING) {
    return socket
  }

  const ws = new WebSocket(wsUrl())
  socket = ws

  ws.addEventListener('open', () => {
    reconnectDelay = INITIAL_RECONNECT_DELAY_MS
    // A reconnect means the server's interest map for this connection was
    // just recreated empty — re-declare everything, not just new keys.
    sendHello([...declaredKeys])
  })

  ws.addEventListener('message', (event) => {
    let message: ServerMessage
    try {
      message = JSON.parse(event.data as string)
    } catch {
      return
    }
    if (message.type === 'snapshot') handleSnapshot(message.state)
    else if (message.type === 'update') notify(message.key, message.value)
  })

  ws.addEventListener('close', scheduleReconnect)
  ws.addEventListener('error', () => ws.close())

  return ws
}

/** Attaches `token` to every subsequent `publish()` call; `null` (e.g. after logout) makes writes silently no-op again. */
export function setAuthToken(token: string | null) {
  authToken = token
}

/**
 * Subscribes to live updates for `key`, connecting (or reusing) the shared
 * socket and declaring the key to the server if this tab hasn't already.
 * Returns an unsubscribe function; the socket and its declared-keys set stay
 * alive for the tab's lifetime even once every listener for a key unmounts —
 * the key space is small and fixed, so there's nothing worth reclaiming.
 */
export function subscribe(key: SyncedKey, listener: Listener): () => void {
  let keyListeners = listeners.get(key)
  if (!keyListeners) {
    keyListeners = new Set()
    listeners.set(key, keyListeners)
  }
  keyListeners.add(listener)

  ensureSocket()
  if (!declaredKeys.has(key)) {
    declaredKeys.add(key)
    sendHello([key])
  }

  return () => {
    keyListeners.delete(listener)
  }
}

/**
 * Publishes a local write, debounced per key (trailing edge) so rapid
 * successive writes (typing, dragging) collapse into one send reflecting
 * the latest value. Best-effort only — no queueing, no throwing, if the
 * socket isn't open or no token is set (e.g. a public kiosk display, which
 * never authenticates) this silently does nothing.
 */
export function publish(key: SyncedKey, value: unknown) {
  const existing = pendingWrites.get(key)
  if (existing) clearTimeout(existing)

  pendingWrites.set(
    key,
    setTimeout(() => {
      pendingWrites.delete(key)
      if (!socket || socket.readyState !== WebSocket.OPEN || !authToken) return
      const message: ClientMessage = { type: 'write', key, value, token: authToken }
      socket.send(JSON.stringify(message))
    }, WRITE_DEBOUNCE_MS),
  )
}
