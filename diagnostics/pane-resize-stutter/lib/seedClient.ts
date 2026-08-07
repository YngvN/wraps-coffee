import { copyFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import WebSocket from 'ws'
import type { SnapshotMessage, SyncedKey } from '../../../src/types/sync'

/** A stable id prefix every diagnostic-seeded record uses (screens, products, catalogues alike) — lets both the merge-write logic and `--remove` tell a diagnostic record apart from a real one purely by id, regardless of which synced key it's in. See the plan's verified "admin.screens write is a wholesale overwrite, not a merge" fix. */
export const DIAG_ID_PREFIX = 'diag-pane-resize-'

export function isDiagId(id: string): boolean {
  return id.startsWith(DIAG_ID_PREFIX)
}

export interface SeedServerConfig {
  host?: string
  wsPort?: number
  contentPort?: number
}

const DEFAULT_HOST = 'localhost'
const DEFAULT_WS_PORT = 4000
const DEFAULT_CONTENT_PORT = 4173

export function resolveServerUrls(config: SeedServerConfig = {}) {
  const host = config.host ?? DEFAULT_HOST
  const wsPort = config.wsPort ?? DEFAULT_WS_PORT
  const contentPort = config.contentPort ?? DEFAULT_CONTENT_PORT
  return { host, wsPort, contentPort, wsUrl: `ws://${host}:${wsPort}`, loginUrl: `http://${host}:${wsPort}/login`, contentUrl: `http://${host}:${contentPort}` }
}

/** POSTs to the real `/login` route (`server/index.ts`) — same credential check every admin dashboard sign-in goes through. Throws on a non-2xx response. */
export async function login(username: string, password: string, config: SeedServerConfig = {}): Promise<{ token: string }> {
  const { loginUrl } = resolveServerUrls(config)
  const res = await fetch(loginUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) })
  if (!res.ok) throw new Error(`login failed (${res.status}): ${await res.text()}`)
  const body = (await res.json()) as { token: string }
  return { token: body.token }
}

export interface SyncSession {
  /** The current value for each requested key, as of the connection's own initial snapshot — `undefined` for a key with nothing stored yet. */
  snapshot: Partial<Record<SyncedKey, unknown>>
  /** Sends a `write` for `key` with the FULL value — never a partial array. Callers must read `snapshot[key]`, merge their change into a copy of that full value, and pass the merged result here. There is no server-side merge (`server/store.ts`'s `set()` is a wholesale overwrite), so sending anything less than the complete value would silently drop every other record. */
  write: (key: SyncedKey, value: unknown) => void
  close: () => void
}

/** Opens the same `hello`/`snapshot`/`write` WS protocol the real admin dashboard client uses (`server/index.ts`'s `wss.on('connection', ...)`). */
export async function openSyncSession(token: string, keys: SyncedKey[], config: SeedServerConfig = {}): Promise<SyncSession> {
  const { wsUrl } = resolveServerUrls(config)
  const ws = new WebSocket(wsUrl)

  const snapshot = await new Promise<Partial<Record<SyncedKey, unknown>>>((resolve, reject) => {
    const onError = (error: Error) => reject(error)
    ws.once('error', onError)
    ws.once('open', () => ws.send(JSON.stringify({ type: 'hello', keys })))
    ws.on('message', (raw) => {
      const message = JSON.parse(raw.toString()) as SnapshotMessage | { type: string }
      if (message.type !== 'snapshot') return
      ws.off('error', onError)
      const state = (message as SnapshotMessage).state
      const values: Partial<Record<SyncedKey, unknown>> = {}
      for (const key of keys) values[key] = state[key]?.value
      resolve(values)
    })
  })

  return {
    snapshot,
    write: (key, value) => ws.send(JSON.stringify({ type: 'write', key, value, token })),
    close: () => ws.close(),
  }
}

/**
 * Copies `server/data/<key>.json` to a timestamped `.diagbak` sibling before this run's first write
 * to that key — cheap insurance for a script whose entire purpose is throwaway (see the plan's
 * verified clobber-risk fix). A no-op (returns `undefined`) on a fresh install with no such file yet.
 */
export function backupSyncedKeyFile(repoRoot: string, key: SyncedKey): string | undefined {
  const fileName = `${key.replace(/\./g, '-')}.json`
  const source = join(repoRoot, 'server', 'data', fileName)
  if (!existsSync(source)) return undefined
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = join(repoRoot, 'server', 'data', `${fileName}.${stamp}.diagbak`)
  copyFileSync(source, backupPath)
  return backupPath
}
