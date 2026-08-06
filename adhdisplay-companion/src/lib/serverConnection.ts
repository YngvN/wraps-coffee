import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Network from 'expo-network'

const STORAGE_KEY = 'adhdisplay-companion/serverConnection'

/** The three numbers this app needs to talk to an ADHDisplay server: its LAN host, its sync-socket/HTTP port (`wsPort`, matches the main app's own `WS_PORT`, default 4000), and its content port (`contentPort`, the `vite preview` port serving `/screens/:id`, default 4173). */
export interface ServerConnection {
  host: string
  wsPort: number
  contentPort: number
}

/** This app's own persisted server connection (AsyncStorage, not tied to any particular pairing state) — `null` before `ServerSetupScreen` has ever been completed. */
export async function loadServerConnection(): Promise<ServerConnection | null> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as ServerConnection
  } catch {
    return null
  }
}

export async function saveServerConnection(connection: ServerConnection): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(connection))
}

/** Forgets the persisted server connection — not currently reachable from any screen in this app, but kept available for a future "forget this server" affordance / manual troubleshooting via Metro's dev menu. */
export async function clearServerConnection(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY)
}

/** This server's own content origin — where `/screens/:id` (and everything else the WebView loads) actually lives. */
export function contentOrigin(connection: ServerConnection): string {
  return `http://${connection.host}:${connection.contentPort}`
}

/** This server's own sync-socket/HTTP origin — where every REST call this app makes (heartbeat, pairing-heartbeat) actually lives. Named to match `wsPort` even though every call this app makes over it is plain HTTP, not a WebSocket — the WebView's own page is what opens the real `ws://` connection, entirely inside itself; this native layer never needs one (see this app's own README, "Live updates"). */
export function syncOrigin(connection: ServerConnection): string {
  return `http://${connection.host}:${connection.wsPort}`
}

/** The fixed port `GET /server-info` listens on before this app has learned a server's *real* wsPort from that same response — same default the rest of this codebase assumes (`WS_PORT`, `server/index.ts`). Only used to bootstrap the very first sweep probe; every subsequent call uses whatever `wsPort` the server actually reported. */
const DEFAULT_PROBE_PORT = 4000
const SWEEP_TIMEOUT_MS = 800
const SWEEP_CONCURRENCY = 32

interface ServerInfoResponse {
  app?: string
  wsPort?: number
  contentPort?: number
}

async function probeHost(host: string): Promise<ServerConnection | null> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), SWEEP_TIMEOUT_MS)
  try {
    const response = await fetch(`http://${host}:${DEFAULT_PROBE_PORT}/server-info`, { signal: controller.signal })
    if (!response.ok) return null
    const info = (await response.json()) as ServerInfoResponse
    // Validated by the `app: 'adhdisplay'` field (see server/index.ts's own
    // GET /server-info) — without this, the sweep could false-positive on
    // some unrelated service answering that same path/port on another
    // device on the LAN.
    if (info.app !== 'adhdisplay' || typeof info.wsPort !== 'number' || typeof info.contentPort !== 'number') return null
    return { host, wsPort: info.wsPort, contentPort: info.contentPort }
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Sweeps this device's own /24 for a real ADHDisplay server — the actual
 * primary discovery path on `ServerSetupScreen`, ahead of QR/manual entry
 * (see that screen's own doc comment for why: typing a LAN IP on a bare
 * Android TV stick's D-pad/on-screen keyboard is the worst minute in the
 * whole setup flow, and it's the *first* minute). A handful of seconds,
 * batched + parallel with a short per-host timeout — a real mDNS/Bonjour
 * client stays out of scope, disproportionate effort for what it'd buy
 * here. Returns the first match, or `null` if nothing answered (a blocked/
 * client-isolated Wi-Fi network, or genuinely no server on this LAN).
 */
export async function sweepLanForServer(): Promise<ServerConnection | null> {
  const ip = await Network.getIpAddressAsync()
  if (!ip || ip === '0.0.0.0') return null
  const subnet = ip.split('.').slice(0, 3).join('.')
  const hosts = Array.from({ length: 254 }, (_, index) => `${subnet}.${index + 1}`).filter((host) => host !== ip)

  for (let start = 0; start < hosts.length; start += SWEEP_CONCURRENCY) {
    const batch = hosts.slice(start, start + SWEEP_CONCURRENCY)
    const results = await Promise.all(batch.map(probeHost))
    const found = results.find((result): result is ServerConnection => result !== null)
    if (found) return found
  }
  return null
}
