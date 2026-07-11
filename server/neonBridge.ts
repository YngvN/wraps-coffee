import { Client } from 'pg'
import type { ContactInfo } from '../src/types/contactInfo'
import type { ContactMessage } from '../src/types/message'
import type { MessageBoard, MessageBoardPost } from '../src/types/messageBoard'
import type { OrderRecord } from '../src/types/order'
import type { CategoryPrices, Product } from '../src/types/product'
import type { SyncedKey } from '../src/types/sync'
import type { EventRecord } from '../src/types/event'
import { isPostExpired } from '../src/utils/messageBoard'
import {
  pullCategoryPrices,
  pullContactInfo,
  pullEvents,
  pullMessages,
  pullOrders,
  pullProducts,
  pushCategoryPrices,
  pushContactInfo,
  pushEvents,
  pushMessageBoard,
  pushMessagesReadStatus,
  pushOrdersStatus,
  pushProducts,
} from './neonMappers'
import * as store from './store'

/**
 * Optional bridge to the public website's own Neon Postgres database (a
 * separate project — see the "Website integration" plan). Entirely
 * additive: with no connection string configured (see `store.getNeonDatabaseUrl`
 * — either the `NEON_DATABASE_URL` env var, or an override saved from
 * Settings → For developers), `start()` is a no-op and nothing else in this
 * app is affected, same graceful-degradation posture as every other optional
 * piece of the local server.
 *
 * Two directions:
 * - **Outbound** (`OUTBOUND_KEYS`): this repo owns the content — a client
 *   write to one of these keys gets pushed up as a full replace (see
 *   `pushIfRelevant`).
 * - **Inbound** (`INBOUND_KEYS`): the website owns *creation* — messages
 *   and orders originate from a customer's own submission there, so this
 *   bridge only ever pulls new rows down, and pushes back a single mutable
 *   field (`read`/`status`) by id, never inserting or deleting.
 *
 * Reuses Neon's own `pg_notify` triggers (already present in the website's
 * schema) via `LISTEN` for near-real-time pulls, plus a full reconciliation
 * pass on every connect/reconnect — `NOTIFY` is fire-and-forget, so anything
 * that fired while this bridge was disconnected would otherwise be lost.
 *
 * A third, deliberately different case: `MESSAGE_BOARD_KEYS`
 * (`admin.messageBoards`/`admin.messageBoardPosts`) are **push-only**, never
 * pulled. Neon's own `message_board` table only ever holds the *public*
 * subset (posts on a board with `publishToWebsite` on, expired ones
 * dropped) — a filtered, lossy mirror computed from both keys together, so
 * it must never be read back into the full local dataset. A write to
 * *either* key recomputes and re-pushes that whole mirror as a full replace.
 */

const INITIAL_RECONNECT_DELAY_MS = 500
const MAX_RECONNECT_DELAY_MS = 10_000
/** Coalesces a burst of `NOTIFY`s for the same key (e.g. a multi-row push firing the trigger once per row) into a single re-query. */
const NOTIFY_DEBOUNCE_MS = 300

const OUTBOUND_KEYS: SyncedKey[] = ['admin.products', 'admin.categoryPrices', 'admin.contactInfo', 'admin.events']
const INBOUND_KEYS: SyncedKey[] = ['admin.messages', 'admin.orders']
/** Push-only — see the module doc comment above. Excluded from `OUTBOUND_KEYS` since they don't follow that list's pull-or-seed reconciliation logic. */
const MESSAGE_BOARD_KEYS: SyncedKey[] = ['admin.messageBoards', 'admin.messageBoardPosts']

const CHANNEL_TO_KEY: Record<string, SyncedKey> = {
  products_changed: 'admin.products',
  category_prices_changed: 'admin.categoryPrices',
  contact_info_changed: 'admin.contactInfo',
  events_changed: 'admin.events',
  messages_changed: 'admin.messages',
  orders_changed: 'admin.orders',
}

type ApplyUpdate = (key: SyncedKey, value: unknown) => void
type ReportError = (message: string, detail?: string) => void

let client: Client | null = null
let reconnectDelay = INITIAL_RECONNECT_DELAY_MS
let applyUpdateRef: ApplyUpdate | null = null
let reportErrorRef: ReportError | null = null
const debounceTimers = new Map<SyncedKey, NodeJS.Timeout>()

function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Whether `value` is this key's own "nothing here yet" shape — used only to decide reconciliation direction (push local up vs. pull remote down), never to gate a normal apply. */
function isDefaultValue(key: SyncedKey, value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (key === 'admin.contactInfo') {
    const info = value as Partial<ContactInfo>
    return !info.phone && !info.email && !info.address
  }
  if (Array.isArray(value)) return value.length === 0
  return Object.keys(value as object).length === 0
}

async function pull(activeClient: Client, key: SyncedKey): Promise<unknown> {
  switch (key) {
    case 'admin.products':
      return pullProducts(activeClient)
    case 'admin.categoryPrices':
      return pullCategoryPrices(activeClient)
    case 'admin.contactInfo':
      return pullContactInfo(activeClient)
    case 'admin.events':
      return pullEvents(activeClient)
    case 'admin.messages':
      return pullMessages(activeClient)
    case 'admin.orders':
      return pullOrders(activeClient)
    default:
      throw new Error(`neonBridge: no pull mapping for ${key}`)
  }
}

async function push(activeClient: Client, key: SyncedKey, value: unknown): Promise<void> {
  switch (key) {
    case 'admin.products':
      return pushProducts(activeClient, value as Product[])
    case 'admin.categoryPrices':
      return pushCategoryPrices(activeClient, value as CategoryPrices)
    case 'admin.contactInfo':
      return pushContactInfo(activeClient, value as ContactInfo)
    case 'admin.events':
      return pushEvents(activeClient, value as EventRecord[])
    case 'admin.messages':
      return pushMessagesReadStatus(activeClient, value as ContactMessage[])
    case 'admin.orders':
      return pushOrdersStatus(activeClient, value as OrderRecord[])
    default:
      return
  }
}

async function pullAndApply(activeClient: Client, key: SyncedKey) {
  const value = await pull(activeClient, key)
  applyUpdateRef?.(key, value)
}

/** The current public subset of message-board posts — every non-expired post whose own board has `publishToWebsite` on. Computed fresh from the store on every call, since either `admin.messageBoards` or `admin.messageBoardPosts` changing can affect it. */
function computePublicMessageBoardPosts(): MessageBoardPost[] {
  const boards = (store.get('admin.messageBoards')?.value as MessageBoard[] | undefined) ?? []
  const posts = (store.get('admin.messageBoardPosts')?.value as MessageBoardPost[] | undefined) ?? []
  const publicBoardIds = new Set(boards.filter((board) => board.publishToWebsite).map((board) => board.id))
  return posts.filter((post) => publicBoardIds.has(post.boardId) && !isPostExpired(post))
}

/** Full-replace push of the computed public subset — the only way `message_board` on Neon is ever written. */
async function pushPublicMessageBoardPosts(activeClient: Client): Promise<void> {
  await pushMessageBoard(activeClient, computePublicMessageBoardPosts())
}

/** Runs once per fresh connection: for outbound keys, seeds Neon from local data if Neon's own table is still empty (first-sync safety, same spirit as the LAN sync's own `seeded` flag), else pulls Neon's value down; for inbound keys, always pulls down. */
async function reconcile(activeClient: Client) {
  for (const key of OUTBOUND_KEYS) {
    try {
      const remote = await pull(activeClient, key)
      const local = store.get(key)?.value
      if (isDefaultValue(key, remote) && !isDefaultValue(key, local)) {
        await push(activeClient, key, local)
        console.log(`[neon] seeded ${key} up to the website (was empty there)`)
      } else if (!isDefaultValue(key, remote)) {
        applyUpdateRef?.(key, remote)
      }
    } catch (error) {
      console.error(`[neon] reconciliation failed for ${key}:`, error)
      reportErrorRef?.(`Failed to sync ${key} with the website`, errorDetail(error))
    }
  }

  for (const key of INBOUND_KEYS) {
    try {
      await pullAndApply(activeClient, key)
    } catch (error) {
      console.error(`[neon] reconciliation failed for ${key}:`, error)
      reportErrorRef?.(`Failed to sync ${key} with the website`, errorDetail(error))
    }
  }

  // Push-only: unconditionally re-pushes the computed public subset, never pulls (see the module doc comment).
  try {
    await pushPublicMessageBoardPosts(activeClient)
  } catch (error) {
    console.error('[neon] reconciliation failed for the message board:', error)
    reportErrorRef?.('Failed to sync the message board with the website', errorDetail(error))
  }
}

function scheduleReconnect() {
  setTimeout(() => void connect(), reconnectDelay)
  reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY_MS)
}

async function connect() {
  const connectionString = store.getNeonDatabaseUrl()
  if (!connectionString) return

  const newClient = new Client({ connectionString })

  try {
    await newClient.connect()
  } catch (error) {
    console.error('[neon] connection failed, retrying:', error)
    reportErrorRef?.('Lost connection to the website database', errorDetail(error))
    scheduleReconnect()
    return
  }

  client = newClient
  reconnectDelay = INITIAL_RECONNECT_DELAY_MS
  console.log('[neon] connected')

  newClient.on('notification', (message) => {
    const key = message.channel ? CHANNEL_TO_KEY[message.channel] : undefined
    if (!key) return
    const existing = debounceTimers.get(key)
    if (existing) clearTimeout(existing)
    debounceTimers.set(
      key,
      setTimeout(() => {
        debounceTimers.delete(key)
        pullAndApply(newClient, key).catch((error: unknown) => {
          console.error(`[neon] failed to pull ${key} after notify:`, error)
          reportErrorRef?.(`Failed to sync ${key} from the website`, errorDetail(error))
        })
      }, NOTIFY_DEBOUNCE_MS),
    )
  })

  newClient.on('error', (error) => {
    console.error('[neon] connection error:', error)
    reportErrorRef?.('Lost connection to the website database', errorDetail(error))
    if (client === newClient) client = null
    scheduleReconnect()
  })

  newClient.on('end', () => {
    if (client !== newClient) return
    client = null
    scheduleReconnect()
  })

  try {
    for (const channel of Object.keys(CHANNEL_TO_KEY)) {
      await newClient.query(`LISTEN ${channel}`)
    }
    await reconcile(newClient)
  } catch (error) {
    console.error('[neon] setup failed:', error)
    reportErrorRef?.('Failed to sync with the website database', errorDetail(error))
  }
}

/** Starts the bridge (a no-op if no connection string is configured, via either the env var or Settings → For developers). Call once at server boot, after `store.load()`. */
export function start(applyUpdate: ApplyUpdate, reportError: ReportError) {
  applyUpdateRef = applyUpdate
  reportErrorRef = reportError

  if (!store.getNeonDatabaseUrl()) {
    console.log('[neon] no Neon database URL configured — website sync is disabled')
    return
  }

  void connect()
}

/** Disconnects (if connected) and reconnects using whatever `store.getNeonDatabaseUrl()` returns right now — called after an admin edits or clears it from Settings, so the change takes effect immediately without a server restart. If the new value is unset, `connect()` itself just no-ops, leaving the bridge disconnected. */
export function restart() {
  reconnectDelay = INITIAL_RECONNECT_DELAY_MS
  for (const timer of debounceTimers.values()) clearTimeout(timer)
  debounceTimers.clear()

  if (client) {
    const oldClient = client
    client = null
    oldClient.end().catch(() => {})
  }

  void connect()
}

/** Pushes a client-originated write up to Neon if the bridge is connected and owns this key outbound. Silently no-ops otherwise (including while disconnected — the connection-loss itself already reported once, repeating "failed to push" on every subsequent edit would just be noise). */
export function pushIfRelevant(key: SyncedKey, value: unknown) {
  if (!client) return
  const activeClient = client

  if (MESSAGE_BOARD_KEYS.includes(key)) {
    pushPublicMessageBoardPosts(activeClient).catch((error: unknown) => {
      console.error('[neon] push failed for the message board:', error)
      reportErrorRef?.('Failed to push the message board to the website', errorDetail(error))
    })
    return
  }

  if (!OUTBOUND_KEYS.includes(key) && !INBOUND_KEYS.includes(key)) return

  push(activeClient, key, value).catch((error: unknown) => {
    console.error(`[neon] push failed for ${key}:`, error)
    reportErrorRef?.(`Failed to push ${key} to the website`, errorDetail(error))
  })
}
