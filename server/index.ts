import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { networkInterfaces } from 'node:os'
import { WebSocketServer, type WebSocket } from 'ws'
import type { DisplayMachine, DisplayMonitor, DisplayPairingRequest, DisplayScreenOverride, DisplayUpdateProgress } from '../src/types/displayMachine'
import type { OrderRecord, OrderStatus } from '../src/types/order'
import type { Product } from '../src/types/product'
import type { PaneId, ScreenConfig, ScreenSlot } from '../src/types/screen'
import type { ScreenAddressSettings } from '../src/types/screenAddress'
import type { WindowLaunchSettings } from '../src/types/windowLaunch'
import type { StoreSettings } from '../src/types/storeSettings'
import { SYNCED_KEYS, type AdminRole, type ClientMessage, type DashboardSection, type ServerMessage, type SyncedKey } from '../src/types/sync'
import { logProductNameFoldedCollisions, withRecomputedNameFolded } from '../src/lib/productNameFold'
import { PANE_CUSTOM_CSS_POLICY_VERSION, validatePaneCustomCss } from '../src/utils/paneCustomCss'
import { PANE_CUSTOM_HTML_POLICY_VERSION, sanitizePaneCustomHtml, validatePaneCustomHtml } from '../src/utils/paneCustomHtml'
import { sanitizeDisplayName } from '../src/utils/sanitizeDisplayName'
import * as assistantSteps from './assistant/steps'
import type { LookupQueryFilterInput } from './assistant/lookupQuery'
import { deleteOllamaModel, ensureOllamaRunning, listOllamaModels, pullOllamaModel, testOllamaConnection } from './assistant/ollamaClient'
import { AssistantLocalProviderError, AssistantNotConfiguredError, type AssistantActionName } from './assistant/types'
import * as backup from './backup'
import * as screensSnapshots from './screensSnapshots'
import { handleDepartures, handleLookup, handleStopSearch, handleWeather } from './integrations'
import { handleHeadlines } from './news'
import { handleNewsImage, startNewsImageCacheSweep } from './newsImageCache'
import { bearerToken, CORS_HEADERS, readJsonBody, sendJson } from './http'
import * as mdns from './mdns'
import * as neonBridge from './neonBridge'
import * as store from './store'
import * as storageCleanup from './storageCleanup'
import {
  getMachineIDForSocket,
  pushToAllDevices,
  pushToDevice,
  registerDeviceSocket,
  unregisterDeviceSocket,
  type DeviceClientMessage,
  type DeviceServerMessage,
} from './deviceSocket'
import * as updates from './updates'
import { handleDeleteUpload, handleRenameUpload, handleServeUpload, handleStorageUsage, handleUpload, listUploads } from './uploads'
import { handleVideoRetry, handleVideoUpload, startAbandonedVideoUploadSweep } from './videoUploads'
import * as foodoraAdapter from './foodoraAdapter'
import * as foodoraPoller from './foodoraPoller'
import * as transitPoller from './transitPoller'
import * as woltAdapter from './woltAdapter'
import * as woltPoller from './woltPoller'

const PORT = Number(process.env.WS_PORT ?? 4000)
/** vite preview's own default port (see `installer/start-adhdisplay.bat` and `package.json`'s `"preview"` script) — the one screen/content links actually point at. */
const CONTENT_PORT = 4173

/** The app's own version, read once at startup from the repo root `package.json` — the single source of truth also mirrored in `installer/adhdisplay.iss`'s `AppVersion`. Surfaced via `GET /server-info` for the Settings → About card. */
const APP_VERSION = (JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }).version

/** Maps each synced key to the dashboard section that edits it, for the `limited`-role write check below. Keys with no admin-editable section (kiosk-only config) aren't section-gated at all — any authenticated write is enough. */
const SECTION_BY_KEY: Partial<Record<SyncedKey, DashboardSection>> = {
  'admin.messages': 'messages',
  'admin.products': 'products',
  'admin.categoryPrices': 'products',
  'admin.catalogues': 'products',
  'admin.events': 'events',
  'admin.contactInfo': 'store',
  'admin.storeSettings': 'store',
  'admin.screens': 'screens',
  'admin.textSizePresets': 'screens',
  'admin.screensaverSchedule': 'screens',
  'admin.displayMachines': 'displaymanager',
  'admin.displayMachineCloseRequests': 'displaymanager',
  'admin.displayPairingRequests': 'displaymanager',
  'admin.displayUpdateState': 'displaymanager',
  'admin.displayScreenOverride': 'displaymanager',
  'admin.integrations': 'integrations',
  'admin.orders': 'orders',
  'admin.messageBoards': 'messageboard',
  'admin.messageBoardPosts': 'messageboard',
  'admin.woltConfig': 'orders',
  'admin.woltOrders': 'orders',
  'admin.foodoraConfig': 'orders',
  'admin.foodoraOrders': 'orders',
}

function isSyncedKey(value: unknown): value is SyncedKey {
  return typeof value === 'string' && (SYNCED_KEYS as readonly string[]).includes(value)
}

/** This machine's own LAN-reachable IPv4 address (the first non-internal one found), or `null` if there isn't one (e.g. offline). Lets a client that's reaching this server via `localhost` (the common case when the admin dashboard and server run on the same machine) still build links — e.g. a screen's `/screens/:id` URL — that work from a *different* device on the network. */
function getLanIp(): string | null {
  const interfaces = networkInterfaces()
  for (const addresses of Object.values(interfaces)) {
    for (const address of addresses ?? []) {
      if (address.family === 'IPv4' && !address.internal) return address.address
    }
  }
  return null
}

/** The store's own configured name (see `admin.storeSettings`, a regular synced key), or `""` if it hasn't been set yet — used to derive the mDNS name a screen's link advertises (see `mdns.apply`), and (sanitized, see `sanitizeDisplayName`) advertised in the always-on presence TXT record (see `mdns.advertiseServerPresence`) and returned from `GET /server-info`. */
function currentStoreName(): string {
  return (store.get('admin.storeSettings')?.value as StoreSettings | undefined)?.name ?? ''
}

/** Tracks the last **normalised** (post-`sanitizeDisplayName`) store name that was actually advertised via `mdns.advertiseServerPresence`, so a Store Settings save that doesn't change the normalised name (an edit past the cap, a trailing-space-only change) doesn't flap the live mDNS advertisement for no real change. */
let lastAdvertisedStoreName: string | null = null

/** Re-advertises the server's presence with the current store name, but only if the **normalised** name actually changed since the last call — see `lastAdvertisedStoreName`. Called once at startup and again on every `admin.storeSettings` write. */
function reAdvertiseServerPresenceIfStoreNameChanged() {
  const normalised = sanitizeDisplayName(currentStoreName(), 63)
  if (normalised === lastAdvertisedStoreName) return
  lastAdvertisedStoreName = normalised
  mdns.advertiseServerPresence(PORT, CONTENT_PORT, currentStoreName())
}

/**
 * Upserts one machine's heartbeat into the stored `admin.displayMachines`
 * array, preserving each existing monitor's own `assignedScreenID` (matched
 * by monitor `id`) and the machine's own admin-set fields — `customLabel` and
 * `maxImagePx` (see `DisplayMachine`'s own doc comment) — rather than wiping
 * admin-made assignments/renames/caps on every heartbeat. Any future
 * admin-set field must be added to that carry-over list too; a field left
 * out fails quietly, resetting itself once per heartbeat interval.
 * Deliberately synchronous
 * end-to-end (reads current state, computes the merged array, and the
 * caller writes it back all within one `readJsonBody(req).then(...)`
 * callback with no further `await` in between) — two heartbeats arriving
 * close together can't race each other as long as that invariant holds,
 * since a JS callback always runs to completion before the next one
 * starts. Don't introduce an `await` between reading and writing here
 * without re-checking that reasoning.
 */
function mergeDisplayMachineHeartbeat(
  current: DisplayMachine[],
  heartbeat: {
    machineID: string
    label: string
    connectionType: DisplayMachine['connectionType']
    monitors: { id: string; label: string }[]
    versionCode?: number
    versionName?: string
    runtimeVersion?: string
    updateId?: string | null
    isEmbeddedLaunch?: boolean
    updateTier?: DisplayMachine['updateTier']
  },
): DisplayMachine[] {
  const existing = current.find((machine) => machine.machineID === heartbeat.machineID)
  const monitors: DisplayMonitor[] = heartbeat.monitors.map((monitor) => ({
    id: monitor.id,
    label: monitor.label,
    assignedScreenID: existing?.monitors.find((existingMonitor) => existingMonitor.id === monitor.id)?.assignedScreenID ?? null,
  }))
  const updated: DisplayMachine = {
    machineID: heartbeat.machineID,
    label: heartbeat.label,
    customLabel: existing?.customLabel ?? null,
    // Admin-set in Display Manager and never reported by a heartbeat, so it is carried over from
    // `existing` for exactly the same reason `customLabel` is — without this line a heartbeat would
    // silently reset the cap to `'auto'` every 20 seconds.
    maxImagePx: existing?.maxImagePx,
    // Carried over for exactly the same reason as `maxImagePx` directly above — also admin-set in
    // Display Manager, also never reported by a heartbeat. See `DisplayRenderWidth`.
    renderWidthPx: existing?.renderWidthPx,
    connectionType: heartbeat.connectionType,
    monitors,
    lastSeenAt: new Date().toISOString(),
    // Same "overwritten every heartbeat, never defaulted" semantics as `label`/`connectionType` above — an
    // absent field here means this specific heartbeat didn't report it (e.g. a pre-Update-Channel client),
    // and must stay absent rather than falling back to `existing`'s last-known value, so a client that
    // stops reporting doesn't silently keep looking current. See `DisplayMachine`'s own doc comment.
    versionCode: heartbeat.versionCode,
    versionName: heartbeat.versionName,
    runtimeVersion: heartbeat.runtimeVersion,
    updateId: heartbeat.updateId,
    isEmbeddedLaunch: heartbeat.isEmbeddedLaunch,
    updateTier: heartbeat.updateTier,
  }
  return existing ? current.map((machine) => (machine.machineID === heartbeat.machineID ? updated : machine)) : [...current, updated]
}

// --- Display pairing (ADHDisplay Companion) ---

/** A pending request that hasn't heartbeated (see `POST /display-machines/pairing-heartbeat`) in this long is treated as expired — pruned lazily on the next write that touches `admin.displayPairingRequests`, not on a timer. */
const PAIRING_REQUEST_TTL_MS = 10 * 60 * 1000
/** A café never legitimately has more devices pairing at once — caps how many pending requests can pile up. */
const MAX_PENDING_PAIRING_REQUESTS = 10
const PAIRING_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000
const PAIRING_RATE_LIMIT_MAX_NEW_PER_IP = 5

/** In-memory (not persisted) per-source-IP timestamps of *new* (never-seen-`machineID`) pairing requests, for `POST /display-machines/pairing-heartbeat`'s own rate limit — refreshing an existing pending request never touches this. */
const newPairingRequestTimestampsByIp = new Map<string, number[]>()

/** Drops any pending request that hasn't heartbeated within `PAIRING_REQUEST_TTL_MS` — called on every write to `admin.displayPairingRequests` so staleness never needs its own sweep/timer. */
function prunePairingRequests(requests: DisplayPairingRequest[]): DisplayPairingRequest[] {
  const cutoff = Date.now() - PAIRING_REQUEST_TTL_MS
  return requests.filter((request) => new Date(request.lastSeenAt).getTime() >= cutoff)
}

function isRateLimitedForNewPairing(ip: string): boolean {
  const now = Date.now()
  const recent = (newPairingRequestTimestampsByIp.get(ip) ?? []).filter((timestamp) => now - timestamp < PAIRING_RATE_LIMIT_WINDOW_MS)
  newPairingRequestTimestampsByIp.set(ip, recent)
  return recent.length >= PAIRING_RATE_LIMIT_MAX_NEW_PER_IP
}

function recordNewPairingRequest(ip: string) {
  const recent = newPairingRequestTimestampsByIp.get(ip) ?? []
  recent.push(Date.now())
  newPairingRequestTimestampsByIp.set(ip, recent)
}

const httpServer = createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS)
    res.end()
    return
  }

  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
  const host = req.headers.host ?? `localhost:${PORT}`

  if (req.method === 'POST' && url.pathname === '/login') {
    readJsonBody(req)
      .then((body) => {
        const { username, password } = body as { username?: string; password?: string }
        const user = username && password ? store.verifyLogin(username, password) : null
        if (!user) return sendJson(res, 401, { error: 'Invalid username or password' })

        const { token, session } = store.createSession(user)
        console.log(`[auth] ${session.username} (${session.role}) logged in`)
        sendJson(res, 200, { token, ...session })
      })
      .catch(() => sendJson(res, 400, { error: 'Malformed request body' }))
    return
  }

  // Public, no auth — this machine's own network address, needed to build a
  // LAN-reachable URL (e.g. a screen's link) from a page that may itself have
  // been opened via `localhost`, plus the running app's own version (see
  // Settings → About). `app: 'adhdisplay'` lets a LAN sweep (e.g. ADHDisplay
  // Companion's own server-discovery scan) tell a real ADHDisplay server
  // apart from some unrelated service answering on the same path/port.
  // `wsPort`/`contentPort` let a client build both this server's sync-socket
  // URL and its content/screen URL without hardcoding either.
  if (req.method === 'GET' && url.pathname === '/server-info') {
    // storeName is deliberately NOT capped/sanitized the way the mDNS TXT record's copy is (see
    // `mdns.advertiseServerPresence`) — this is a plain JSON response with no DNS packet-size constraint, so
    // capping it too would just be an arbitrary inconsistency. A client can therefore see two differently
    // truncated versions of the same store name depending on which discovery path it used; that's an accepted,
    // deliberate asymmetry, not a bug — display-side truncation already handles whichever version it gets.
    const storeName = currentStoreName()
    sendJson(res, 200, {
      app: 'adhdisplay',
      lanIp: getLanIp(),
      version: APP_VERSION,
      wsPort: PORT,
      contentPort: CONTENT_PORT,
      ...(storeName.trim() ? { storeName } : {}),
    })
    return
  }

  // Public, no auth — a machine (or a plain browser tab, see /display-connect)
  // self-reporting its own presence/monitors, same LAN-trust posture as
  // /server-info and GET /screen-address above. Actually *assigning* a Screen
  // to a monitor is a deliberate admin edit and goes through the normal
  // authenticated synced-key write path instead (see admin.displayMachines
  // in SECTION_BY_KEY) — never through this route. `electron`/`url` still
  // join with zero gate, unchanged; a `mobile` (ADHDisplay Companion)
  // `machineID` must already be an approved entry in `admin.displayMachines`
  // (see `POST /display-machines/:machineID/approve`) — an unrecognized one
  // gets `needsPairing` instead of silently joining, which is what makes
  // Display Manager's "Remove" a real revocation for a mobile device (unlike
  // `electron`/`url`, which can always just re-join).
  if (req.method === 'POST' && url.pathname === '/display-machines/heartbeat') {
    readJsonBody(req)
      .then((body) => {
        const { machineID, label, connectionType, monitors, versionCode, versionName, runtimeVersion, updateId, isEmbeddedLaunch, updateTier } = body as {
          machineID?: string
          label?: string
          connectionType?: string
          monitors?: { id?: string; label?: string }[]
          versionCode?: unknown
          versionName?: unknown
          runtimeVersion?: unknown
          updateId?: unknown
          isEmbeddedLaunch?: unknown
          updateTier?: unknown
        }
        if (!machineID || !label || (connectionType !== 'electron' && connectionType !== 'url' && connectionType !== 'mobile') || !Array.isArray(monitors)) {
          sendJson(res, 400, { error: 'Malformed heartbeat body' })
          return
        }
        const current = (store.get('admin.displayMachines')?.value as DisplayMachine[] | undefined) ?? []
        if (connectionType === 'mobile' && !current.some((machine) => machine.machineID === machineID)) {
          sendJson(res, 409, { error: 'not paired', needsPairing: true })
          return
        }
        const cleanMonitors = monitors
          .filter((monitor): monitor is { id: string; label: string } => typeof monitor.id === 'string' && typeof monitor.label === 'string')
        const merged = mergeDisplayMachineHeartbeat(current, {
          machineID,
          label,
          connectionType,
          monitors: cleanMonitors,
          versionCode: typeof versionCode === 'number' ? versionCode : undefined,
          versionName: typeof versionName === 'string' ? versionName : undefined,
          runtimeVersion: typeof runtimeVersion === 'string' ? runtimeVersion : undefined,
          // Distinguishes "this heartbeat didn't include the field at all" (undefined — a pre-Update-Channel
          // client) from "this build is still on its embedded bundle" (explicit null, a real Updates.updateId
          // value) — collapsing both to null would make an old client's absence look like a reporting client
          // that just hasn't OTA'd yet.
          updateId: updateId === null ? null : typeof updateId === 'string' ? updateId : undefined,
          isEmbeddedLaunch: typeof isEmbeddedLaunch === 'boolean' ? isEmbeddedLaunch : undefined,
          updateTier: updateTier === 1 || updateTier === 2 || updateTier === 3 ? updateTier : undefined,
        })
        applyUpdate('admin.displayMachines', merged)
        // A pending update run completes the moment its own device reports back whatever the hub
        // pushed it toward — the updateId for a Tier 1 (OTA) run, or the versionCode for a Tier
        // 2/3 (APK) run, exactly one of which is set per entry (see DisplayUpdateProgress's own
        // doc comment) — clear that machine's admin.displayUpdateState entry entirely rather than
        // recording a terminal "current" status (same doc comment explains why).
        const pendingUpdates = (store.get('admin.displayUpdateState')?.value as DisplayUpdateProgress[] | undefined) ?? []
        const myPendingUpdate = pendingUpdates.find((entry) => entry.machineID === machineID)
        const pendingUpdateCompleted =
          myPendingUpdate &&
          ((myPendingUpdate.targetUpdateId !== undefined && typeof updateId === 'string' && updateId === myPendingUpdate.targetUpdateId) ||
            (myPendingUpdate.targetVersionCode !== undefined && typeof versionCode === 'number' && versionCode === myPendingUpdate.targetVersionCode))
        if (pendingUpdateCompleted) {
          applyUpdate(
            'admin.displayUpdateState',
            pendingUpdates.filter((entry) => entry.machineID !== machineID),
          )
        }
        const mine = merged.find((machine) => machine.machineID === machineID)
        // customLabel is sanitized here (not just wherever it was originally typed in Display Manager) since this
        // is the point it leaves this server and crosses to a different physical device — see
        // sanitizeDisplayName's own doc comment. null (not '') when unset, so the device can tell "no rename
        // configured" apart from a would-be blank override; an admin clearing customLabel back to empty also
        // yields null here rather than pushing a blank name down (see this route's own callers for why that
        // matters — a device should never have its stored name silently blanked by this route).
        const customLabel = mine?.customLabel ? sanitizeDisplayName(mine.customLabel, 60) || null : null
        // `maxImagePx` rides the heartbeat response for the same reason `customLabel` does: it is
        // admin-set state the *device* needs to act on, and this response is the device's own
        // once-per-20s source of truth. The kiosk page can't look it up itself — that page is
        // unauthenticated while `admin.displayMachines` is gated to the `displaymanager` section
        // (see this file's own key/section map) — so the companion passes it into the WebView URL
        // instead (see `useDisplayImageCap`).
        // `effectiveScreenID` (override ?? assignment, see `resolveEffectiveScreen`'s own doc
        // comment) rides the same "admin-set state the device needs to act on" reasoning as
        // `customLabel`/`maxImagePx` just above — it is the hub's own single source of truth for
        // what a `mobile` device should be showing, and the raw `monitors[].assignedScreenID` above
        // is *not* it (that's the assignment alone, before any standing remote-nav override). The
        // companion feeds this into `remoteNav.syncEffectiveScreenId` so a dropped `effective-screen`
        // WS push self-heals toward the right value within one heartbeat interval instead of toward
        // the assignment, which would fight a live override every 20s.
        sendJson(res, 200, {
          ok: true,
          monitors: mine?.monitors ?? [],
          customLabel,
          maxImagePx: mine?.maxImagePx ?? 'auto',
          // Rides the response for the same reason `maxImagePx` does (see the comment above): the
          // kiosk page is unauthenticated and cannot look this up, so the companion is the only
          // component that knows both which machine it is and what the server says about it, and it
          // forwards this into the WebView URL (see `useDisplayRenderWidth`).
          renderWidthPx: mine?.renderWidthPx ?? 'auto',
          effectiveScreenID: resolveEffectiveScreen(machineID),
        })
      })
      .catch(() => sendJson(res, 400, { error: 'Malformed request body' }))
    return
  }

  // Public, no auth — same LAN-trust posture as the heartbeat route above. A
  // `mobile` (ADHDisplay Companion) device that isn't approved yet calls
  // this (instead of the real heartbeat route, which it can't join) so it
  // shows up passively in Display Manager's pending section for an admin to
  // approve with one click — no secret typed or scanned in either direction.
  if (req.method === 'POST' && url.pathname === '/display-machines/pairing-heartbeat') {
    readJsonBody(req)
      .then((body) => {
        const { machineID, label } = body as { machineID?: string; label?: string }
        if (!machineID || !label) {
          sendJson(res, 400, { error: 'Malformed pairing-heartbeat body' })
          return
        }

        const machines = (store.get('admin.displayMachines')?.value as DisplayMachine[] | undefined) ?? []
        if (machines.some((machine) => machine.machineID === machineID)) {
          sendJson(res, 200, { status: 'approved' })
          return
        }

        const now = new Date().toISOString()
        const pending = prunePairingRequests((store.get('admin.displayPairingRequests')?.value as DisplayPairingRequest[] | undefined) ?? [])
        const existingRequest = pending.find((request) => request.machineID === machineID)

        // Refreshing an existing pending request never counts against the
        // caps below — only a pruned-then-re-heartbeated machineID (a
        // genuinely new request below) counts as new.
        if (existingRequest) {
          const refreshed = pending.map((request) => (request.machineID === machineID ? { ...request, label, lastSeenAt: now } : request))
          applyUpdate('admin.displayPairingRequests', refreshed)
          sendJson(res, 200, { status: 'pending' })
          return
        }

        if (pending.length >= MAX_PENDING_PAIRING_REQUESTS) {
          applyUpdate('admin.displayPairingRequests', pending)
          sendJson(res, 503, { error: 'too many pending pairings, try again shortly' })
          return
        }

        const ip = req.socket.remoteAddress ?? 'unknown'
        if (isRateLimitedForNewPairing(ip)) {
          applyUpdate('admin.displayPairingRequests', pending)
          sendJson(res, 429, { error: 'too many new pairing attempts from this network, try again shortly' })
          return
        }
        recordNewPairingRequest(ip)

        const created: DisplayPairingRequest = { machineID, label, createdAt: now, lastSeenAt: now }
        applyUpdate('admin.displayPairingRequests', [...pending, created])
        sendJson(res, 200, { status: 'pending' })
      })
      .catch(() => sendJson(res, 400, { error: 'Malformed request body' }))
    return
  }

  // Authenticated, `displaymanager`-section-gated like the generic `write`
  // handler — this has to be its own route rather than the generic
  // synced-key `write` protocol so it can atomically move an entry from
  // `admin.displayPairingRequests` into `admin.displayMachines` (a `write`
  // can only ever touch one synced key at a time).
  const pairingApproveMatch = req.method === 'POST' ? url.pathname.match(/^\/display-machines\/([^/]+)\/approve$/) : null
  if (pairingApproveMatch) {
    const session = store.getSession(bearerToken(req) ?? '')
    if (!session) {
      sendJson(res, 401, { error: 'Authentication required' })
      return
    }
    if (session.role === 'limited') {
      const section = SECTION_BY_KEY['admin.displayPairingRequests']
      if (section && !session.allowedSections?.includes(section)) {
        sendJson(res, 403, { error: 'Only accounts with the Display Manager section can approve a pairing request' })
        return
      }
    }

    const targetMachineId = decodeURIComponent(pairingApproveMatch[1])
    const rawPending = (store.get('admin.displayPairingRequests')?.value as DisplayPairingRequest[] | undefined) ?? []
    const targetRequest = rawPending.find((request) => request.machineID === targetMachineId)
    if (!targetRequest) {
      sendJson(res, 404, { error: 'No pending pairing request for that machine' })
      return
    }

    const pending = prunePairingRequests(rawPending)
    const matched = pending.find((request) => request.machineID === targetMachineId)
    if (!matched) {
      // Expired specifically (present in rawPending, dropped by pruning)
      // rather than never having existed at all (the 404 case above) —
      // persist the prune and say so distinctly.
      applyUpdate('admin.displayPairingRequests', pending)
      sendJson(res, 410, { error: 'This pairing request has expired — the device will show up again on its next heartbeat' })
      return
    }

    const machines = (store.get('admin.displayMachines')?.value as DisplayMachine[] | undefined) ?? []
    const approvedMachine: DisplayMachine = {
      machineID: matched.machineID,
      label: matched.label,
      customLabel: null,
      connectionType: 'mobile',
      // A random published screen rather than leaving this unassigned — an admin approving a
      // companion device wants it showing *something* immediately, not sitting on
      // WaitingForAssignmentScreen until someone manually assigns one; still a completely normal
      // Display Manager assignment from here on; the admin can reassign it same as any other.
      monitors: [{ id: 'device', label: matched.label, assignedScreenID: pickRandomScreenID() }],
      lastSeenAt: new Date().toISOString(),
    }
    applyUpdate('admin.displayMachines', [...machines, approvedMachine])
    applyUpdate('admin.displayPairingRequests', pending.filter((request) => request.machineID !== matched.machineID))
    sendJson(res, 200, { ok: true, approvedMachineID: matched.machineID, approvedLabel: matched.label })
    return
  }

  if (req.method === 'POST' && url.pathname === '/logout') {
    readJsonBody(req)
      .then((body) => {
        const { token } = body as { token?: string }
        if (token) store.destroySession(token)
        sendJson(res, 200, { ok: true })
      })
      .catch(() => sendJson(res, 400, { error: 'Malformed request body' }))
    return
  }

  // Image/video uploads. Reads are public (the kiosk display isn't a
  // logged-in session but still needs to load media); writes
  // (POST/PATCH/DELETE) and the list/storage endpoints require a valid
  // session, same as a synced-key `write`. The video-specific sub-routes
  // (`/uploads/video`, `/uploads/video/<id>/retry`, `/uploads/storage`) are
  // matched before the generic `<filename>` parsing below, so a literal
  // upload named e.g. "video" or "storage" can never collide with them —
  // every real upload's own filename is always a server-generated UUID.
  if (url.pathname === '/uploads' || url.pathname.startsWith('/uploads/')) {
    if (req.method === 'POST' && url.pathname === '/uploads/video') {
      const session = store.getSession(bearerToken(req) ?? '')
      if (!session) {
        sendJson(res, 401, { error: 'Authentication required' })
        return
      }
      void handleVideoUpload(req, res, host)
      return
    }

    const retryMatch = req.method === 'POST' ? url.pathname.match(/^\/uploads\/video\/([^/]+)\/retry$/) : null
    if (retryMatch) {
      const session = store.getSession(bearerToken(req) ?? '')
      if (!session) {
        sendJson(res, 401, { error: 'Authentication required' })
        return
      }
      handleVideoRetry(res, retryMatch[1])
      return
    }

    if (req.method === 'GET' && url.pathname === '/uploads/storage') {
      const session = store.getSession(bearerToken(req) ?? '')
      if (!session) {
        sendJson(res, 401, { error: 'Authentication required' })
        return
      }
      handleStorageUsage(res)
      return
    }

    const nameMatch = req.method === 'PATCH' ? url.pathname.match(/^\/uploads\/([^/]+)\/name$/) : null
    if (nameMatch) {
      const session = store.getSession(bearerToken(req) ?? '')
      if (!session) {
        sendJson(res, 401, { error: 'Authentication required' })
        return
      }
      handleRenameUpload(req, res, nameMatch[1])
      return
    }

    const filename = url.pathname === '/uploads' ? null : url.pathname.slice('/uploads/'.length)

    if (req.method === 'GET' && filename) {
      // `void`-ed rather than awaited, same as `/news/image` — this handler is async only because a
      // missing size variant is generated on first request (see `generateMissingVariant`).
      void handleServeUpload(req, res, filename, url.searchParams.get('size'))
      return
    }

    const session = store.getSession(bearerToken(req) ?? '')
    if (!session) {
      sendJson(res, 401, { error: 'Authentication required' })
      return
    }

    if (req.method === 'POST' && !filename) {
      // `?purpose=screen-preview` marks an auto-captured screen thumbnail, which is stored
      // under its own filename prefix so it never shows up as browsable media (see
      // `SCREEN_PREVIEW_FILENAME_PREFIX`). Anything else is a normal upload.
      void handleUpload(req, res, host, url.searchParams.get('purpose') === 'screen-preview')
      return
    }

    if (req.method === 'DELETE' && filename) {
      handleDeleteUpload(res, filename)
      return
    }

    if (req.method === 'GET' && !filename) {
      // Auto-captured screen previews are filtered out here (and only here) — they're
      // generated artifacts rather than media anyone chose to upload, so they'd otherwise
      // fill the Media Library, the "Use stored image" picker and the assistant's own
      // picker with near-identical screenshots. They stay on disk, still count toward
      // storage usage, and are still visible to the orphan sweep — see
      // `collectScreenPreviewFilenames`.
      sendJson(res, 200, listUploads(host, { legacyFilenames: screensSnapshots.collectScreenPreviewFilenames() }))
      return
    }
  }

  // Update Channel (ADHDisplay Companion OTA updates, see the Update Channel spec). Public, no
  // auth — this is the Expo Updates Protocol v1 endpoint `expo-updates` itself polls, same
  // LAN-trust posture as the heartbeat route; the protocol has no room for a bearer token.
  if (req.method === 'GET' && url.pathname === '/updates/manifest') {
    updates.handleUpdatesManifest(req, res, host)
    return
  }

  if (req.method === 'GET' && url.pathname.startsWith('/updates/assets/')) {
    updates.handleUpdatesAsset(res, url.pathname.slice('/updates/assets/'.length), url.searchParams)
    return
  }

  if (req.method === 'GET' && url.pathname === '/updates/apk/current') {
    updates.handleUpdatesApk(res)
    return
  }

  // Publishes a new Tier 2/3 native build onto this hub — the admin-authenticated counterpart to
  // the public GET route just above. Same "displaymanager" section gate as /updates/rollback,
  // since this is the same feature area. Auth is checked before the (potentially 60MB+) request
  // body is ever touched — on rejection the request is destroyed rather than just left dangling,
  // since ending the response without consuming/discarding a large unread body can leave the
  // connection in a bad state instead of surfacing a clean auth error to the client.
  if (req.method === 'POST' && url.pathname === '/updates/apk') {
    const session = store.getSession(bearerToken(req) ?? '')
    if (!session) {
      sendJson(res, 401, { error: 'Authentication required' })
      req.destroy()
      return
    }
    if (session.role === 'limited' && !session.allowedSections?.includes('displaymanager')) {
      sendJson(res, 403, { error: 'Only accounts with Display Manager access can publish an APK' })
      req.destroy()
      return
    }
    void updates.handleUpdatesApkPublish(req, res, url.searchParams)
    return
  }

  // Admin-facing (Display Manager's own state resolution, see src/utils/displayUpdateState.ts) —
  // any authenticated session, same unrestricted-read posture every synced-key read already has;
  // this just isn't itself a synced key since it's read from disk on demand rather than cached.
  if (req.method === 'GET' && url.pathname === '/updates/status') {
    const session = store.getSession(bearerToken(req) ?? '')
    if (!session) {
      sendJson(res, 401, { error: 'Authentication required' })
      return
    }
    sendJson(res, 200, updates.getUpdatesStatus())
    return
  }

  // Display Manager's own "revert to previous update" action (spec §2.6) — a plain route, not a
  // synced-key write, since the rollback flag itself lives in server/data/updates/rollback.json,
  // not in any admin.* synced key. "displaymanager" section, same posture as approving a pairing.
  if (req.method === 'POST' && url.pathname === '/updates/rollback') {
    const session = store.getSession(bearerToken(req) ?? '')
    if (!session) {
      sendJson(res, 401, { error: 'Authentication required' })
      return
    }
    if (session.role === 'limited' && !session.allowedSections?.includes('displaymanager')) {
      sendJson(res, 403, { error: 'Only accounts with Display Manager access can roll back an update' })
      return
    }
    readJsonBody(req)
      .then((body) => {
        const { runtimeVersion, rolledBack } = body as { runtimeVersion?: unknown; rolledBack?: unknown }
        if (typeof runtimeVersion !== 'string' || typeof rolledBack !== 'boolean') {
          sendJson(res, 400, { error: 'Malformed rollback body' })
          return
        }
        updates.setRollbackFlag(runtimeVersion, rolledBack)
        const status = updates.getUpdatesStatus()
        const targetUpdateId = status.currentUpdateIdByRuntimeVersion[runtimeVersion]
        // Push every currently-known machine on this exact runtimeVersion toward whatever this hub
        // now serves for it — spec §2.6: rollback is "serving the prior manifest and pushing the
        // reload trigger," not a passive flag an admin has to separately re-trigger per device.
        if (targetUpdateId) {
          const machines = (store.get('admin.displayMachines')?.value as DisplayMachine[] | undefined) ?? []
          const affected = machines.filter((machine) => machine.runtimeVersion === runtimeVersion && machine.updateId !== targetUpdateId)
          if (affected.length > 0) {
            const pending = (store.get('admin.displayUpdateState')?.value as DisplayUpdateProgress[] | undefined) ?? []
            const startedAt = new Date().toISOString()
            const withoutAffected = pending.filter((entry) => !affected.some((machine) => machine.machineID === entry.machineID))
            const newEntries: DisplayUpdateProgress[] = affected.map((machine) => ({
              machineID: machine.machineID,
              status: 'awaiting-heartbeat',
              startedAt,
              targetUpdateId,
            }))
            applyUpdate('admin.displayUpdateState', [...withoutAffected, ...newEntries])
          }
        }
        sendJson(res, 200, { ok: true })
      })
      .catch(() => sendJson(res, 400, { error: 'Malformed request body' }))
    return
  }

  // Integrations (Ruter transit + Yr weather proxies). Public, no auth — these
  // are read-only proxies of public data, and the kiosk display that renders
  // them is never a logged-in session either.
  if (req.method === 'GET' && url.pathname === '/integrations/lookup') {
    void handleLookup(res, url.searchParams.get('address') ?? '')
    return
  }

  if (req.method === 'GET' && url.pathname === '/integrations/stops/search') {
    void handleStopSearch(res, url.searchParams.get('query') ?? '')
    return
  }

  if (req.method === 'GET' && url.pathname === '/integrations/departures') {
    const stopId = url.searchParams.get('stopId')
    const count = Number(url.searchParams.get('count') ?? '5')
    if (!stopId) {
      sendJson(res, 400, { error: 'Missing stopId' })
      return
    }
    void handleDepartures(res, stopId, count)
    return
  }

  if (req.method === 'GET' && url.pathname === '/integrations/weather') {
    const lat = Number(url.searchParams.get('lat'))
    const lon = Number(url.searchParams.get('lon'))
    const hours = Number(url.searchParams.get('hours') ?? '6')
    if (Number.isNaN(lat) || Number.isNaN(lon)) {
      sendJson(res, 400, { error: 'Missing or invalid lat/lon' })
      return
    }
    void handleWeather(res, lat, lon, hours)
    return
  }

  // News (RSS headlines) proxy — same public, unauthenticated posture as
  // the Integrations proxies above: read-only, cached, publicly published
  // content, and the kiosk display that renders it is never a logged-in
  // session either.
  if (req.method === 'GET' && url.pathname === '/news/headlines') {
    const sourceIds = (url.searchParams.get('sources') ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)
    const count = Number(url.searchParams.get('count') ?? '10')
    if (sourceIds.length === 0) {
      sendJson(res, 200, { headlines: [] })
      return
    }
    void handleHeadlines(res, sourceIds, Number.isFinite(count) && count > 0 ? count : 10)
    return
  }

  // News article images, proxied through this server's own disk cache
  // (`server/newsImageCache.ts`) instead of the kiosk hitting each outlet's
  // own hosting directly on every rotation — same public, unauthenticated
  // posture as `/news/headlines`.
  if (req.method === 'GET' && url.pathname === '/news/image') {
    void handleNewsImage(res, url.searchParams.get('src'), url.searchParams.get('w'))
    return
  }

  // Developer API key (see "Website integration" in the sync-server plan) —
  // read by any authenticated session, regenerated only by admin/subadmin,
  // matching the Users-management posture elsewhere.
  if (req.method === 'GET' && url.pathname === '/developer-key') {
    const session = store.getSession(bearerToken(req) ?? '')
    if (!session) {
      sendJson(res, 401, { error: 'Authentication required' })
      return
    }
    sendJson(res, 200, { key: store.getDeveloperApiKey() })
    return
  }

  if (req.method === 'POST' && url.pathname === '/developer-key/regenerate') {
    const session = store.getSession(bearerToken(req) ?? '')
    if (!session) {
      sendJson(res, 401, { error: 'Authentication required' })
      return
    }
    if (session.role === 'limited') {
      sendJson(res, 403, { error: 'Only admin/subadmin accounts can regenerate the developer API key' })
      return
    }
    sendJson(res, 200, { key: store.regenerateDeveloperApiKey() })
    return
  }

  // Neon database URL override (see "Website integration" in Settings → For
  // developers) — lets an admin configure/fix/clear the connection string
  // without editing the server's own environment and restarting it. Contains
  // a real database password, so admin/subadmin only, same posture as the
  // developer API key's own regenerate route above.
  if (req.method === 'GET' && url.pathname === '/neon-url') {
    const session = store.getSession(bearerToken(req) ?? '')
    if (!session) {
      sendJson(res, 401, { error: 'Authentication required' })
      return
    }
    if (session.role === 'limited') {
      sendJson(res, 403, { error: 'Only admin/subadmin accounts can view the Neon database URL' })
      return
    }
    sendJson(res, 200, { url: store.getNeonDatabaseUrl() })
    return
  }

  if (req.method === 'POST' && url.pathname === '/neon-url') {
    const session = store.getSession(bearerToken(req) ?? '')
    if (!session) {
      sendJson(res, 401, { error: 'Authentication required' })
      return
    }
    if (session.role === 'limited') {
      sendJson(res, 403, { error: 'Only admin/subadmin accounts can edit the Neon database URL' })
      return
    }
    readJsonBody(req)
      .then((body) => {
        const { url: rawUrl } = body as { url?: string | null }
        const trimmed = typeof rawUrl === 'string' ? rawUrl.trim() : ''
        const newUrl = trimmed || null
        store.setNeonDatabaseUrl(newUrl)
        neonBridge.restart()
        console.log(`[neon] ${session.username} ${newUrl ? 'updated' : 'cleared'} the Neon database URL`)
        sendJson(res, 200, { url: newUrl })
      })
      .catch(() => sendJson(res, 400, { error: 'Malformed request body' }))
    return
  }

  // Wolt delivery-order integration (see the Integrations page's own Wolt
  // card, `server/woltPoller.ts`, `server/woltAdapter.ts`). Credentials
  // contain a real API key, so admin/subadmin only, same posture as the
  // Neon URL above. `/wolt/status/:orderId` pushes a local order-status
  // edit back to Wolt — gated the same way a normal `admin.woltOrders`
  // write would be via the WS `write` handler's own section check, so a
  // `limited` account with the `orders` section still works here.
  if (req.method === 'GET' && url.pathname === '/wolt/credentials') {
    const session = store.getSession(bearerToken(req) ?? '')
    if (!session) {
      sendJson(res, 401, { error: 'Authentication required' })
      return
    }
    if (session.role === 'limited') {
      sendJson(res, 403, { error: 'Only admin/subadmin accounts can view Wolt credentials' })
      return
    }
    sendJson(res, 200, store.getWoltCredentials())
    return
  }

  if (req.method === 'POST' && url.pathname === '/wolt/credentials') {
    const session = store.getSession(bearerToken(req) ?? '')
    if (!session) {
      sendJson(res, 401, { error: 'Authentication required' })
      return
    }
    if (session.role === 'limited') {
      sendJson(res, 403, { error: 'Only admin/subadmin accounts can edit Wolt credentials' })
      return
    }
    readJsonBody(req)
      .then((body) => {
        const { venueId, apiKey, useDevelopmentEnvironment } = body as { venueId?: string | null; apiKey?: string | null; useDevelopmentEnvironment?: boolean }
        const credentials = {
          venueId: typeof venueId === 'string' && venueId.trim() ? venueId.trim() : null,
          apiKey: typeof apiKey === 'string' && apiKey.trim() ? apiKey.trim() : null,
          useDevelopmentEnvironment: Boolean(useDevelopmentEnvironment),
        }
        store.setWoltCredentials(credentials)
        woltPoller.restart()
        console.log(`[wolt] ${session.username} updated Wolt credentials`)
        sendJson(res, 200, credentials)
      })
      .catch(() => sendJson(res, 400, { error: 'Malformed request body' }))
    return
  }

  if (req.method === 'POST' && url.pathname === '/wolt/sync') {
    const session = store.getSession(bearerToken(req) ?? '')
    if (!session) {
      sendJson(res, 401, { error: 'Authentication required' })
      return
    }
    if (session.role === 'limited') {
      sendJson(res, 403, { error: 'Only admin/subadmin accounts can trigger a Wolt sync' })
      return
    }
    woltPoller
      .pollOnce()
      .then(() => sendJson(res, 200, { ok: true }))
      .catch(() => sendJson(res, 502, { error: 'Wolt sync failed' }))
    return
  }

  if (req.method === 'POST' && url.pathname.startsWith('/wolt/status/')) {
    const session = store.getSession(bearerToken(req) ?? '')
    if (!session) {
      sendJson(res, 401, { error: 'Authentication required' })
      return
    }
    if (session.role === 'limited') {
      const section = SECTION_BY_KEY['admin.woltOrders']
      if (section && !session.allowedSections?.includes(section)) {
        sendJson(res, 403, { error: 'Only accounts with the Orders section can update a Wolt order' })
        return
      }
    }
    const orderId = url.pathname.slice('/wolt/status/'.length)
    readJsonBody(req)
      .then(async (body) => {
        const { status } = body as { status?: OrderStatus }
        if (!status) {
          sendJson(res, 400, { error: 'Missing status' })
          return
        }
        const orders = (store.get('admin.woltOrders')?.value as OrderRecord[] | undefined) ?? []
        const order = orders.find((candidate) => candidate.id === orderId)
        if (!order) {
          sendJson(res, 404, { error: 'Wolt order not found' })
          return
        }
        try {
          await woltAdapter.pushStatus(store.getWoltCredentials(), order.externalId ?? order.id, status)
          const updated = orders.map((candidate) => (candidate.id === orderId ? { ...candidate, status } : candidate))
          applyUpdate('admin.woltOrders', updated)
          console.log(`[wolt] ${session.username} pushed status "${status}" for order ${orderId}`)
          sendJson(res, 200, { ok: true })
        } catch (error) {
          console.error('[wolt] status push failed:', error)
          sendJson(res, 502, { error: 'Could not push this status update to Wolt' })
        }
      })
      .catch(() => sendJson(res, 400, { error: 'Malformed request body' }))
    return
  }

  // Foodora delivery-order integration — identical shape to the Wolt routes
  // above (see `server/foodoraPoller.ts`, `server/foodoraAdapter.ts`).
  if (req.method === 'GET' && url.pathname === '/foodora/credentials') {
    const session = store.getSession(bearerToken(req) ?? '')
    if (!session) {
      sendJson(res, 401, { error: 'Authentication required' })
      return
    }
    if (session.role === 'limited') {
      sendJson(res, 403, { error: 'Only admin/subadmin accounts can view Foodora credentials' })
      return
    }
    sendJson(res, 200, store.getFoodoraCredentials())
    return
  }

  if (req.method === 'POST' && url.pathname === '/foodora/credentials') {
    const session = store.getSession(bearerToken(req) ?? '')
    if (!session) {
      sendJson(res, 401, { error: 'Authentication required' })
      return
    }
    if (session.role === 'limited') {
      sendJson(res, 403, { error: 'Only admin/subadmin accounts can edit Foodora credentials' })
      return
    }
    readJsonBody(req)
      .then((body) => {
        const { venueId, apiKey, useDevelopmentEnvironment } = body as { venueId?: string | null; apiKey?: string | null; useDevelopmentEnvironment?: boolean }
        const credentials = {
          venueId: typeof venueId === 'string' && venueId.trim() ? venueId.trim() : null,
          apiKey: typeof apiKey === 'string' && apiKey.trim() ? apiKey.trim() : null,
          useDevelopmentEnvironment: Boolean(useDevelopmentEnvironment),
        }
        store.setFoodoraCredentials(credentials)
        foodoraPoller.restart()
        console.log(`[foodora] ${session.username} updated Foodora credentials`)
        sendJson(res, 200, credentials)
      })
      .catch(() => sendJson(res, 400, { error: 'Malformed request body' }))
    return
  }

  if (req.method === 'POST' && url.pathname === '/foodora/sync') {
    const session = store.getSession(bearerToken(req) ?? '')
    if (!session) {
      sendJson(res, 401, { error: 'Authentication required' })
      return
    }
    if (session.role === 'limited') {
      sendJson(res, 403, { error: 'Only admin/subadmin accounts can trigger a Foodora sync' })
      return
    }
    foodoraPoller
      .pollOnce()
      .then(() => sendJson(res, 200, { ok: true }))
      .catch(() => sendJson(res, 502, { error: 'Foodora sync failed' }))
    return
  }

  if (req.method === 'POST' && url.pathname.startsWith('/foodora/status/')) {
    const session = store.getSession(bearerToken(req) ?? '')
    if (!session) {
      sendJson(res, 401, { error: 'Authentication required' })
      return
    }
    if (session.role === 'limited') {
      const section = SECTION_BY_KEY['admin.foodoraOrders']
      if (section && !session.allowedSections?.includes(section)) {
        sendJson(res, 403, { error: 'Only accounts with the Orders section can update a Foodora order' })
        return
      }
    }
    const orderId = url.pathname.slice('/foodora/status/'.length)
    readJsonBody(req)
      .then(async (body) => {
        const { status } = body as { status?: OrderStatus }
        if (!status) {
          sendJson(res, 400, { error: 'Missing status' })
          return
        }
        const orders = (store.get('admin.foodoraOrders')?.value as OrderRecord[] | undefined) ?? []
        const order = orders.find((candidate) => candidate.id === orderId)
        if (!order) {
          sendJson(res, 404, { error: 'Foodora order not found' })
          return
        }
        try {
          await foodoraAdapter.pushStatus(store.getFoodoraCredentials(), order.externalId ?? order.id, status)
          const updated = orders.map((candidate) => (candidate.id === orderId ? { ...candidate, status } : candidate))
          applyUpdate('admin.foodoraOrders', updated)
          console.log(`[foodora] ${session.username} pushed status "${status}" for order ${orderId}`)
          sendJson(res, 200, { ok: true })
        } catch (error) {
          console.error('[foodora] status push failed:', error)
          sendJson(res, 502, { error: 'Could not push this status update to Foodora' })
        }
      })
      .catch(() => sendJson(res, 400, { error: 'Malformed request body' }))
    return
  }

  // AI assistant (Claude or local/Ollama, see store.AssistantProvider) — see
  // server/assistant/*. `/assistant/credentials` is admin/subadmin only,
  // same posture as Wolt/Foodora above (contains a real API key). The step
  // routes below are open to any authenticated session — each one gates
  // per-entity internally (see server/assistant/registry.ts's
  // sessionCanUseEntity), since which entities/actions are available varies
  // by role/section, not a single fixed role check. None of these routes
  // ever mutate app data (see server/assistant/types.ts's own module doc
  // comment) — the actual write always happens from the browser's own
  // existing save/delete path once the admin confirms in the review step.
  // Most may also carry their own `model`, letting `AssistantPanel`'s
  // model-picker menu override just that one call's Claude model without
  // touching `store.setAssistantModel` (the shared, admin-configured default
  // every other caller still falls back to) — see `assistantSteps`'s own
  // `modelOverride` params and `client.ts`'s `ToolCallInput.model`; this
  // override is Claude-only, since the Ollama path routes deterministically
  // by call shape instead (see `ollamaClient.ts`).
  const isAssistantModel = (value: unknown): value is store.AssistantModel =>
    value === 'claude-haiku-4-5' || value === 'claude-sonnet-4-5' || value === 'claude-opus-4-5'
  /** Validates a per-device `provider` override (see `AssistantPanel`'s kebab menu) the same defensive way `isAssistantModel` validates `model` — an invalid/missing value falls back to `undefined`, which every step function itself then falls back to the shared, admin-configured default for. */
  const isAssistantProvider = (value: unknown): value is store.AssistantProvider => value === 'local' || value === 'claude'
  /** Validates the kebab menu's "Ekstra forsiktig modus" override, same defensive pattern as `isAssistantProvider` — an invalid/missing value falls back to `undefined`, which `resolveIngestionPosture` itself then resolves per the active provider. */
  const isIngestionPosture = (value: unknown): value is assistantSteps.AssistantIngestionPosture => value === 'auto' || value === 'safe' || value === 'full'

  if (req.method === 'GET' && url.pathname === '/assistant/credentials') {
    const session = store.getSession(bearerToken(req) ?? '')
    if (!session) {
      sendJson(res, 401, { error: 'Authentication required' })
      return
    }
    if (session.role === 'limited') {
      sendJson(res, 403, { error: 'Only admin/subadmin accounts can view the assistant configuration' })
      return
    }
    sendJson(res, 200, {
      hasKey: Boolean(store.getAnthropicApiKey()),
      provider: store.getAssistantProvider(),
      model: store.getAssistantModel(),
      productNameCandidateSuggestionsEnabled: store.getProductNameCandidateSuggestionsEnabled(),
    })
    return
  }

  if (req.method === 'POST' && url.pathname === '/assistant/credentials') {
    const session = store.getSession(bearerToken(req) ?? '')
    if (!session) {
      sendJson(res, 401, { error: 'Authentication required' })
      return
    }
    if (session.role === 'limited') {
      sendJson(res, 403, { error: 'Only admin/subadmin accounts can edit the assistant configuration' })
      return
    }
    readJsonBody(req)
      .then((body) => {
        const { apiKey, provider, model, productNameCandidateSuggestionsEnabled } = body as {
          apiKey?: string | null
          provider?: 'local' | 'claude'
          model?: store.AssistantModel
          productNameCandidateSuggestionsEnabled?: boolean
        }
        if (apiKey !== undefined) store.setAnthropicApiKey(typeof apiKey === 'string' && apiKey.trim() ? apiKey.trim() : null)
        if (provider === 'local' || provider === 'claude') store.setAssistantProvider(provider)
        if (isAssistantModel(model)) store.setAssistantModel(model)
        if (typeof productNameCandidateSuggestionsEnabled === 'boolean') store.setProductNameCandidateSuggestionsEnabled(productNameCandidateSuggestionsEnabled)
        console.log(`[assistant] ${session.username} updated the assistant configuration`)
        sendJson(res, 200, {
          hasKey: Boolean(store.getAnthropicApiKey()),
          provider: store.getAssistantProvider(),
          model: store.getAssistantModel(),
          productNameCandidateSuggestionsEnabled: store.getProductNameCandidateSuggestionsEnabled(),
        })
      })
      .catch(() => sendJson(res, 400, { error: 'Malformed request body' }))
    return
  }

  /**
   * Echoes the client-assigned `turnVersion` (see `useAssistantFlow.ts`'s own `turnVersionRef` doc
   * comment) back onto a step function's result, and stamps it onto every trace entry the result
   * carries — purely an echo for the client's own stale-turn detection and trace-panel debugging; no
   * server-side logic here or in `assistantSteps.*` ever branches on this value. Shared by every
   * `/assistant/*` route below rather than duplicated per-route.
   */
  function stampTurnVersion<T extends object>(result: T, turnVersion: number | undefined): T & { turnVersion?: number } {
    if (turnVersion === undefined) return result
    const stamped: Record<string, unknown> = { ...result, turnVersion }
    const trace = (result as Record<string, unknown>).trace
    if (Array.isArray(trace)) {
      stamped.trace = (trace as Record<string, unknown>[]).map((entry) => ({ ...entry, turnVersion }))
    }
    return stamped as T & { turnVersion?: number }
  }

  if (req.method === 'POST' && url.pathname === '/assistant/intent') {
    const session = store.getSession(bearerToken(req) ?? '')
    if (!session) {
      sendJson(res, 401, { error: 'Authentication required' })
      return
    }
    // Listens on `res`, not `req` — `req`'s own 'close' fires as soon as the request body has been
    // fully read (confirmed empirically; not just a docs-reading mistake), long before the response is
    // sent, which aborted every real call almost immediately and silently dropped the response
    // entirely (the catch block below skips responding once aborted) — this is what caused every
    // assistant reply to hang or never arrive right after this wiring first landed. `res`'s own
    // 'close' correctly fires early (before the response) only on a genuine client disconnect, and
    // late (after, with `writableEnded: true`) on normal completion — the `writableEnded` guard makes
    // the late, harmless case a no-op instead of racing an abort against an already-sent response.
    const abortController = new AbortController()
    res.on('close', () => { if (!res.writableEnded) abortController.abort() })
    readJsonBody(req)
      .then(async (body) => {
        const { message, uiLanguage, model, history, provider, localModel, conversationId, turnVersion } = body as {
          message?: string
          uiLanguage?: 'no' | 'en'
          model?: store.AssistantModel
          history?: string
          provider?: store.AssistantProvider
          localModel?: string
          conversationId?: string
          turnVersion?: number
        }
        if (!message || (uiLanguage !== 'no' && uiLanguage !== 'en')) {
          sendJson(res, 400, { error: 'Missing message or uiLanguage' })
          return
        }
        try {
          sendJson(
            res,
            200,
            stampTurnVersion(
              await assistantSteps.selectIntent(session, message, uiLanguage, {
                modelOverride: isAssistantModel(model) ? model : undefined,
                history: typeof history === 'string' ? history : undefined,
                providerOverride: isAssistantProvider(provider) ? provider : undefined,
                localModelOverride: typeof localModel === 'string' ? localModel : undefined,
                conversationId: typeof conversationId === 'string' ? conversationId : undefined,
                signal: abortController.signal,
              }),
              typeof turnVersion === 'number' ? turnVersion : undefined,
            ),
          )
        } catch (error) {
          if (abortController.signal.aborted) return
          sendJson(res, error instanceof AssistantNotConfiguredError || error instanceof AssistantLocalProviderError ? 409 : 400, { error: (error as Error).message })
        }
      })
      .catch(() => sendJson(res, 400, { error: 'Malformed request body' }))
    return
  }

  if (req.method === 'POST' && url.pathname === '/assistant/select-item') {
    const session = store.getSession(bearerToken(req) ?? '')
    if (!session) {
      sendJson(res, 401, { error: 'Authentication required' })
      return
    }
    const abortController = new AbortController()
    res.on('close', () => { if (!res.writableEnded) abortController.abort() })
    readJsonBody(req)
      .then(async (body) => {
        const { entity, action, message, searchText, uiLanguage, priorItemID, model, historyContext, provider, localModel, turnVersion } = body as {
          entity?: string
          action?: AssistantActionName
          message?: string
          searchText?: string
          uiLanguage?: 'no' | 'en'
          priorItemID?: string
          model?: store.AssistantModel
          historyContext?: string
          provider?: store.AssistantProvider
          localModel?: string
          turnVersion?: number
        }
        if (!entity || !action || !message || (uiLanguage !== 'no' && uiLanguage !== 'en')) {
          sendJson(res, 400, { error: 'Missing entity, action, message, or uiLanguage' })
          return
        }
        try {
          sendJson(
            res,
            200,
            stampTurnVersion(
              await assistantSteps.selectItem(entity, action, session, message, searchText ?? '', uiLanguage, {
                priorItemID,
                modelOverride: isAssistantModel(model) ? model : undefined,
                historyContext: typeof historyContext === 'string' ? historyContext : undefined,
                providerOverride: isAssistantProvider(provider) ? provider : undefined,
                localModelOverride: typeof localModel === 'string' ? localModel : undefined,
                signal: abortController.signal,
              }),
              typeof turnVersion === 'number' ? turnVersion : undefined,
            ),
          )
        } catch (error) {
          if (abortController.signal.aborted) return
          sendJson(res, error instanceof AssistantNotConfiguredError || error instanceof AssistantLocalProviderError ? 409 : 400, { error: (error as Error).message })
        }
      })
      .catch(() => sendJson(res, 400, { error: 'Malformed request body' }))
    return
  }

  if (req.method === 'POST' && url.pathname === '/assistant/title') {
    const session = store.getSession(bearerToken(req) ?? '')
    if (!session) {
      sendJson(res, 401, { error: 'Authentication required' })
      return
    }
    const abortController = new AbortController()
    res.on('close', () => { if (!res.writableEnded) abortController.abort() })
    readJsonBody(req)
      .then(async (body) => {
        const { transcriptText, uiLanguage, model, provider, localModel, turnVersion } = body as {
          transcriptText?: string
          uiLanguage?: 'no' | 'en'
          model?: store.AssistantModel
          provider?: store.AssistantProvider
          localModel?: string
          turnVersion?: number
        }
        if (!transcriptText || (uiLanguage !== 'no' && uiLanguage !== 'en')) {
          sendJson(res, 400, { error: 'Missing transcriptText or uiLanguage' })
          return
        }
        try {
          sendJson(
            res,
            200,
            stampTurnVersion(
              await assistantSteps.generateTitle(transcriptText, uiLanguage, {
                modelOverride: isAssistantModel(model) ? model : undefined,
                providerOverride: isAssistantProvider(provider) ? provider : undefined,
                localModelOverride: typeof localModel === 'string' ? localModel : undefined,
                signal: abortController.signal,
              }),
              typeof turnVersion === 'number' ? turnVersion : undefined,
            ),
          )
        } catch (error) {
          if (abortController.signal.aborted) return
          sendJson(res, error instanceof AssistantNotConfiguredError || error instanceof AssistantLocalProviderError ? 409 : 400, { error: (error as Error).message })
        }
      })
      .catch(() => sendJson(res, 400, { error: 'Malformed request body' }))
    return
  }

  if (req.method === 'POST' && url.pathname === '/assistant/lookup') {
    const session = store.getSession(bearerToken(req) ?? '')
    if (!session) {
      sendJson(res, 401, { error: 'Authentication required' })
      return
    }
    const abortController = new AbortController()
    res.on('close', () => { if (!res.writableEnded) abortController.abort() })
    readJsonBody(req)
      .then(async (body) => {
        const { message, uiLanguage, entities, model, chunkSizePreference, customChunkRecordCount, historyContext, provider, itemSearchText, localModel, baseFilters, conversationId, turnVersion } = body as {
          message?: string
          uiLanguage?: 'no' | 'en'
          entities?: string[]
          model?: store.AssistantModel
          chunkSizePreference?: assistantSteps.ChunkSizePreference
          customChunkRecordCount?: number
          historyContext?: string
          provider?: store.AssistantProvider
          itemSearchText?: string
          localModel?: string
          baseFilters?: LookupQueryFilterInput[] | null
          conversationId?: string
          turnVersion?: number
        }
        if (!message || (uiLanguage !== 'no' && uiLanguage !== 'en') || !Array.isArray(entities)) {
          sendJson(res, 400, { error: 'Missing message, uiLanguage, or entities' })
          return
        }
        try {
          sendJson(
            res,
            200,
            stampTurnVersion(
              await assistantSteps.answerLookup(session, message, uiLanguage, entities, {
                modelOverride: isAssistantModel(model) ? model : undefined,
                chunkSizePreference,
                customChunkRecordCount,
                historyContext: typeof historyContext === 'string' ? historyContext : undefined,
                providerOverride: isAssistantProvider(provider) ? provider : undefined,
                itemSearchText: typeof itemSearchText === 'string' ? itemSearchText : undefined,
                localModelOverride: typeof localModel === 'string' ? localModel : undefined,
                baseFilters: Array.isArray(baseFilters) ? baseFilters : undefined,
                conversationId: typeof conversationId === 'string' ? conversationId : undefined,
                signal: abortController.signal,
              }),
              typeof turnVersion === 'number' ? turnVersion : undefined,
            ),
          )
        } catch (error) {
          if (abortController.signal.aborted) return
          sendJson(res, error instanceof AssistantNotConfiguredError || error instanceof AssistantLocalProviderError ? 409 : 400, { error: (error as Error).message })
        }
      })
      .catch(() => sendJson(res, 400, { error: 'Malformed request body' }))
    return
  }

  // The continuation call once the admin has picked one specific candidate off an
  // /assistant/lookup response's own `"status": "clarifyItem"` result (see
  // assistantSteps.answerLookupForItem's own doc comment) — never searches/picks anything itself,
  // `itemID` is already a settled fact by the time this is called.
  if (req.method === 'POST' && url.pathname === '/assistant/lookup-item') {
    const session = store.getSession(bearerToken(req) ?? '')
    if (!session) {
      sendJson(res, 401, { error: 'Authentication required' })
      return
    }
    const abortController = new AbortController()
    res.on('close', () => { if (!res.writableEnded) abortController.abort() })
    readJsonBody(req)
      .then(async (body) => {
        const { entity, itemID, message, uiLanguage, historyContext, model, provider, localModel, label, conversationId, aliasHarvest, turnVersion } = body as {
          entity?: string
          itemID?: string
          message?: string
          uiLanguage?: 'no' | 'en'
          historyContext?: string
          model?: store.AssistantModel
          provider?: store.AssistantProvider
          localModel?: string
          label?: string
          conversationId?: string
          aliasHarvest?: { query: string; tier: '4' | '5'; presentationId: string }
          turnVersion?: number
        }
        if (!entity || !itemID || !message || (uiLanguage !== 'no' && uiLanguage !== 'en')) {
          sendJson(res, 400, { error: 'Missing entity, itemID, message, or uiLanguage' })
          return
        }
        try {
          sendJson(
            res,
            200,
            stampTurnVersion(
              await assistantSteps.answerLookupForItem(entity, itemID, message, uiLanguage, session, {
                historyContext: typeof historyContext === 'string' ? historyContext : undefined,
                modelOverride: isAssistantModel(model) ? model : undefined,
                providerOverride: isAssistantProvider(provider) ? provider : undefined,
                localModelOverride: typeof localModel === 'string' ? localModel : undefined,
                label: typeof label === 'string' ? label : undefined,
                conversationId: typeof conversationId === 'string' ? conversationId : undefined,
                aliasHarvest:
                  aliasHarvest && (aliasHarvest.tier === '4' || aliasHarvest.tier === '5') && typeof aliasHarvest.query === 'string' && typeof aliasHarvest.presentationId === 'string'
                    ? aliasHarvest
                    : undefined,
                signal: abortController.signal,
              }),
              typeof turnVersion === 'number' ? turnVersion : undefined,
            ),
          )
        } catch (error) {
          if (abortController.signal.aborted) return
          sendJson(res, error instanceof AssistantNotConfiguredError || error instanceof AssistantLocalProviderError ? 409 : 400, { error: (error as Error).message })
        }
      })
      .catch(() => sendJson(res, 400, { error: 'Malformed request body' }))
    return
  }

  // Debug/measurement surface for the product-name resolution ladder (see `productNameResolution.ts`'s
  // own module doc comment) — the most recent resolution attempts, most recent last. Not a `SyncedKey`
  // (no dashboard form edits this), same admin/subadmin gate as `/assistant/credentials`. See
  // `DeveloperDocsView.tsx`'s "Product-name resolution log" card for the documented response shape.
  if (req.method === 'GET' && url.pathname === '/assistant/product-name-resolution-log') {
    const session = store.getSession(bearerToken(req) ?? '')
    if (!session) {
      sendJson(res, 401, { error: 'Authentication required' })
      return
    }
    if (session.role === 'limited') {
      sendJson(res, 403, { error: 'Only admin/subadmin accounts can view the assistant configuration' })
      return
    }
    const limitParam = Number(url.searchParams.get('limit'))
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 500) : 100
    const log = store.getProductNameResolutionLog()
    sendJson(res, 200, { entries: log.slice(Math.max(0, log.length - limit)) })
    return
  }

  if (req.method === 'POST' && url.pathname === '/assistant/fill-fields') {
    const session = store.getSession(bearerToken(req) ?? '')
    if (!session) {
      sendJson(res, 401, { error: 'Authentication required' })
      return
    }
    const abortController = new AbortController()
    res.on('close', () => { if (!res.writableEnded) abortController.abort() })
    readJsonBody(req)
      .then(async (body) => {
        const {
          entity,
          action,
          itemID,
          message,
          uiLanguage,
          priorDraft,
          image,
          resolvedFields,
          model,
          history,
          historyContext,
          provider,
          localModel,
          localVisionModel,
          posture,
          conversationId,
          turnVersion,
          allowPaneContentEditing,
        } = body as {
          entity?: string
          action?: AssistantActionName
          itemID?: string
          message?: string
          uiLanguage?: 'no' | 'en'
          priorDraft?: unknown
          image?: { mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'; base64Data: string }
          resolvedFields?: Record<string, string>
          model?: store.AssistantModel
          history?: string
          historyContext?: string
          provider?: store.AssistantProvider
          localModel?: string
          localVisionModel?: string
          posture?: assistantSteps.AssistantIngestionPosture
          conversationId?: string
          turnVersion?: number
          allowPaneContentEditing?: boolean
        }
        if (!entity || !action || !message || (uiLanguage !== 'no' && uiLanguage !== 'en')) {
          sendJson(res, 400, { error: 'Missing entity, action, message, or uiLanguage' })
          return
        }
        try {
          sendJson(
            res,
            200,
            stampTurnVersion(
              await assistantSteps.fillFields(entity, action, session, message, uiLanguage, {
                itemID,
                image,
                priorDraft,
                resolvedFields,
                modelOverride: isAssistantModel(model) ? model : undefined,
                providerOverride: isAssistantProvider(provider) ? provider : undefined,
                localModelOverride: typeof localModel === 'string' ? localModel : undefined,
                localVisionModelOverride: typeof localVisionModel === 'string' ? localVisionModel : undefined,
                postureOverride: isIngestionPosture(posture) ? posture : undefined,
                history: typeof history === 'string' ? history : undefined,
                historyContext: typeof historyContext === 'string' ? historyContext : undefined,
                conversationId: typeof conversationId === 'string' ? conversationId : undefined,
                signal: abortController.signal,
                allowPaneContentEditing: typeof allowPaneContentEditing === 'boolean' ? allowPaneContentEditing : undefined,
              }),
              typeof turnVersion === 'number' ? turnVersion : undefined,
            ),
          )
        } catch (error) {
          if (abortController.signal.aborted) return
          sendJson(res, error instanceof AssistantNotConfiguredError || error instanceof AssistantLocalProviderError ? 409 : 400, { error: (error as Error).message })
        }
      })
      .catch(() => sendJson(res, 400, { error: 'Malformed request body' }))
    return
  }

  // Batch sibling of /assistant/fill-fields — create only, see assistantSteps.fillFieldsBatch's own
  // doc comment. Never writes anything; same posture as every other assistant route.
  if (req.method === 'POST' && url.pathname === '/assistant/fill-fields-batch') {
    const session = store.getSession(bearerToken(req) ?? '')
    if (!session) {
      sendJson(res, 401, { error: 'Authentication required' })
      return
    }
    const abortController = new AbortController()
    res.on('close', () => { if (!res.writableEnded) abortController.abort() })
    readJsonBody(req)
      .then(async (body) => {
        const { entity, message, uiLanguage, resolvedFields, model, history, historyContext, provider, localModel, posture, conversationId, turnVersion } = body as {
          entity?: string
          message?: string
          uiLanguage?: 'no' | 'en'
          resolvedFields?: Record<string, string>
          model?: store.AssistantModel
          history?: string
          historyContext?: string
          provider?: store.AssistantProvider
          localModel?: string
          posture?: assistantSteps.AssistantIngestionPosture
          conversationId?: string
          turnVersion?: number
        }
        if (!entity || !message || (uiLanguage !== 'no' && uiLanguage !== 'en')) {
          sendJson(res, 400, { error: 'Missing entity, message, or uiLanguage' })
          return
        }
        try {
          sendJson(
            res,
            200,
            stampTurnVersion(
              await assistantSteps.fillFieldsBatch(entity, session, message, uiLanguage, {
                resolvedFields,
                modelOverride: isAssistantModel(model) ? model : undefined,
                providerOverride: isAssistantProvider(provider) ? provider : undefined,
                localModelOverride: typeof localModel === 'string' ? localModel : undefined,
                postureOverride: isIngestionPosture(posture) ? posture : undefined,
                history: typeof history === 'string' ? history : undefined,
                historyContext: typeof historyContext === 'string' ? historyContext : undefined,
                conversationId: typeof conversationId === 'string' ? conversationId : undefined,
                signal: abortController.signal,
              }),
              typeof turnVersion === 'number' ? turnVersion : undefined,
            ),
          )
        } catch (error) {
          if (abortController.signal.aborted) return
          sendJson(res, error instanceof AssistantNotConfiguredError || error instanceof AssistantLocalProviderError ? 409 : 400, { error: (error as Error).message })
        }
      })
      .catch(() => sendJson(res, 400, { error: 'Malformed request body' }))
    return
  }

  // Resolves one or more outstanding fillFields clarifications from a free-text chat reply instead
  // of a tap — see assistantSteps.resolveClarificationChat's own doc comment. Never writes
  // anything; same posture as every other assistant route.
  if (req.method === 'POST' && url.pathname === '/assistant/resolve-clarification') {
    const session = store.getSession(bearerToken(req) ?? '')
    if (!session) {
      sendJson(res, 401, { error: 'Authentication required' })
      return
    }
    const abortController = new AbortController()
    res.on('close', () => { if (!res.writableEnded) abortController.abort() })
    readJsonBody(req)
      .then(async (body) => {
        const { clarifications, message, uiLanguage, model, provider, localModel, turnVersion } = body as {
          clarifications?: assistantSteps.FillFieldsClarification[]
          message?: string
          uiLanguage?: 'no' | 'en'
          model?: store.AssistantModel
          provider?: store.AssistantProvider
          localModel?: string
          turnVersion?: number
        }
        if (!Array.isArray(clarifications) || clarifications.length === 0 || !message || (uiLanguage !== 'no' && uiLanguage !== 'en')) {
          sendJson(res, 400, { error: 'Missing clarifications, message, or uiLanguage' })
          return
        }
        try {
          sendJson(
            res,
            200,
            stampTurnVersion(
              await assistantSteps.resolveClarificationChat(clarifications, message, uiLanguage, {
                modelOverride: isAssistantModel(model) ? model : undefined,
                providerOverride: isAssistantProvider(provider) ? provider : undefined,
                localModelOverride: typeof localModel === 'string' ? localModel : undefined,
                signal: abortController.signal,
              }),
              typeof turnVersion === 'number' ? turnVersion : undefined,
            ),
          )
        } catch (error) {
          if (abortController.signal.aborted) return
          sendJson(res, error instanceof AssistantNotConfiguredError || error instanceof AssistantLocalProviderError ? 409 : 400, { error: (error as Error).message })
        }
      })
      .catch(() => sendJson(res, 400, { error: 'Malformed request body' }))
    return
  }

  // Ollama (local assistant provider) config — same admin/subadmin-only
  // posture as /assistant/credentials above, since it's the same kind of
  // settings blob (see server/store.ts's getOllamaConfig/setOllamaConfig).
  // Nothing here is secret (unlike the Claude API key), but it's still
  // gated the same way since it configures the same feature.
  if (req.method === 'GET' && url.pathname === '/assistant/ollama-config') {
    const session = store.getSession(bearerToken(req) ?? '')
    if (!session) {
      sendJson(res, 401, { error: 'Authentication required' })
      return
    }
    if (session.role === 'limited') {
      sendJson(res, 403, { error: 'Only admin/subadmin accounts can view the assistant configuration' })
      return
    }
    sendJson(res, 200, store.getOllamaConfig())
    return
  }

  if (req.method === 'POST' && url.pathname === '/assistant/ollama-config') {
    const session = store.getSession(bearerToken(req) ?? '')
    if (!session) {
      sendJson(res, 401, { error: 'Authentication required' })
      return
    }
    if (session.role === 'limited') {
      sendJson(res, 403, { error: 'Only admin/subadmin accounts can edit the assistant configuration' })
      return
    }
    readJsonBody(req)
      .then((body) => {
        const { baseUrl, visionModel, thinkingModel } = body as Partial<store.OllamaConfig>
        store.setOllamaConfig({
          baseUrl: typeof baseUrl === 'string' && baseUrl.trim() ? baseUrl.trim() : undefined,
          visionModel: typeof visionModel === 'string' && visionModel.trim() ? visionModel.trim() : undefined,
          thinkingModel: typeof thinkingModel === 'string' && thinkingModel.trim() ? thinkingModel.trim() : undefined,
        })
        console.log(`[assistant] ${session.username} updated the Ollama configuration`)
        sendJson(res, 200, store.getOllamaConfig())
      })
      .catch(() => sendJson(res, 400, { error: 'Malformed request body' }))
    return
  }

  // Reachability/model-presence check for the Integrations page's Ollama
  // card — `body` may carry not-yet-saved draft values so an admin can test
  // an edit before saving it.
  if (req.method === 'POST' && url.pathname === '/assistant/ollama-test') {
    const session = store.getSession(bearerToken(req) ?? '')
    if (!session) {
      sendJson(res, 401, { error: 'Authentication required' })
      return
    }
    if (session.role === 'limited') {
      sendJson(res, 403, { error: 'Only admin/subadmin accounts can test the assistant configuration' })
      return
    }
    readJsonBody(req)
      .then(async (body) => {
        const { baseUrl, visionModel, thinkingModel } = body as Partial<store.OllamaConfig>
        sendJson(res, 200, await testOllamaConnection({ baseUrl, visionModel, thinkingModel }))
      })
      .catch(() => sendJson(res, 400, { error: 'Malformed request body' }))
    return
  }

  // Pulls a model tag onto the configured Ollama host — backs the
  // Integrations page's "Download missing model" button. Unlike the config
  // routes above, this doesn't touch any secret and only ever downloads a
  // model, never runs arbitrary input — but still admin/subadmin-gated,
  // same posture as the rest of this feature's settings.
  if (req.method === 'POST' && url.pathname === '/assistant/ollama-pull') {
    const session = store.getSession(bearerToken(req) ?? '')
    if (!session) {
      sendJson(res, 401, { error: 'Authentication required' })
      return
    }
    if (session.role === 'limited') {
      sendJson(res, 403, { error: 'Only admin/subadmin accounts can download assistant models' })
      return
    }
    readJsonBody(req)
      .then(async (body) => {
        const { tag } = body as { tag?: string }
        if (!tag) {
          sendJson(res, 400, { error: 'Missing tag' })
          return
        }
        console.log(`[assistant] ${session.username} started downloading Ollama model "${tag}"`)
        const result = await pullOllamaModel(tag)
        sendJson(res, result.ok ? 200 : 502, result)
      })
      .catch(() => sendJson(res, 400, { error: 'Malformed request body' }))
    return
  }

  // Full list of every model tag actually pulled on the configured Ollama host (not just the two
  // configured vision/thinking roles) — backs the Integrations page's own model manager submenu.
  if (req.method === 'GET' && url.pathname === '/assistant/ollama-models') {
    const session = store.getSession(bearerToken(req) ?? '')
    if (!session) {
      sendJson(res, 401, { error: 'Authentication required' })
      return
    }
    if (session.role === 'limited') {
      sendJson(res, 403, { error: 'Only admin/subadmin accounts can view the assistant configuration' })
      return
    }
    listOllamaModels()
      .then((result) => sendJson(res, result.ok ? 200 : 502, result))
      .catch(() => sendJson(res, 502, { ok: false, error: 'Could not reach the Ollama host.' }))
    return
  }

  // Deletes a model tag from the configured Ollama host — backs the model manager's own "Delete"
  // button. Same admin/subadmin-only posture as the pull route above.
  if (req.method === 'POST' && url.pathname === '/assistant/ollama-delete') {
    const session = store.getSession(bearerToken(req) ?? '')
    if (!session) {
      sendJson(res, 401, { error: 'Authentication required' })
      return
    }
    if (session.role === 'limited') {
      sendJson(res, 403, { error: 'Only admin/subadmin accounts can delete assistant models' })
      return
    }
    readJsonBody(req)
      .then(async (body) => {
        const { tag } = body as { tag?: string }
        if (!tag) {
          sendJson(res, 400, { error: 'Missing tag' })
          return
        }
        console.log(`[assistant] ${session.username} deleted Ollama model "${tag}"`)
        const result = await deleteOllamaModel(tag)
        sendJson(res, result.ok ? 200 : 502, result)
      })
      .catch(() => sendJson(res, 400, { error: 'Malformed request body' }))
    return
  }

  // Generic "just read this photo" mode — see assistant/steps.ts's
  // transcribeAttachment doc comment. Open to any authenticated session,
  // same posture as the five step routes above; never writes app data.
  if (req.method === 'POST' && url.pathname === '/assistant/transcribe') {
    const session = store.getSession(bearerToken(req) ?? '')
    if (!session) {
      sendJson(res, 401, { error: 'Authentication required' })
      return
    }
    const abortController = new AbortController()
    res.on('close', () => { if (!res.writableEnded) abortController.abort() })
    readJsonBody(req)
      .then(async (body) => {
        const { message, uiLanguage, image, model, provider, localModel, localVisionModel, turnVersion } = body as {
          message?: string
          uiLanguage?: 'no' | 'en'
          image?: { mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'; base64Data: string }
          model?: store.AssistantModel
          provider?: store.AssistantProvider
          localModel?: string
          localVisionModel?: string
          turnVersion?: number
        }
        if (uiLanguage !== 'no' && uiLanguage !== 'en') {
          sendJson(res, 400, { error: 'Missing uiLanguage' })
          return
        }
        if (!image) {
          sendJson(res, 400, { error: 'Missing image' })
          return
        }
        try {
          sendJson(
            res,
            200,
            stampTurnVersion(
              await assistantSteps.transcribeAttachment(message ?? '', uiLanguage, image, {
                modelOverride: isAssistantModel(model) ? model : undefined,
                providerOverride: isAssistantProvider(provider) ? provider : undefined,
                localModelOverride: typeof localModel === 'string' ? localModel : undefined,
                localVisionModelOverride: typeof localVisionModel === 'string' ? localVisionModel : undefined,
                signal: abortController.signal,
              }),
              typeof turnVersion === 'number' ? turnVersion : undefined,
            ),
          )
        } catch (error) {
          if (abortController.signal.aborted) return
          sendJson(res, error instanceof AssistantNotConfiguredError || error instanceof AssistantLocalProviderError ? 409 : 400, { error: (error as Error).message })
        }
      })
      .catch(() => sendJson(res, 400, { error: 'Malformed request body' }))
    return
  }

  // How a screen's own `/screens/:screenId` link should be addressed (see
  // Settings → Advanced). Public read (nothing sensitive in it, and it's
  // used to build a plain display link); admin/subadmin-only write, same
  // posture as the Neon URL above.
  if (req.method === 'GET' && url.pathname === '/screen-address') {
    sendJson(res, 200, store.getScreenAddressSettings())
    return
  }

  if (req.method === 'POST' && url.pathname === '/screen-address') {
    const session = store.getSession(bearerToken(req) ?? '')
    if (!session) {
      sendJson(res, 401, { error: 'Authentication required' })
      return
    }
    if (session.role === 'limited') {
      sendJson(res, 403, { error: 'Only admin/subadmin accounts can edit the screen address settings' })
      return
    }
    readJsonBody(req)
      .then((body) => {
        const { mode, customHost } = body as { mode?: string; customHost?: string }
        if (mode !== 'automatic' && mode !== 'custom' && mode !== 'mdns') {
          sendJson(res, 400, { error: 'Invalid mode' })
          return
        }
        const settings: ScreenAddressSettings = {
          mode,
          customHost: typeof customHost === 'string' ? customHost.trim() || undefined : undefined,
        }
        store.setScreenAddressSettings(settings)
        mdns.apply(settings, currentStoreName())
        console.log(`[screen-address] ${session.username} set mode to "${settings.mode}"`)
        sendJson(res, 200, settings)
      })
      .catch(() => sendJson(res, 400, { error: 'Malformed request body' }))
    return
  }

  // Which window a Windows machine opens the kiosk display in at boot (see
  // Settings → Advanced) — read by installer/start-adhdisplay.bat's own
  // `:launch_window` subroutine via a plain HTTP GET (a .bat script has no
  // WebSocket client). Public read (nothing sensitive, and a display-only
  // machine with no login of its own still needs to read it); admin/subadmin
  // -only write, same posture as the Neon URL/screen-address routes above.
  if (req.method === 'GET' && url.pathname === '/window-launch-method') {
    sendJson(res, 200, store.getWindowLaunchSettings())
    return
  }

  if (req.method === 'POST' && url.pathname === '/window-launch-method') {
    const session = store.getSession(bearerToken(req) ?? '')
    if (!session) {
      sendJson(res, 401, { error: 'Authentication required' })
      return
    }
    if (session.role === 'limited') {
      sendJson(res, 403, { error: 'Only admin/subadmin accounts can edit the window launch method' })
      return
    }
    readJsonBody(req)
      .then((body) => {
        const { method } = body as { method?: string }
        if (method !== 'auto' && method !== 'electron' && method !== 'edge') {
          sendJson(res, 400, { error: 'Invalid method' })
          return
        }
        const settings: WindowLaunchSettings = { method }
        store.setWindowLaunchSettings(settings)
        console.log(`[window-launch-method] ${session.username} set method to "${settings.method}"`)
        sendJson(res, 200, settings)
      })
      .catch(() => sendJson(res, 400, { error: 'Malformed request body' }))
    return
  }

  // Backup/restore (Settings → Backup) — admin/subadmin only, same posture
  // as the routes above. See server/backup.ts for the actual file-level
  // logic; this block is just auth + response plumbing, matching the rest
  // of this file's own convention.
  if (req.method === 'GET' && url.pathname === '/backups/status') {
    const session = store.getSession(bearerToken(req) ?? '')
    if (!session) {
      sendJson(res, 401, { error: 'Authentication required' })
      return
    }
    if (session.role === 'limited') {
      sendJson(res, 403, { error: 'Only admin/subadmin accounts can view backup status' })
      return
    }
    sendJson(res, 200, backup.backupStatus())
    return
  }

  if (req.method === 'GET' && url.pathname === '/backups') {
    const session = store.getSession(bearerToken(req) ?? '')
    if (!session) {
      sendJson(res, 401, { error: 'Authentication required' })
      return
    }
    if (session.role === 'limited') {
      sendJson(res, 403, { error: 'Only admin/subadmin accounts can create a backup' })
      return
    }
    const zipBuffer = backup.createBackupZip()
    res.writeHead(200, {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="adhdisplay-backup-${new Date().toISOString().slice(0, 10)}.zip"`,
      ...CORS_HEADERS,
    })
    res.end(zipBuffer)
    console.log(`[backup] ${session.username} downloaded a backup zip`)
    return
  }

  if (req.method === 'POST' && url.pathname === '/backups/restore') {
    const session = store.getSession(bearerToken(req) ?? '')
    if (!session) {
      sendJson(res, 401, { error: 'Authentication required' })
      return
    }
    if (session.role === 'limited') {
      sendJson(res, 403, { error: 'Only admin/subadmin accounts can restore a backup' })
      return
    }
    backup
      .readRestoreZipBody(req)
      .then((zipBuffer) => {
        const result = backup.restoreBackupFromZip(zipBuffer)
        if (!result.ok) {
          sendJson(res, 400, { error: result.error })
          return
        }
        store.load()
        console.log(`[backup] ${session.username} restored from an uploaded backup zip`)
        sendJson(res, 200, { ok: true })
      })
      .catch(() => sendJson(res, 413, { error: 'File too large' }))
    return
  }

  if (req.method === 'POST' && url.pathname === '/backups/restore-from-folder') {
    const session = store.getSession(bearerToken(req) ?? '')
    if (!session) {
      sendJson(res, 401, { error: 'Authentication required' })
      return
    }
    if (session.role === 'limited') {
      sendJson(res, 403, { error: 'Only admin/subadmin accounts can restore a backup' })
      return
    }
    const result = backup.restoreFromBackupFolder()
    if (!result.ok) {
      sendJson(res, 400, { error: result.error })
      return
    }
    store.load()
    console.log(`[backup] ${session.username} restored from the sibling ADHDisplayBackup folder`)
    sendJson(res, 200, { ok: true })
    return
  }

  // Storage cleanup (Settings → Backup's own "Storage cleanup" section) —
  // admin/subadmin only, same posture as the backup routes above. The
  // preview route never deletes anything; the apply route only ever deletes
  // exactly what the admin explicitly confirmed, re-checked as still
  // prunable at that exact moment — see `server/storageCleanup.ts`'s own
  // module doc comment.
  if (req.method === 'GET' && url.pathname === '/storage-cleanup/preview') {
    const session = store.getSession(bearerToken(req) ?? '')
    if (!session) {
      sendJson(res, 401, { error: 'Authentication required' })
      return
    }
    if (session.role === 'limited') {
      sendJson(res, 403, { error: 'Only admin/subadmin accounts can view storage cleanup' })
      return
    }
    sendJson(res, 200, storageCleanup.computeCleanupPreview(host))
    return
  }

  if (req.method === 'POST' && url.pathname === '/storage-cleanup/apply') {
    const session = store.getSession(bearerToken(req) ?? '')
    if (!session) {
      sendJson(res, 401, { error: 'Authentication required' })
      return
    }
    if (session.role === 'limited') {
      sendJson(res, 403, { error: 'Only admin/subadmin accounts can apply storage cleanup' })
      return
    }
    readJsonBody(req)
      .then((body) => {
        const result = storageCleanup.applyCleanup(body as storageCleanup.CleanupSelection, host)
        console.log(
          `[storage-cleanup] ${session.username} deleted ${result.deletedOrders} order(s), ${result.deletedMessages} message(s), ${result.deletedMessageBoardPosts} message-board post(s), ${result.deletedDisplayMachines} display machine(s), ${result.deletedImages} image(s)`,
        )
        sendJson(res, 200, result)
      })
      .catch(() => sendJson(res, 400, { error: 'Malformed request body' }))
    return
  }

  // Screens snapshot history (Settings → Backup → "Screens history", and
  // each ScreenCard's own per-screen restore button) — admin/subadmin only,
  // same posture as the backup/storage-cleanup routes above. See
  // server/screensSnapshots.ts for the actual capture/rotation/pinning
  // logic; this block is just auth + response plumbing, matching this
  // file's own convention.
  if (req.method === 'GET' && url.pathname === '/screens-snapshots') {
    const session = store.getSession(bearerToken(req) ?? '')
    if (!session) {
      sendJson(res, 401, { error: 'Authentication required' })
      return
    }
    if (session.role === 'limited') {
      sendJson(res, 403, { error: 'Only admin/subadmin accounts can view screens snapshot history' })
      return
    }
    sendJson(res, 200, { snapshots: screensSnapshots.listSnapshots() })
    return
  }

  if (req.method === 'GET' && url.pathname === '/screens-snapshots/for-screen') {
    const session = store.getSession(bearerToken(req) ?? '')
    if (!session) {
      sendJson(res, 401, { error: 'Authentication required' })
      return
    }
    if (session.role === 'limited') {
      sendJson(res, 403, { error: 'Only admin/subadmin accounts can view screens snapshot history' })
      return
    }
    const screenID = url.searchParams.get('screenID')
    if (!screenID) {
      sendJson(res, 400, { error: 'Missing screenID' })
      return
    }
    sendJson(res, 200, { snapshots: screensSnapshots.listSnapshotsForScreen(screenID) })
    return
  }

  const snapshotDiffMatch = /^\/screens-snapshots\/(daily|weekly)\/([^/]+)\/diff$/.exec(url.pathname)
  if (req.method === 'GET' && snapshotDiffMatch) {
    const session = store.getSession(bearerToken(req) ?? '')
    if (!session) {
      sendJson(res, 401, { error: 'Authentication required' })
      return
    }
    if (session.role === 'limited') {
      sendJson(res, 403, { error: 'Only admin/subadmin accounts can view screens snapshot history' })
      return
    }
    const [, tier, id] = snapshotDiffMatch
    const diff = screensSnapshots.diffScreensAgainstLive(tier as screensSnapshots.SnapshotTier, decodeURIComponent(id))
    if (!diff) {
      sendJson(res, 404, { error: 'Snapshot not found' })
      return
    }
    sendJson(res, 200, { diff })
    return
  }

  const snapshotRestoreMatch = /^\/screens-snapshots\/(daily|weekly)\/([^/]+)\/restore$/.exec(url.pathname)
  if (req.method === 'POST' && snapshotRestoreMatch) {
    const session = store.getSession(bearerToken(req) ?? '')
    if (!session) {
      sendJson(res, 401, { error: 'Authentication required' })
      return
    }
    if (session.role === 'limited') {
      sendJson(res, 403, { error: 'Only admin/subadmin accounts can restore a screens snapshot' })
      return
    }
    const [, tier, id] = snapshotRestoreMatch
    const decodedId = decodeURIComponent(id)
    const tierValue = tier as screensSnapshots.SnapshotTier
    const screens = screensSnapshots.screensForWholeRestore(tierValue, decodedId)
    if (!screens) {
      sendJson(res, 404, { error: 'Snapshot not found' })
      return
    }
    screensSnapshots.copySnapshotImagesToUploads(tierValue, decodedId)
    applyUpdate('admin.screens', screens)
    console.log(`[screens-snapshots] ${session.username} restored the whole admin.screens array from ${tier}/${decodedId}`)
    sendJson(res, 200, { ok: true })
    return
  }

  const snapshotRestoreScreenMatch = /^\/screens-snapshots\/(daily|weekly)\/([^/]+)\/restore-screen\/([^/]+)$/.exec(url.pathname)
  if (req.method === 'POST' && snapshotRestoreScreenMatch) {
    const session = store.getSession(bearerToken(req) ?? '')
    if (!session) {
      sendJson(res, 401, { error: 'Authentication required' })
      return
    }
    if (session.role === 'limited') {
      sendJson(res, 403, { error: 'Only admin/subadmin accounts can restore a screens snapshot' })
      return
    }
    const [, tier, id, screenID] = snapshotRestoreScreenMatch
    const decodedId = decodeURIComponent(id)
    const decodedScreenID = decodeURIComponent(screenID)
    const tierValue = tier as screensSnapshots.SnapshotTier
    const liveScreensArray = (store.get('admin.screens')?.value as screensSnapshots.MinimalScreenConfig[] | undefined) ?? []
    const target = liveScreensArray.find((screen) => screen.screenID === decodedScreenID)
    // A non-empty `draft` on the target screen is either a human's own in-progress `ScreenDisplay`
    // edit, or (once the screenPane assistant entity lands) an assistant-staged change — either way,
    // restoring here would silently clobber unpublished work with no warning unless the caller
    // explicitly confirms via `?force=1` after being shown what's there.
    if (target?.draft && Object.keys(target.draft).length > 0 && url.searchParams.get('force') !== '1') {
      sendJson(res, 409, { error: 'This screen has unpublished changes (a draft) that restoring would discard.', hasDraft: true })
      return
    }
    const updatedScreens = screensSnapshots.screensForSingleScreenRestore(tierValue, decodedId, decodedScreenID, liveScreensArray)
    if (!updatedScreens) {
      sendJson(res, 404, { error: 'Snapshot (or this screen within it) not found' })
      return
    }
    screensSnapshots.copySnapshotImagesToUploads(tierValue, decodedId, [decodedScreenID])
    applyUpdate('admin.screens', updatedScreens)
    console.log(`[screens-snapshots] ${session.username} restored screen ${decodedScreenID} from ${tier}/${decodedId}`)
    sendJson(res, 200, { ok: true })
    return
  }

  // Account management (the admin dashboard's own "Users" tab) —
  // admin/subadmin only, same posture as the developer API key/Neon URL
  // routes above. Three extra rules beyond the plain role gate, enforced
  // here rather than in `store.ts` (which stays a dumb data layer): an
  // `admin`-role account can't be created or deleted by a `subadmin`
  // session (only deleted by another `admin`), the very last `admin`
  // account can never be deleted (there'd be no one left who could manage
  // users at all), and an account can't delete itself (self-lockout).
  if (url.pathname === '/users' || url.pathname.startsWith('/users/')) {
    const session = store.getSession(bearerToken(req) ?? '')
    if (!session) {
      sendJson(res, 401, { error: 'Authentication required' })
      return
    }
    if (session.role === 'limited') {
      sendJson(res, 403, { error: 'Only admin/subadmin accounts can manage users' })
      return
    }

    if (req.method === 'GET' && url.pathname === '/users') {
      sendJson(res, 200, store.listUsers())
      return
    }

    if (req.method === 'POST' && url.pathname === '/users') {
      readJsonBody(req)
        .then((body) => {
          const { username, password, role, allowedSections } = body as {
            username?: string
            password?: string
            role?: AdminRole
            allowedSections?: DashboardSection[]
          }
          const trimmedUsername = username?.trim()
          if (!trimmedUsername || !password || (role !== 'admin' && role !== 'subadmin' && role !== 'limited')) {
            sendJson(res, 400, { error: 'Missing or invalid username, password, or role' })
            return
          }
          if (role === 'admin' && session.role !== 'admin') {
            sendJson(res, 403, { error: 'Only admin accounts can create another admin account' })
            return
          }
          const created = store.createUser({ username: trimmedUsername, password, role, allowedSections: role === 'limited' ? allowedSections : undefined })
          if (!created) {
            sendJson(res, 409, { error: 'That username is already taken' })
            return
          }
          console.log(`[users] ${session.username} created ${created.username} (${created.role})`)
          sendJson(res, 200, created)
        })
        .catch(() => sendJson(res, 400, { error: 'Malformed request body' }))
      return
    }

    const segments = url.pathname.slice('/users/'.length).split('/').filter(Boolean)
    const userId = segments[0]

    if (req.method === 'DELETE' && segments.length === 1 && userId) {
      const target = store.findUserById(userId)
      if (!target) {
        sendJson(res, 404, { error: 'User not found' })
        return
      }
      if (target.username === session.username) {
        sendJson(res, 400, { error: "You can't delete your own account" })
        return
      }
      if (target.role === 'admin' && session.role !== 'admin') {
        sendJson(res, 403, { error: "Sub-admin accounts can't delete an admin account" })
        return
      }
      if (target.role === 'admin' && store.adminUserCount() <= 1) {
        sendJson(res, 400, { error: "Can't delete the last remaining admin account" })
        return
      }
      store.deleteUser(userId)
      console.log(`[users] ${session.username} deleted ${target.username}`)
      sendJson(res, 200, { ok: true })
      return
    }

    if (req.method === 'POST' && segments.length === 2 && segments[1] === 'password' && userId) {
      readJsonBody(req)
        .then((body) => {
          const { password } = body as { password?: string }
          if (!password) {
            sendJson(res, 400, { error: 'Missing password' })
            return
          }
          const target = store.findUserById(userId)
          if (!target) {
            sendJson(res, 404, { error: 'User not found' })
            return
          }
          store.setUserPassword(userId, password)
          console.log(`[users] ${session.username} reset the password for ${target.username}`)
          sendJson(res, 200, { ok: true })
        })
        .catch(() => sendJson(res, 400, { error: 'Malformed request body' }))
      return
    }
  }

  sendJson(res, 404, { error: 'Not found' })
})

const wss = new WebSocketServer({ server: httpServer, perMessageDeflate: true })

/** Each connection's own set of keys it's declared interest in via `hello` — see "Scoped subscriptions" in the sync-server plan. */
const interestSets = new Map<WebSocket, Set<SyncedKey>>()

/**
 * Whether each socket answered the last `ping` — the standard `ws` liveness
 * pattern. A kiosk that loses its network ungracefully (power blip, AP
 * hiccup, unplugged cable) doesn't always produce a clean TCP `close` event
 * on this end; without this, that socket (and its `interestSets` entry)
 * could linger indefinitely on a display that's meant to run for weeks.
 */
const socketAlive = new Map<WebSocket, boolean>()
const PING_INTERVAL_MS = 30_000

setInterval(() => {
  for (const socket of wss.clients) {
    if (socketAlive.get(socket) === false) {
      socket.terminate()
      continue
    }
    socketAlive.set(socket, false)
    socket.ping()
  }
}, PING_INTERVAL_MS)

function send(socket: WebSocket, message: ServerMessage) {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message))
}

function broadcastUpdate(key: SyncedKey, value: unknown) {
  // Called right after `store.set(key, value)` at every call site, so this is always that same
  // write's own freshly-incremented revision, not a stale read.
  const revision = store.get(key)?.revision ?? 0
  for (const [socket, keys] of interestSets) {
    if (keys.has(key)) send(socket, { type: 'update', key, value, revision })
  }
}

/** Surfaces a background/operational problem (e.g. the Neon bridge losing its connection) to every open admin tab, regardless of that connection's own interest set — see `ErrorMessage`/`ErrorToast`. */
function broadcastError(message: string, detail?: string) {
  for (const socket of interestSets.keys()) send(socket, { type: 'error', message, detail })
}

/**
 * `admin.orders` is inbound-only and gets *fully replaced* on every pull (a
 * full reconcile pass on every Neon reconnect, plus a debounced pull on
 * every `orders_changed` NOTIFY — see `neonBridge.ts`'s own module doc
 * comment), so naively decrementing stock whenever "an order is present"
 * would re-decrement the same order every time it's re-delivered. Diffing
 * against what was stored immediately before this exact write is what makes
 * this safe — called from `applyUpdate` below, the one place that "before"
 * value is still readable, right before it gets overwritten.
 *
 * A brand-new order (not cancelled on arrival) reserves stock for its items;
 * an existing order that's *newly* transitioned to `cancelled` restores
 * whatever was reserved for it — an order shouldn't permanently consume
 * inventory if it never actually happened. Only ever touches products with
 * `trackStock` on; a manual stock edit from the admin UI needs none of this,
 * it's already a normal authenticated write to `admin.products` that goes
 * through the generic WS `write` handler on its own.
 */
function reconcileStockForOrders(previousOrders: OrderRecord[], incomingOrders: OrderRecord[]) {
  const previousByID = new Map(previousOrders.map((order) => [order.id, order]))
  const products = (store.get('admin.products')?.value as Product[] | undefined) ?? []
  if (products.length === 0) return

  // itemID -> net quantity to subtract from stock (negative restores it).
  const deltas = new Map<string, number>()

  for (const order of incomingOrders) {
    const previous = previousByID.get(order.id)
    if (!previous) {
      if (order.status === 'cancelled') continue
      for (const item of order.items) deltas.set(item.itemID, (deltas.get(item.itemID) ?? 0) + item.quantity)
    } else if (previous.status !== 'cancelled' && order.status === 'cancelled') {
      for (const item of order.items) deltas.set(item.itemID, (deltas.get(item.itemID) ?? 0) - item.quantity)
    }
  }

  if (deltas.size === 0) return

  let changed = false
  const updatedProducts = products.map((product) => {
    const delta = deltas.get(product.itemID)
    if (!delta || !product.trackStock) return product
    changed = true
    return { ...product, stockQuantity: Math.max(0, (product.stockQuantity ?? 0) - delta) }
  })

  if (!changed) return
  applyUpdate('admin.products', updatedProducts)
  neonBridge.pushIfRelevant('admin.products', updatedProducts)
  console.log(`[stock] adjusted stock from order changes (${deltas.size} product(s))`)
}

/**
 * Diffs the previous `admin.displayUpdateState` against what's about to be
 * written and pushes the right message to every machine whose own entry is
 * newly present or newly restarted (a different `targetUpdateId`/
 * `targetVersionCode`/`startedAt` than before) — this is the one place
 * Display Manager's "Update to current" button (and the staged bulk-update
 * queue, both client-side) actually causes anything to happen on a device;
 * writing the synced key alone only makes the progress badge appear.
 *
 * Mechanism selection is keyed off which field the entry itself set —
 * `targetUpdateId` (OTA) always gets `check-update`, `targetVersionCode`
 * (APK) gets `install-update` *if* the machine's own `updateTier` (read
 * fresh from `admin.displayMachines` here, server-side, never trusted from
 * whatever the client wrote the entry with) actually supports it, else it
 * also falls back to `check-update` — a harmless no-op-ish signal, unlike
 * pushing `install-update` at a device with no `PackageInstallerModule`
 * capability at all. Tier 2/3 capability is a *superset* of Tier 1, not a
 * replacement for it: a device that's since been elevated past Tier 1 can
 * still receive a same-native-build, JS-only OTA update exactly the same
 * way a Tier 1 device does — an earlier version of this function decided
 * the mechanism from `updateTier` alone, which meant a Tier 2/3 device
 * could never receive `check-update` again even for a pure JS change,
 * forcing every future fix (however small) through a full native rebuild.
 * Only surfaced once a real Tier 2/3 device existed to hit it.
 */
function pushUpdateTriggersForNewEntries(previous: DisplayUpdateProgress[], incoming: DisplayUpdateProgress[]) {
  const previousByMachineID = new Map(previous.map((entry) => [entry.machineID, entry]))
  const machines = (store.get('admin.displayMachines')?.value as DisplayMachine[] | undefined) ?? []
  const machinesByID = new Map(machines.map((machine) => [machine.machineID, machine]))
  for (const entry of incoming) {
    const before = previousByMachineID.get(entry.machineID)
    const isNewRun =
      !before || before.targetUpdateId !== entry.targetUpdateId || before.targetVersionCode !== entry.targetVersionCode || before.startedAt !== entry.startedAt
    if (!isNewRun) continue
    const updateTier = machinesByID.get(entry.machineID)?.updateTier
    const message: DeviceServerMessage =
      entry.targetVersionCode !== undefined && (updateTier === 2 || updateTier === 3) ? { type: 'install-update', mechanism: 'apk' } : { type: 'check-update' }
    pushToDevice(entry.machineID, message)
  }
}

/** Default 10 minutes (Update Channel spec §3.4) — a pending update run older than this without its own device reporting the expected `updateId` back gets marked `update-failed`, surfaced in Display Manager. No automatic retry: a device that failed to update and then failed to come back needs a human, not a retry loop running unattended on a wall-mounted screen. */
const UPDATE_FAILURE_TIMEOUT_MS = 10 * 60 * 1000
const UPDATE_FAILURE_SWEEP_INTERVAL_MS = 60 * 1000

/** Runs once a minute — marks any `admin.displayUpdateState` entry that's been `downloading`/`installing`/`awaiting-heartbeat` for longer than `UPDATE_FAILURE_TIMEOUT_MS` as `update-failed`, in place (never removed — an admin needs to actually see the red status row, per spec §3.4). Started once at server startup, alongside this file's other sweeps. */
function startUpdateFailureSweep() {
  setInterval(() => {
    const pending = (store.get('admin.displayUpdateState')?.value as DisplayUpdateProgress[] | undefined) ?? []
    const now = Date.now()
    let changed = false
    const updated = pending.map((entry) => {
      if (entry.status === 'update-failed') return entry
      if (now - new Date(entry.startedAt).getTime() < UPDATE_FAILURE_TIMEOUT_MS) return entry
      changed = true
      return { ...entry, status: 'update-failed' as const }
    })
    if (changed) applyUpdate('admin.displayUpdateState', updated)
  }, UPDATE_FAILURE_SWEEP_INTERVAL_MS)
}

/**
 * Reduces one of this server's own upload URLs (stored absolute, baked to whichever origin the
 * uploader happened to reach the server on — see `handleUpload`'s own `http://${host}/uploads/...`)
 * to a path+query relative to that origin, so a client that reached the hub a different way (a
 * companion device's own `syncOrigin`, a kiosk on a different LAN IP) can prefix it correctly instead
 * of following the stale baked-in host — same problem `isOwnUploadUrl`/`normalizeUploadUrl`
 * (`src/lib/localServer.ts`) solve client-side, needed here because this one crosses to the
 * companion's native layer rather than another browser tab. `size` overrides any existing `?size=`
 * query (a stored `previewImages` URL has none — see `screenPreviewCapture.ts`'s own `uploadImage`
 * call — but this stays robust if that ever changes). Any non-`/uploads/` URL is returned unchanged.
 */
function toRelativeUploadUrl(url: string, size?: string): string {
  try {
    const parsed = new URL(url)
    if (!parsed.pathname.startsWith('/uploads/')) return url
    if (size) parsed.searchParams.set('size', size)
    return `${parsed.pathname}${parsed.search}`
  } catch {
    return url
  }
}

/**
 * Every screen a companion device is currently allowed to browse to (Remote
 * Screen Navigation spec) — every published screen, hub-decided (never
 * client-enumerated) so a café unit can never browse to another venue's
 * screen or an unpublished draft. A screen's own top-level `name`/`screenID`
 * only — never `.draft`, which isn't a separate browsable screen, just a
 * pending edit to an existing one.
 *
 * `previewImage` is that screen's own stage-1 `previewImages` entry (see `ScreenConfig`'s own doc
 * comment), reduced to a relative `?size=medium` path via `toRelativeUploadUrl` — what the companion's
 * remote-browse HUD shows as a still image instead of live-navigating the WebView per keypress (see
 * `RemoteNavPreview.tsx`/`previewCache.ts`). `null` for a screen that has never been saved/published
 * since screenshots shipped, or whose capture failed — the companion falls back to a plain dark
 * backdrop for those, same as `ScreenCard.tsx`'s own live-render fallback does on the admin side.
 */
function buildNavigableSet(): { screenId: string; name: string; previewImage: string | null }[] {
  const screens = (store.get('admin.screens')?.value as ScreenConfig[] | undefined) ?? []
  return screens.map((screen) => ({
    screenId: screen.screenID,
    name: screen.name,
    previewImage: screen.previewImages?.[0] ? toRelativeUploadUrl(screen.previewImages[0], 'medium') : null,
  }))
}

/**
 * A random published screen's own `screenID`, for a freshly-approved companion device's
 * initial `monitors[0].assignedScreenID` (see the `/display-machines/:id/approve` route) —
 * `null` if the store has no screens configured yet, the only case `WaitingForAssignmentScreen`
 * should still ever actually show for a newly-approved device. Reuses `admin.screens` the same
 * way `buildNavigableSet` does (see its own doc comment for why that list is already
 * published-only, no `.draft` filtering needed here either).
 */
function pickRandomScreenID(): string | null {
  const screens = (store.get('admin.screens')?.value as ScreenConfig[] | undefined) ?? []
  if (screens.length === 0) return null
  return screens[Math.floor(Math.random() * screens.length)].screenID
}

/**
 * `effectiveScreen = override ?? assignment`, resolved in exactly one
 * place, hub-side (Remote Screen Navigation spec §D9) — the display never
 * decides which of the two it's showing. A companion device always has
 * exactly one monitor (see `DEVICE_MONITOR_ID` in
 * `adhdisplay-companion/src/lib/pairing.ts`), so `monitors[0]` is always
 * the right one, no id-matching needed. `null` if neither an override nor
 * an assignment exists (shows the standby screensaver).
 */
function resolveEffectiveScreen(machineID: string): string | null {
  const overrides = (store.get('admin.displayScreenOverride')?.value as DisplayScreenOverride[] | undefined) ?? []
  const override = overrides.find((entry) => entry.machineID === machineID)
  if (override) return override.screenId
  const machines = (store.get('admin.displayMachines')?.value as DisplayMachine[] | undefined) ?? []
  return machines.find((machine) => machine.machineID === machineID)?.monitors[0]?.assignedScreenID ?? null
}

/** Pushes one machine's own current effective screen — called on `device-hello` (connect/reconnect) and from `applyUpdate`'s own `admin.displayMachines`/`admin.displayScreenOverride` branches below, whenever something that could actually change it did. */
function pushEffectiveScreen(machineID: string) {
  pushToDevice(machineID, { type: 'effective-screen', screenId: resolveEffectiveScreen(machineID) })
}

/** Validates/sanitizes one pane's own `customCss`/`customHtml` (against the *admin* posture — see `applyUpdate`'s own `admin.screens` branch for why) in place, returning a new slot only if something needed stripping, else the exact same object reference (so an unaffected pane never gets a needless new identity). */
function sanitizeIncomingSlotCustomContent(slot: ScreenSlot, screenID: string, paneId: PaneId): ScreenSlot {
  let next = slot
  if (slot.customCss !== undefined) {
    if (validatePaneCustomCss(slot.customCss, 'admin').length > 0) {
      console.warn(`[screens] stripped invalid customCss on screen ${screenID} pane ${paneId}`)
      next = { ...next, customCss: undefined, customCssPolicyVersion: undefined }
    } else if (slot.customCssPolicyVersion !== PANE_CUSTOM_CSS_POLICY_VERSION) {
      next = { ...next, customCssPolicyVersion: PANE_CUSTOM_CSS_POLICY_VERSION }
    }
  }
  if (slot.customHtml !== undefined) {
    if (validatePaneCustomHtml(slot.customHtml, 'admin').length > 0) {
      console.warn(`[screens] stripped invalid customHtml on screen ${screenID} pane ${paneId}`)
      next = { ...next, customHtml: undefined, customHtmlPolicyVersion: undefined }
    } else {
      // Re-sanitized (not just validated) so whatever's actually persisted is always the canonical
      // normalized form (forced `rel`, host-stripped own-upload `img.src` — see
      // `sanitizePaneCustomHtml`'s own doc comment) regardless of what a given write path sent,
      // rather than only ever trusting the client to have already done this itself.
      const sanitized = sanitizePaneCustomHtml(slot.customHtml, 'admin')
      if (sanitized !== next.customHtml || next.customHtmlPolicyVersion !== PANE_CUSTOM_HTML_POLICY_VERSION) {
        next = { ...next, customHtml: sanitized, customHtmlPolicyVersion: PANE_CUSTOM_HTML_POLICY_VERSION }
      }
    }
  }
  return next
}

function sanitizePaneSlotsRecord(paneSlots: Record<PaneId, ScreenSlot> | undefined, screenID: string): Record<PaneId, ScreenSlot> | undefined {
  if (!paneSlots) return paneSlots
  let changed = false
  const next: Record<PaneId, ScreenSlot> = {}
  for (const [paneId, slot] of Object.entries(paneSlots)) {
    const sanitized = sanitizeIncomingSlotCustomContent(slot, screenID, paneId)
    if (sanitized !== slot) changed = true
    next[paneId] = sanitized
  }
  return changed ? next : paneSlots
}

/** The real server-side gate for `ScreenSlot.customCss`/`customHtml` — see `applyUpdate`'s own `admin.screens` branch. Covers both a screen's live `paneSlots` and its own unpublished `draft.paneSlots` (a staged edit still eventually gets published, so it needs the same gate). */
function sanitizeIncomingScreensCustomContent(screens: ScreenConfig[]): ScreenConfig[] {
  let anyChanged = false
  const result = screens.map((screen) => {
    const sanitizedPaneSlots = sanitizePaneSlotsRecord(screen.paneSlots, screen.screenID)
    const sanitizedDraftPaneSlots = screen.draft ? sanitizePaneSlotsRecord(screen.draft.paneSlots, screen.screenID) : undefined
    if (sanitizedPaneSlots === screen.paneSlots && sanitizedDraftPaneSlots === screen.draft?.paneSlots) return screen
    anyChanged = true
    return {
      ...screen,
      paneSlots: sanitizedPaneSlots ?? screen.paneSlots,
      ...(screen.draft ? { draft: { ...screen.draft, paneSlots: sanitizedDraftPaneSlots } } : {}),
    }
  })
  return anyChanged ? result : screens
}

/**
 * Persists a synced-key write and broadcasts it to every interested LAN client — the one path both a
 * client's own WS `write` and the Neon bridge's own pulls go through, so neither has to duplicate the
 * other's plumbing.
 *
 * **Ordering invariant, load-bearing:** this function has three phases, and which one a side effect
 * belongs in is not a style choice.
 *
 * 1. *Pre-write* — anything that has to compare against the state this write is about to replace
 *    (`store.get(key)` still returns the old value here), or that rewrites `value` itself.
 * 2. *Write* — `store.set` + `broadcastUpdate`.
 * 3. *Post-write* — anything that **builds a push by reading the store back**
 *    (`buildNavigableSet`, `resolveEffectiveScreen`/`pushEffectiveScreen`). These used to sit above
 *    the `store.set` and therefore pushed every device a value computed from the *pre-write* state:
 *    a remote-nav commit persisted the new override correctly but immediately told the device to go
 *    back to the screen it was already on, an admin reassignment pushed the old assignment, Display
 *    Manager's "Return to assigned" pushed the very override it was clearing, and a screen
 *    rename/create pushed a `navigable-set` without it. Every diff those pushes need is computed in
 *    phase 1 into a local instead, so moving them down loses nothing.
 */
function applyUpdate(key: SyncedKey, value: unknown) {
  // --- Phase 1: pre-write (reads the outgoing state, or rewrites `value`) ---

  if (key === 'admin.orders') {
    reconcileStockForOrders((store.get('admin.orders')?.value as OrderRecord[] | undefined) ?? [], value as OrderRecord[])
  }
  if (key === 'admin.displayUpdateState') {
    pushUpdateTriggersForNewEntries((store.get('admin.displayUpdateState')?.value as DisplayUpdateProgress[] | undefined) ?? [], value as DisplayUpdateProgress[])
  }
  if (key === 'admin.products') {
    // Kept current on every write (both a real client edit and a Neon-bridge
    // pull go through this same path) rather than computed lazily on read —
    // see `Product.nameFolded`'s own doc comment.
    const recomputed = withRecomputedNameFolded(value as Product[])
    value = recomputed
    logProductNameFoldedCollisions(recomputed)
  }
  if (key === 'admin.screens') {
    // The real server-side gate for `customCss`/`customHtml` (see `src/utils/paneCustomContent.ts`)
    // — the live editors already validate client-side before allowing Save, but nothing enforces
    // those constants server-side otherwise, so a direct WS write bypassing the UI must still be
    // caught here. Always validated against the *admin* posture regardless of whether this write
    // actually originated from a human or from a confirmed assistant draft (the assistant's own,
    // narrower posture is already enforced earlier, in `screenPane.validate()`, before the admin ever
    // sees a draft to confirm — by the time any write reaches this generic path there's no reliable
    // way to tell the two apart, and admin-authored content must never be rejected by its own gate).
    // Never aborts the whole write over one bad field — strips just that field (matching this
    // module's own restore-time posture) and logs a warning, since dropping the *entire* incoming
    // `admin.screens` write here (as the `limited`-role section check above does) would also silently
    // discard every *other*, unrelated, perfectly valid edit bundled into the same write.
    value = sanitizeIncomingScreensCustomContent(value as ScreenConfig[])
  }

  // Machines whose effective screen this write changes, split by which of the two ways it changes —
  // both consumed in phase 3. Computed here because both diffs are against the *outgoing* store.
  const machinesToPush: string[] = []
  const machinesToClearOverrideFor: string[] = []

  if (key === 'admin.displayMachines') {
    // Only an *admin's own* assignment write ever actually changes monitors[0].assignedScreenID —
    // mergeDisplayMachineHeartbeat (the heartbeat route's own merge, called far more often)
    // deliberately preserves it unconditionally, so this diff naturally never fires on a plain
    // heartbeat write, no need to special-case which caller this is.
    const previous = (store.get('admin.displayMachines')?.value as DisplayMachine[] | undefined) ?? []
    const previousAssignmentByID = new Map(previous.map((machine) => [machine.machineID, machine.monitors[0]?.assignedScreenID ?? null]))
    const overrides = (store.get('admin.displayScreenOverride')?.value as DisplayScreenOverride[] | undefined) ?? []
    for (const machine of value as DisplayMachine[]) {
      if (machine.connectionType !== 'mobile') continue
      // A monitor-less entry is never a real assignment change — it's a malformed heartbeat (the
      // route's own body check only asserts `Array.isArray(monitors)`, so an empty array gets
      // through). Without this guard `monitors[0]?.assignedScreenID` reads as null, which is
      // indistinguishable from "the admin just cleared the assignment" and would silently wipe this
      // machine's standing remote-nav override below.
      if (machine.monitors.length === 0) continue
      const assignedScreenID = machine.monitors[0]?.assignedScreenID ?? null
      if (previousAssignmentByID.get(machine.machineID) === assignedScreenID) continue
      // Deliberate/explicit (this admin assignment write) beats local/older (a standing remote-nav
      // override) — spec §D1's writer precedence. Clearing the override is itself a synced-key
      // write, so it's deferred to phase 3 and batched into one; that recursive call's own
      // admin.displayScreenOverride branch pushes effective-screen for these machines, so they
      // deliberately don't also go into `machinesToPush`.
      if (overrides.some((entry) => entry.machineID === machine.machineID)) machinesToClearOverrideFor.push(machine.machineID)
      else machinesToPush.push(machine.machineID)
    }
  }
  if (key === 'admin.displayScreenOverride') {
    const previous = (store.get('admin.displayScreenOverride')?.value as DisplayScreenOverride[] | undefined) ?? []
    const previousByID = new Map(previous.map((entry) => [entry.machineID, entry.screenId]))
    const incoming = value as DisplayScreenOverride[]
    const incomingByID = new Map(incoming.map((entry) => [entry.machineID, entry.screenId]))
    for (const machineID of new Set([...previousByID.keys(), ...incomingByID.keys()])) {
      if (previousByID.get(machineID) !== incomingByID.get(machineID)) machinesToPush.push(machineID)
    }
  }

  // --- Phase 2: the write itself ---

  store.set(key, value)
  broadcastUpdate(key, value)

  // --- Phase 3: post-write pushes (every one of these reads the store back) ---

  if (key === 'admin.screens') {
    // Every connected device's own browsable set is affected, not just one — see
    // pushToAllDevices's own doc comment.
    pushToAllDevices({ type: 'navigable-set', screens: buildNavigableSet() })
  }
  for (const machineID of machinesToPush) pushEffectiveScreen(machineID)
  if (machinesToClearOverrideFor.length > 0) {
    const overrides = (store.get('admin.displayScreenOverride')?.value as DisplayScreenOverride[] | undefined) ?? []
    applyUpdate(
      'admin.displayScreenOverride',
      overrides.filter((entry) => !machinesToClearOverrideFor.includes(entry.machineID)),
    )
  }
}

wss.on('connection', (socket) => {
  interestSets.set(socket, new Set())
  socketAlive.set(socket, true)
  socket.on('pong', () => socketAlive.set(socket, true))
  console.log(`[ws] client connected (${wss.clients.size} total)`)

  socket.on('message', (raw) => {
    let message: ClientMessage | DeviceClientMessage
    try {
      message = JSON.parse(raw.toString())
    } catch {
      console.warn('[ws] dropped malformed message')
      return
    }

    // A companion device's own persistent connection (see server/deviceSocket.ts) — distinct from
    // every other message type below, which are all the admin-dashboard sync protocol. A socket is
    // either one or the other, never both, discriminated purely by which message it sends first.
    if (message.type === 'device-hello') {
      if (typeof message.machineID !== 'string') return
      registerDeviceSocket(message.machineID, socket)
      // Connect/reconnect always gets a fresh copy of both — a reconnect means whatever this
      // device had in memory (if anything survived) could be stale, and there's no cheaper way to
      // find out than just sending the current truth again.
      pushToDevice(message.machineID, { type: 'navigable-set', screens: buildNavigableSet() })
      pushEffectiveScreen(message.machineID)
      return
    }

    if (message.type === 'screen-override') {
      const machineID = getMachineIDForSocket(socket)
      if (!machineID || typeof message.screenId !== 'string') return
      const overrides = (store.get('admin.displayScreenOverride')?.value as DisplayScreenOverride[] | undefined) ?? []
      const withoutMine = overrides.filter((entry) => entry.machineID !== machineID)
      applyUpdate('admin.displayScreenOverride', [...withoutMine, { machineID, screenId: message.screenId, setAt: new Date().toISOString() }])
      return
    }

    if (message.type === 'hello') {
      const interest = interestSets.get(socket)
      if (!interest) return
      const newKeys = message.keys.filter(isSyncedKey)
      for (const key of newKeys) interest.add(key)
      send(socket, { type: 'snapshot', state: store.snapshot(newKeys) })
      return
    }

    if (message.type === 'write') {
      const { key, value, token } = message
      if (!isSyncedKey(key)) return

      const session = store.getSession(token)
      if (!session) {
        console.warn(`[ws] rejected write to ${key}: invalid token`)
        return
      }

      if (session.role === 'limited') {
        const section = SECTION_BY_KEY[key]
        if (section && !session.allowedSections?.includes(section)) {
          console.warn(`[ws] rejected write to ${key}: ${session.username} lacks section "${section}"`)
          return
        }
      }

      applyUpdate(key, value)
      neonBridge.pushIfRelevant(key, value)
      // Renaming the store should update a live mDNS advertisement
      // immediately, without needing to revisit Settings → Advanced.
      if (key === 'admin.storeSettings') {
        const screenAddressSettings = store.getScreenAddressSettings()
        if (screenAddressSettings.mode === 'mdns') mdns.apply(screenAddressSettings, (value as StoreSettings).name)
        // Always-on, unlike the opt-in hostname advertisement above — see reAdvertiseServerPresenceIfStoreNameChanged's
        // own doc comment for why this is gated on the *normalised* name actually changing, not every save.
        reAdvertiseServerPresenceIfStoreNameChanged()
      }
      // Flipping the Wolt/Foodora card's own ActivationToggle should try a
      // sync immediately, rather than waiting up to `POLL_INTERVAL_MS` for
      // the card's status dot to reflect the change.
      if (key === 'admin.woltConfig') woltPoller.restart()
      if (key === 'admin.foodoraConfig') foodoraPoller.restart()
      // Adding/removing a stop in Integrations should populate/clear its
      // departures promptly, rather than waiting up to `POLL_INTERVAL_MS`.
      if (key === 'admin.integrations') transitPoller.restart()
      console.log(`[ws] ${session.username} wrote ${key}`)
      return
    }
  })

  socket.on('close', () => {
    interestSets.delete(socket)
    socketAlive.delete(socket)
    unregisterDeviceSocket(socket)
    console.log(`[ws] client disconnected (${wss.clients.size} total)`)
  })

  socket.on('error', (error) => {
    console.error('[ws] socket error:', error)
  })
})

// Without these, an unhandled error (e.g. the port already being taken by a
// leftover process from a previous run) crashes the process silently under
// `tsx watch` — it stops listening entirely but the wrapper process stays
// alive and idle until the next file save triggers a restart, which looks
// exactly like a hung/unreachable server with no clue why. Logging loudly
// and exiting means `tsx watch` restarts it on the very next save instead,
// and the reason is visible in the terminal either way.
httpServer.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`[server] port ${PORT} is already in use — stop whatever else is using it, or set WS_PORT to a different port.`)
  } else {
    console.error('[server] failed to start:', error)
  }
  process.exit(1)
})

process.on('uncaughtException', (error) => {
  console.error('[server] uncaught exception:', error)
  process.exit(1)
})

process.on('unhandledRejection', (error) => {
  console.error('[server] unhandled rejection:', error)
  process.exit(1)
})

// A clean stop for `systemctl stop` (sends SIGTERM) and the installer/uninstaller
// scripts (see installer/adhdisplay.iss, installer/linux/uninstall.sh) to ask
// for instead of a hard `taskkill`/`pkill -9` — tears down every background
// subsystem started below before actually exiting.
let shuttingDown = false
function shutdown(signal: NodeJS.Signals) {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`[server] received ${signal}, shutting down...`)
  woltPoller.stop()
  foodoraPoller.stop()
  transitPoller.stop()
  neonBridge.stop()
  mdns.stop()
  wss.close()
  httpServer.close(() => process.exit(0))
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

backup.restoreFromSiblingBackupIfFresh()
store.load()
// Best-effort, never blocks server startup — see ensureOllamaRunning's own doc comment for why
// this doesn't need to be awaited here.
void ensureOllamaRunning()
neonBridge.start(applyUpdate, broadcastError)
woltPoller.start(applyUpdate)
foodoraPoller.start(applyUpdate)
transitPoller.start(applyUpdate)
startNewsImageCacheSweep()
startAbandonedVideoUploadSweep()
startUpdateFailureSweep()
updates.sweepUpdatesDirForBackup()
// After store.load() — snapshot capture reads store.get('admin.screens'), and this also registers
// the lazy-pinning hook against uploads.ts's own delete path (see screensSnapshots.ts's own doc
// comment on `startScreensSnapshotScheduler`).
screensSnapshots.startScreensSnapshotScheduler()
mdns.apply(store.getScreenAddressSettings(), currentStoreName())
// Always on, regardless of the opt-in hostname mode above — see
// advertiseServerPresence's own doc comment for why this needs to be a
// separate advertisement.
reAdvertiseServerPresenceIfStoreNameChanged()
httpServer.listen(PORT, () => {
  console.log(`[server] listening on http://0.0.0.0:${PORT}`)
})
