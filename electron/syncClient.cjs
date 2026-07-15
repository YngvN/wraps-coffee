// CommonJS on purpose, same reason as electron/main.cjs.
const WebSocket = require('ws')

const INITIAL_RECONNECT_DELAY_MS = 1000
const MAX_RECONNECT_DELAY_MS = 30000

/**
 * A Node-side client of the existing sync protocol (`src/types/sync.ts`),
 * used so the main process can react to `admin.displayMachines` changes
 * without a hidden renderer/browser tab relaying messages back to it. Only
 * ever subscribes (a `hello` declaring interest) — it never sends a
 * `write`, so no auth token is needed (only `write` requires one server-side,
 * see `server/index.ts`). Has its own reconnect/backoff loop, conceptually
 * mirroring `src/lib/syncClient.ts`'s shape — can't literally share that
 * module, which is bound to the browser's own `WebSocket`/`sessionStorage`.
 */
function connectDisplayMachinesSync(wsUrl, onUpdate) {
  let socket = null
  let reconnectDelay = INITIAL_RECONNECT_DELAY_MS
  let reconnectTimer = null
  let closed = false

  function connect() {
    if (closed) return
    socket = new WebSocket(wsUrl)

    socket.on('open', () => {
      reconnectDelay = INITIAL_RECONNECT_DELAY_MS
      socket.send(JSON.stringify({ type: 'hello', keys: ['admin.displayMachines'] }))
    })

    socket.on('message', (raw) => {
      let message
      try {
        message = JSON.parse(raw.toString())
      } catch {
        return
      }
      if (message.type === 'snapshot') {
        const entry = message.state && message.state['admin.displayMachines']
        if (entry) onUpdate(entry.value ?? [])
      } else if (message.type === 'update' && message.key === 'admin.displayMachines') {
        onUpdate(message.value ?? [])
      }
    })

    socket.on('close', scheduleReconnect)
    socket.on('error', () => socket.close())
  }

  function scheduleReconnect() {
    if (closed) return
    reconnectTimer = setTimeout(connect, reconnectDelay)
    reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY_MS)
  }

  connect()

  return {
    close() {
      closed = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      socket?.close()
    },
  }
}

module.exports = { connectDisplayMachinesSync }
