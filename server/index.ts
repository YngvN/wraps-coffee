import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { networkInterfaces } from 'node:os'
import { WebSocketServer, type WebSocket } from 'ws'
import type { DisplayMachine, DisplayMonitor } from '../src/types/displayMachine'
import type { OrderRecord, OrderStatus } from '../src/types/order'
import type { Product } from '../src/types/product'
import type { ScreenAddressSettings } from '../src/types/screenAddress'
import type { WindowLaunchSettings } from '../src/types/windowLaunch'
import type { StoreSettings } from '../src/types/storeSettings'
import { SYNCED_KEYS, type AdminRole, type ClientMessage, type DashboardSection, type ServerMessage, type SyncedKey } from '../src/types/sync'
import * as assistantSteps from './assistant/steps'
import type { LookupQueryFilterInput } from './assistant/lookupQuery'
import { deleteOllamaModel, ensureOllamaRunning, listOllamaModels, pullOllamaModel, testOllamaConnection } from './assistant/ollamaClient'
import { AssistantLocalProviderError, AssistantNotConfiguredError, type AssistantActionName } from './assistant/types'
import * as backup from './backup'
import { handleDepartures, handleLookup, handleStopSearch, handleWeather } from './integrations'
import { handleHeadlines } from './news'
import { handleNewsImage, startNewsImageCacheSweep } from './newsImageCache'
import { bearerToken, CORS_HEADERS, readJsonBody, sendJson } from './http'
import * as mdns from './mdns'
import * as neonBridge from './neonBridge'
import * as store from './store'
import * as storageCleanup from './storageCleanup'
import { handleDeleteUpload, handleRenameUpload, handleServeUpload, handleStorageUsage, handleUpload, listUploads } from './uploads'
import { handleVideoRetry, handleVideoUpload, startAbandonedVideoUploadSweep } from './videoUploads'
import * as foodoraAdapter from './foodoraAdapter'
import * as foodoraPoller from './foodoraPoller'
import * as woltAdapter from './woltAdapter'
import * as woltPoller from './woltPoller'

const PORT = Number(process.env.WS_PORT ?? 4000)

/** The app's own version, read once at startup from the repo root `package.json` — the single source of truth also mirrored in `installer/wraps-coffee.iss`'s `AppVersion`. Surfaced via `GET /server-info` for the Settings → About card. */
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

/** The store's own configured name (see `admin.storeSettings`, a regular synced key), or `""` if it hasn't been set yet — used to derive the mDNS name a screen's link advertises (see `mdns.apply`). */
function currentStoreName(): string {
  return (store.get('admin.storeSettings')?.value as StoreSettings | undefined)?.name ?? ''
}

/**
 * Upserts one machine's heartbeat into the stored `admin.displayMachines`
 * array, preserving each existing monitor's own `assignedScreenID` (matched
 * by monitor `id`) and the machine's own admin-set `customLabel` (see
 * `DisplayMachine`'s own doc comment) rather than wiping admin-made
 * assignments/renames on every heartbeat. Deliberately synchronous
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
  heartbeat: { machineID: string; label: string; connectionType: DisplayMachine['connectionType']; monitors: { id: string; label: string }[] },
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
    connectionType: heartbeat.connectionType,
    monitors,
    lastSeenAt: new Date().toISOString(),
  }
  return existing ? current.map((machine) => (machine.machineID === heartbeat.machineID ? updated : machine)) : [...current, updated]
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
  // Settings → About).
  if (req.method === 'GET' && url.pathname === '/server-info') {
    sendJson(res, 200, { lanIp: getLanIp(), version: APP_VERSION })
    return
  }

  // Public, no auth — a machine (or a plain browser tab, see /display-connect)
  // self-reporting its own presence/monitors, same LAN-trust posture as
  // /server-info and GET /screen-address above. Actually *assigning* a Screen
  // to a monitor is a deliberate admin edit and goes through the normal
  // authenticated synced-key write path instead (see admin.displayMachines
  // in SECTION_BY_KEY) — never through this route.
  if (req.method === 'POST' && url.pathname === '/display-machines/heartbeat') {
    readJsonBody(req)
      .then((body) => {
        const { machineID, label, connectionType, monitors } = body as {
          machineID?: string
          label?: string
          connectionType?: string
          monitors?: { id?: string; label?: string }[]
        }
        if (!machineID || !label || (connectionType !== 'electron' && connectionType !== 'url') || !Array.isArray(monitors)) {
          sendJson(res, 400, { error: 'Malformed heartbeat body' })
          return
        }
        const cleanMonitors = monitors
          .filter((monitor): monitor is { id: string; label: string } => typeof monitor.id === 'string' && typeof monitor.label === 'string')
        const current = (store.get('admin.displayMachines')?.value as DisplayMachine[] | undefined) ?? []
        const merged = mergeDisplayMachineHeartbeat(current, { machineID, label, connectionType, monitors: cleanMonitors })
        applyUpdate('admin.displayMachines', merged)
        sendJson(res, 200, { ok: true })
      })
      .catch(() => sendJson(res, 400, { error: 'Malformed request body' }))
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
      handleServeUpload(res, filename, url.searchParams.get('size'))
      return
    }

    const session = store.getSession(bearerToken(req) ?? '')
    if (!session) {
      sendJson(res, 401, { error: 'Authentication required' })
      return
    }

    if (req.method === 'POST' && !filename) {
      void handleUpload(req, res, host)
      return
    }

    if (req.method === 'DELETE' && filename) {
      handleDeleteUpload(res, filename)
      return
    }

    if (req.method === 'GET' && !filename) {
      sendJson(res, 200, listUploads(host))
      return
    }
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
    void handleNewsImage(res, url.searchParams.get('src'))
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
    sendJson(res, 200, { hasKey: Boolean(store.getAnthropicApiKey()), provider: store.getAssistantProvider(), model: store.getAssistantModel() })
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
        const { apiKey, provider, model } = body as { apiKey?: string | null; provider?: 'local' | 'claude'; model?: store.AssistantModel }
        if (apiKey !== undefined) store.setAnthropicApiKey(typeof apiKey === 'string' && apiKey.trim() ? apiKey.trim() : null)
        if (provider === 'local' || provider === 'claude') store.setAssistantProvider(provider)
        if (isAssistantModel(model)) store.setAssistantModel(model)
        console.log(`[assistant] ${session.username} updated the assistant configuration`)
        sendJson(res, 200, { hasKey: Boolean(store.getAnthropicApiKey()), provider: store.getAssistantProvider(), model: store.getAssistantModel() })
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
        const { entity, itemID, message, uiLanguage, historyContext, model, provider, localModel, label, conversationId, turnVersion } = body as {
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
        const { entity, action, itemID, message, uiLanguage, priorDraft, image, resolvedFields, model, history, historyContext, provider, localModel, localVisionModel, posture, conversationId, turnVersion } = body as {
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
  // Settings → Advanced) — read by installer/start-wraps-coffee.bat's own
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
      'Content-Disposition': `attachment; filename="wrapscoffee-backup-${new Date().toISOString().slice(0, 10)}.zip"`,
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
    console.log(`[backup] ${session.username} restored from the sibling WrapsCoffeeBackup folder`)
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
  for (const [socket, keys] of interestSets) {
    if (keys.has(key)) send(socket, { type: 'update', key, value })
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

/** Persists a synced-key write and broadcasts it to every interested LAN client — the one path both a client's own WS `write` and the Neon bridge's own pulls go through, so neither has to duplicate the other's plumbing. */
function applyUpdate(key: SyncedKey, value: unknown) {
  if (key === 'admin.orders') {
    reconcileStockForOrders((store.get('admin.orders')?.value as OrderRecord[] | undefined) ?? [], value as OrderRecord[])
  }
  store.set(key, value)
  broadcastUpdate(key, value)
}

wss.on('connection', (socket) => {
  interestSets.set(socket, new Set())
  socketAlive.set(socket, true)
  socket.on('pong', () => socketAlive.set(socket, true))
  console.log(`[ws] client connected (${wss.clients.size} total)`)

  socket.on('message', (raw) => {
    let message: ClientMessage
    try {
      message = JSON.parse(raw.toString())
    } catch {
      console.warn('[ws] dropped malformed message')
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
      }
      // Flipping the Wolt/Foodora card's own ActivationToggle should try a
      // sync immediately, rather than waiting up to `POLL_INTERVAL_MS` for
      // the card's status dot to reflect the change.
      if (key === 'admin.woltConfig') woltPoller.restart()
      if (key === 'admin.foodoraConfig') foodoraPoller.restart()
      console.log(`[ws] ${session.username} wrote ${key}`)
      return
    }
  })

  socket.on('close', () => {
    interestSets.delete(socket)
    socketAlive.delete(socket)
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
// scripts (see installer/wraps-coffee.iss, installer/linux/uninstall.sh) to ask
// for instead of a hard `taskkill`/`pkill -9` — tears down every background
// subsystem started below before actually exiting.
let shuttingDown = false
function shutdown(signal: NodeJS.Signals) {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`[server] received ${signal}, shutting down...`)
  woltPoller.stop()
  foodoraPoller.stop()
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
startNewsImageCacheSweep()
startAbandonedVideoUploadSweep()
mdns.apply(store.getScreenAddressSettings(), currentStoreName())
// Always on, regardless of the opt-in hostname mode above — see
// advertiseServerPresence's own doc comment for why this needs to be a
// separate advertisement. 4173 matches vite preview's own default port
// (see installer/start-wraps-coffee.bat and package.json's "preview" script).
mdns.advertiseServerPresence(PORT, 4173)
httpServer.listen(PORT, () => {
  console.log(`[server] listening on http://0.0.0.0:${PORT}`)
})
