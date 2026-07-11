import { createServer } from 'node:http'
import { WebSocketServer, type WebSocket } from 'ws'
import { SYNCED_KEYS, type ClientMessage, type DashboardSection, type ServerMessage, type SyncedKey } from '../src/types/sync'
import { handleDepartures, handleLookup, handleWeather } from './extensions'
import { bearerToken, CORS_HEADERS, readJsonBody, sendJson } from './http'
import * as neonBridge from './neonBridge'
import * as store from './store'
import { handleDeleteUpload, handleServeUpload, handleUpload, listUploads } from './uploads'

const PORT = Number(process.env.WS_PORT ?? 4000)

/** Maps each synced key to the dashboard section that edits it, for the `limited`-role write check below. Keys with no admin-editable section (kiosk-only config) aren't section-gated at all — any authenticated write is enough. */
const SECTION_BY_KEY: Partial<Record<SyncedKey, DashboardSection>> = {
  'admin.messages': 'messages',
  'admin.products': 'products',
  'admin.categoryPrices': 'products',
  'admin.events': 'events',
  'admin.contactInfo': 'contact',
  'admin.screens': 'screens',
  'admin.textSizePresets': 'screens',
  'admin.screenLockPin': 'screens',
  'admin.screensaverSchedule': 'screens',
  'admin.extensions': 'extensions',
  'admin.orders': 'orders',
  'admin.messageBoards': 'messageboard',
  'admin.messageBoardPosts': 'messageboard',
}

function isSyncedKey(value: unknown): value is SyncedKey {
  return typeof value === 'string' && (SYNCED_KEYS as readonly string[]).includes(value)
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

  // Image uploads. Reads are public (the kiosk display isn't a logged-in
  // session but still needs to load images); writes (POST/DELETE) and the
  // list endpoint require a valid session, same as a synced-key `write`.
  if (url.pathname === '/uploads' || url.pathname.startsWith('/uploads/')) {
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

  // Extensions (Ruter transit + Yr weather proxies). Public, no auth — these
  // are read-only proxies of public data, and the kiosk display that renders
  // them is never a logged-in session either.
  if (req.method === 'GET' && url.pathname === '/extensions/lookup') {
    void handleLookup(res, url.searchParams.get('address') ?? '')
    return
  }

  if (req.method === 'GET' && url.pathname === '/extensions/departures') {
    const stopId = url.searchParams.get('stopId')
    const count = Number(url.searchParams.get('count') ?? '5')
    if (!stopId) {
      sendJson(res, 400, { error: 'Missing stopId' })
      return
    }
    void handleDepartures(res, stopId, count)
    return
  }

  if (req.method === 'GET' && url.pathname === '/extensions/weather') {
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

  sendJson(res, 404, { error: 'Not found' })
})

const wss = new WebSocketServer({ server: httpServer, perMessageDeflate: true })

/** Each connection's own set of keys it's declared interest in via `hello` — see "Scoped subscriptions" in the sync-server plan. */
const interestSets = new Map<WebSocket, Set<SyncedKey>>()

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

/** Persists a synced-key write and broadcasts it to every interested LAN client — the one path both a client's own WS `write` and the Neon bridge's own pulls go through, so neither has to duplicate the other's plumbing. */
function applyUpdate(key: SyncedKey, value: unknown) {
  store.set(key, value)
  broadcastUpdate(key, value)
}

wss.on('connection', (socket) => {
  interestSets.set(socket, new Set())
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
      console.log(`[ws] ${session.username} wrote ${key}`)
      return
    }
  })

  socket.on('close', () => {
    interestSets.delete(socket)
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

store.load()
neonBridge.start(applyUpdate, broadcastError)
httpServer.listen(PORT, () => {
  console.log(`[server] listening on http://0.0.0.0:${PORT}`)
})
