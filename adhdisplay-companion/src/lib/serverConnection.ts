import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Network from 'expo-network'
import Zeroconf, { type Service } from 'react-native-zeroconf'

const STORAGE_KEY = 'adhdisplay-companion/serverConnection'

/** The three numbers this app needs to talk to an ADHDisplay server: its LAN host, its sync-socket/HTTP port (`wsPort`, matches the main app's own `WS_PORT`, default 4000), and its content port (`contentPort`, the `vite preview` port serving `/screens/:id`, default 4173). `storeName`, when present, is that server's own configured store name (see `StoreSettings.name`) — optional and possibly stale (only fresh as of whenever this connection was resolved), so it's a label for the setup screen, not something to treat as authoritative afterward. */
export interface ServerConnection {
  host: string
  wsPort: number
  contentPort: number
  storeName?: string
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

/**
 * Forgets this device's persisted server connection and nothing else —
 * `machineId` (see `pairing.ts`'s `getOrCreateMachineId`) is deliberately
 * left alone, so re-pairing after this reuses the same identity. Local to
 * this device only: it never calls the server, never touches
 * `admin.displayMachines`, and is not a revoke — a disconnected device's
 * entry stays visible (with a frozen `lastSeenAt`) in Display Manager's
 * approved grid until an admin clicks Remove there, and if this same device
 * re-points itself at the *same* server, it sails straight past
 * `PairingScreen` again with zero re-approval (the heartbeat gate only
 * checks whether its `machineID` is still in `admin.displayMachines`, which
 * it still is). This is exactly right for "the server got reinstalled or
 * moved to a new host" — the TV just needs to re-discover and re-point
 * itself — but it's not a way to un-pair a device from a server it's still
 * registered on; only Display Manager's own Remove button does that.
 *
 * Two real call sites: `WaitingForAssignmentScreen`'s own Disconnect
 * button, and the triple-Back-press gesture reachable from the live
 * `DisplayScreen` (see `App.tsx`'s `handleDisconnect`).
 */
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
  storeName?: string
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
    const storeName = typeof info.storeName === 'string' && info.storeName.trim() ? info.storeName : undefined
    return { host, wsPort: info.wsPort, contentPort: info.contentPort, storeName }
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Sweeps this device's own /24 for a real ADHDisplay server — a fallback
 * discovery path on `ServerSetupScreen`, run alongside the faster
 * `browseForServerViaMdns` below (ahead of QR/manual entry regardless — see
 * that screen's own doc comment for why: typing a LAN IP on a bare Android
 * TV stick's D-pad/on-screen keyboard is the worst minute in the whole
 * setup flow, and it's the *first* minute). Stays valuable specifically
 * because mDNS depends on multicast, which some networks block while still
 * allowing plain unicast HTTP between hosts on the same subnet — exactly
 * the case this sweep still covers. A handful of seconds, batched + parallel
 * with a short per-host timeout. Returns the first match, or `null` if
 * nothing answered (a blocked/client-isolated Wi-Fi network, or genuinely no
 * server on this LAN).
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

const MDNS_SERVICE_TYPE = 'adhdisplay' // must match SERVER_PRESENCE_SERVICE_TYPE in server/mdns.ts — kept under DNS-SD's 15-char service-name cap (RFC 6763 §7)
const MDNS_PROTOCOL = 'tcp'

// Lazily constructed, cached module-level singleton — not `new Zeroconf()`
// per browse() call (the JS class wraps a shared native NsdManager +
// NativeEventEmitter, not an independent browser per instance, so reusing
// one keeps scan()/stop() calls strictly ordered against the same native
// browser), and specifically NOT constructed at module load time either.
// This module is imported by `ServerSetupScreen.tsx`, so a throw here at
// import time (missing native module, a React Native New Architecture
// interop failure) would take down the whole setup screen the sweep itself
// lives on, not just disable mDNS. Constructing lazily on first actual use,
// inside a try/catch, means a broken native module degrades to "mDNS never
// finds anything, sweep still works" instead.
let zeroconfInstance: Zeroconf | null | undefined

function getZeroconf(): Zeroconf | null {
  if (zeroconfInstance !== undefined) return zeroconfInstance
  try {
    zeroconfInstance = new Zeroconf()
  } catch (err) {
    console.warn('react-native-zeroconf unavailable — mDNS discovery disabled, sweep-only', err)
    zeroconfInstance = null
  }
  return zeroconfInstance
}

export interface MdnsBrowseHandle {
  stop: () => void
}

/** First address that looks like an IPv4 literal, else whatever's first. `service.addresses` can contain both A and AAAA results in no guaranteed order, and an unbracketed IPv6 literal breaks a plain `http://${host}:${port}` URL downstream (in `syncOrigin`/`contentOrigin`) in a way that won't obviously trace back to this being the cause. */
function pickIPv4(addresses: string[] | undefined): string | undefined {
  return addresses?.find((addr) => /^\d{1,3}(\.\d{1,3}){3}$/.test(addr)) ?? addresses?.[0]
}

/**
 * Browses for the always-on "ADHDisplay server" DNS-SD advertisement
 * `server/mdns.ts`'s `advertiseServerPresence` publishes at server startup
 * (see that file's own doc comment) — the fast counterpart to
 * `sweepLanForServer` above: a passive listener rather than an active
 * subnet probe, typically resolving in well under a second once a server is
 * actually advertising, and cheap to leave running continuously rather than
 * repeating in batches. Calls `onFound` at most once per resolved service
 * per browse session; call the returned handle's `stop()` on cleanup to stop
 * listening. Returns a no-op handle (never calls `onFound`) if the native
 * module couldn't be constructed at all — see `getZeroconf` above.
 */
export function browseForServerViaMdns(onFound: (connection: ServerConnection) => void): MdnsBrowseHandle {
  const zeroconf = getZeroconf()
  if (!zeroconf) return { stop: () => {} }

  const handleResolved = (service: Service) => {
    const host = pickIPv4(service.addresses)
    const contentPort = Number(service.txt?.contentPort)
    const txtWsPort = Number(service.txt?.wsPort)
    // TXT record support on Android's NsdManager has historically been
    // uneven across OS/library versions — values can arrive as byte arrays,
    // base64, or be missing entirely even when the service itself resolves
    // fine. `advertiseServerPresence` (server/mdns.ts) also publishes wsPort
    // as the service's own SRV port, so fall back to `service.port` rather
    // than failing outright when just the TXT value didn't parse; there's no
    // equivalent fallback for contentPort, so that one still requires TXT.
    const wsPort = Number.isFinite(txtWsPort) ? txtWsPort : service.port
    if (!host || !Number.isFinite(wsPort) || !Number.isFinite(contentPort)) {
      // Logged for the same reason sweepLanForServer's rejection is: without
      // this, a broken TXT parse looks identical to "multicast blocked,"
      // which looks identical to "no server present" — none of which are
      // distinguishable to the user on-screen, and only one of which is
      // actually the sweep's job to cover.
      console.warn('browseForServerViaMdns: resolved service missing required fields', { host, port: service.port, txt: service.txt })
      return
    }
    // Unlike host/wsPort/contentPort above, a missing or unparseable storeName must not block resolving the
    // connection — it's an optional label, not required to connect. The Android TXT-decode path is confirmed to
    // hand back a real JS string, but iOS/desktop aren't verified the same way, hence the typeof guard.
    const rawStoreName = service.txt?.storeName
    const storeName = typeof rawStoreName === 'string' && rawStoreName.trim() ? rawStoreName : undefined
    onFound({ host, wsPort, contentPort, storeName })
  }
  const handleError = (err: unknown) => {
    // Expected on networks that block/disable multicast — sweepLanForServer
    // is the real fallback there, nothing to recover here. Logged anyway so
    // a real-device test can tell "multicast blocked" apart from "TXT
    // parsing broke" apart from "no server present."
    console.warn('browseForServerViaMdns: zeroconf error', err)
  }

  zeroconf.on('resolved', handleResolved)
  zeroconf.on('error', handleError)
  zeroconf.scan(MDNS_SERVICE_TYPE, MDNS_PROTOCOL, 'local.')

  return {
    stop: () => {
      zeroconf.removeListener('resolved', handleResolved)
      zeroconf.removeListener('error', handleError)
      zeroconf.stop()
    },
  }
}
