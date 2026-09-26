import { Client } from 'pg'
import type { ContactInfo } from '../src/types/contactInfo'
import type { ContactMessage } from '../src/types/message'
import type { MessageBoard, MessageBoardPost } from '../src/types/messageBoard'
import type { OrderRecord } from '../src/types/order'
import type { CategoryPrices, Product } from '../src/types/product'
import type { Catalogue } from '../src/types/category'
import type { SyncedKey } from '../src/types/sync'
import type { EventRecord } from '../src/types/event'
import { isPostExpired } from '../src/utils/messageBoard'
import { isCafeOpenAt } from '../src/utils/openingHours'
import { toWebsiteThemeProjection } from '../src/utils/websiteTheme'
import type { AppearanceSettings } from '../src/types/appearanceTheme'
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
  pushSiteTheme,
} from './neonMappers'
import * as store from './store'
import { purgeForKeys } from './websiteCache'

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
 * **`LISTEN` while the cafe is open; nothing at all while it is closed.**
 * The website's `notify_row_changed()` trigger already fires
 * `pg_notify('<table>_changed', …)` on every write, so a new order reaches the
 * cafe in milliseconds (`CHANNEL_TO_KEY`).
 *
 * This deliberately reverses an earlier decision, and it is worth recording
 * why. That version polled on a short-lived connection every
 * `pollIntervalSeconds`, on the reasoning that an open connection would keep
 * the website's serverless database awake around the clock. The measurement
 * that settled it: the default interval was **300s** and that database's own
 * idle-suspend window is **~300s**, so every cycle re-armed the suspend timer
 * moments before it expired. The database never banked any suspended time
 * anyway — polling was paying the full cost of an open connection while still
 * delivering orders up to five minutes late. Holding the connection openly
 * costs the same and delivers immediately.
 *
 * The saving that actually exists is the *closed* hours, and that is what
 * `pollOnlyDuringOpeningHours` buys: overnight nothing is connected, and the
 * database suspends properly. Shortening any interval has never helped.
 *
 * Two consequences worth keeping in mind:
 * - Notification delivery is best-effort. Anything raised while the socket is
 *   down is gone, so `SAFETY_NET_PULL_MS` pulls anyway on a slow timer, and
 *   every fresh connection starts with a full `reconcile`.
 * - Outbound pushes are still their own short-lived connections
 *   (`pushIfRelevant` → `flushPendingPushes`), because they must work whether
 *   or not the cafe is open.
 *
 * A third, deliberately different case: `MESSAGE_BOARD_KEYS`
 * (`admin.messageBoards`/`admin.messageBoardPosts`) are **push-only**, never
 * pulled. Neon's own `message_board` table only ever holds the *public*
 * subset (posts on a board with `publishToWebsite` on, expired ones
 * dropped) — a filtered, lossy mirror computed from both keys together, so
 * it must never be read back into the full local dataset. A write to
 * *either* key recomputes and re-pushes that whole mirror as a full replace.
 * `THEME_KEYS` and `CATALOGUE_ORDER_KEYS` are push-only for their own
 * reasons — see each one's own comment.
 */

/**
 * Names every connection this bridge opens in the website database's own
 * `pg_stat_activity`.
 *
 * Without it each connection is anonymous, and working out which client is
 * holding that database's compute awake — the website's functions, someone's
 * `netlify dev`, or this bridge — takes table-level guesswork. Since the
 * database bills for the time its compute is *running*, that question is
 * worth a constant.
 */
const APPLICATION_NAME = 'adhdisplay-bridge'

/**
 * Coalesces a burst of local edits into a single push connection.
 *
 * Every flush opens its own connection, and each connection re-arms the
 * website database's idle-suspend timer — so a staff member nudging theme
 * colours for a minute used to cost far more database compute than the edits
 * themselves warranted (47 separate `site_theme` writes in one four-day
 * sample). A few seconds of coalescing collapses that into a handful.
 *
 * Outbound pushes are still "immediate" in the only sense that matters: the
 * website caches these values for an hour and is purged on every flush, so a
 * few seconds is invisible there.
 */
const PUSH_DEBOUNCE_MS = 5_000

/**
 * Notification channels this bridge listens on, mapped to the key each one
 * means.
 *
 * The channel names come from the website's own `notify_row_changed()`
 * trigger, which fires `pg_notify(TG_TABLE_NAME || '_changed', …)` — so these
 * are a contract with the *table names* in the other repo's migrations.
 * **Renaming a table over there renames its channel and silently stops
 * delivery here**, with only `SAFETY_NET_PULL_MS` covering the gap.
 *
 * Only the inbound keys appear: the outbound tables are ones this app writes,
 * so listening to them would only ever hear its own echo.
 */
const CHANNEL_TO_KEY: Record<string, SyncedKey> = {
  messages_changed: 'admin.messages',
  orders_changed: 'admin.orders',
}

/** Coalesces the burst of notifications a multi-row write produces into one pull. */
const PULL_DEBOUNCE_MS = 250

/**
 * How often to pull anyway while connected.
 *
 * `LISTEN` delivery is not guaranteed: a notification raised while the socket
 * is down between a drop and a reconnect is simply gone, and an order that
 * never appears is the worst failure this bridge has. This is the backstop.
 *
 * Fifteen minutes is far longer than the database's idle-suspend window, so
 * it costs nothing extra — while the cafe is open the listener is already
 * holding the compute awake, and while it is closed this timer doesn't run.
 */
const SAFETY_NET_PULL_MS = 15 * 60 * 1000

/**
 * How often to re-check whether the cafe is open.
 *
 * Reads the local opening hours only and never touches the database, so it is
 * free to run this often — it is what decides when to connect and disconnect.
 */
const OPEN_STATE_CHECK_MS = 60 * 1000

/** First reconnect delay; doubles up to `RECONNECT_MAX_MS`. */
const RECONNECT_BASE_MS = 5_000

/** Ceiling for the reconnect backoff, so a long outage retries steadily rather than never. */
const RECONNECT_MAX_MS = 5 * 60 * 1000

/**
 * How long after our own push to ignore that table's notification.
 *
 * This app writes `messages.read` and `orders.status` itself, and the
 * website's trigger fires on `update` as well as `insert` — so every push
 * comes straight back as a notification about our own work. Acting on it is
 * a wasted round trip, and it re-pulls a table whose local copy is already
 * current.
 *
 * Suppressing it is safe rather than lossy: a genuine change landing inside
 * this window is still caught by the pull that `flushPendingPushes` schedules
 * once the window closes (see `schedulePostPushPull`), and by
 * `SAFETY_NET_PULL_MS` behind that.
 */
const SELF_PUSH_ECHO_MS = 10_000

const OUTBOUND_KEYS: SyncedKey[] = ['admin.products', 'admin.categoryPrices', 'admin.contactInfo', 'admin.events']
const INBOUND_KEYS: SyncedKey[] = ['admin.messages', 'admin.orders']
/** Push-only — see the module doc comment above. Excluded from `OUTBOUND_KEYS` since they don't follow that list's pull-or-seed reconciliation logic. */
const MESSAGE_BOARD_KEYS: SyncedKey[] = ['admin.messageBoards', 'admin.messageBoardPosts']
/**
 * Push-only for the same reason as `MESSAGE_BOARD_KEYS`, and emphatically not
 * an outbound key: `admin.appearanceThemes` holds *every* theme plus
 * `activeThemeId`, while `site_theme` holds a projection of the active one
 * with its colours already resolved. Pulling that back would overwrite the
 * whole local theme list with a single flattened theme.
 */
const THEME_KEYS: SyncedKey[] = ['admin.appearanceThemes']
/**
 * Push-only for the same reason as the two groups above, and likewise not an
 * outbound key: `admin.catalogues` has no table of its own on the website. It
 * only ever feeds the `products` table's own `category_order`/`product_order`
 * columns, so that the public menu can reproduce the admin's own
 * catalogue → category → product arrangement (see `computeProductOrderRanks`).
 *
 * Putting it in `OUTBOUND_KEYS` instead would break `reconcile`, which pulls
 * every outbound key on connect — there is no catalogues table to pull from,
 * so `pull` would throw `no pull mapping for admin.catalogues` every cycle.
 *
 * A write here re-pushes the whole products table in its new order; a write to
 * `admin.products` itself already does the same via its own outbound push, so
 * `flushPendingPushes` only fires this when products weren't already queued.
 */
const CATALOGUE_ORDER_KEYS: SyncedKey[] = ['admin.catalogues']

type ApplyUpdate = (key: SyncedKey, value: unknown) => void
type ReportError = (message: string, detail?: string) => void

let applyUpdateRef: ApplyUpdate | null = null
let reportErrorRef: ReportError | null = null
/** Set by `stop()` so a poll tick already scheduled doesn't resurrect the sync after graceful shutdown has started. */
let stopped = false

// --- listen state -------------------------------------------------------------

/** The long-lived `LISTEN` connection, held only while the cafe is open. `null` means nothing is connected and the database is free to suspend. */
let listenClient: Client | null = null
/** Guards `openListener` against being entered twice before the first connect resolves. */
let listenConnecting = false
/** Whether the cafe was open at the previous open/closed check — drives the single catch-up pull run just after closing time. */
let listenWasOpen = false
/** Fires every `OPEN_STATE_CHECK_MS`. Touches no database — it only reads the local opening hours. */
let openStateTimer: NodeJS.Timeout | null = null
/** Backstop pull while connected, in case a notification was lost — see `SAFETY_NET_PULL_MS`. */
let safetyNetTimer: NodeJS.Timeout | null = null
/** Armed by `handleListenerLoss` while the cafe is still open. */
let reconnectTimer: NodeJS.Timeout | null = null
/** Consecutive failed connection attempts, for the backoff in `scheduleReconnect`. */
let reconnectAttempts = 0
/** Guards against a slow pull overlapping the next one. */
let pullTickRunning = false
/** A failure repeats on every retry, so only the first of a run is surfaced to the admin tabs; reset on the next success. */
let syncFailureReported = false
/** Keys a notification has asked for, coalesced by `PULL_DEBOUNCE_MS`. */
const pendingPullKeys = new Set<SyncedKey>()
let pullDebounceTimer: NodeJS.Timeout | null = null
/** When this process last pushed each key itself — see `isEchoOfOurOwnPush`. */
const lastSelfPushAt = new Map<SyncedKey, number>()
/** Keys edited locally since the last flush, pushed together on one connection. */
const pendingPushKeys = new Set<SyncedKey>()
let pushFlushTimer: NodeJS.Timeout | null = null
let pushFlushRunning = false

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

/** The catalogues `pushProducts` ranks its products against — read fresh from the store on every push, since a catalogue/category reorder changes the order without `admin.products` itself changing at all. */
function currentCatalogues(): Catalogue[] {
  return (store.get('admin.catalogues')?.value as Catalogue[] | undefined) ?? []
}

/**
 * Reorders a freshly pulled product list to match the local one's own array
 * order, so accepting the website's copy of the *content* never rewrites the
 * *order*.
 *
 * `pullProducts` reads `order by category, item_id` — a stable query order,
 * but an arbitrary one as far as display goes. Array position in
 * `admin.products` is the admin's own drag-and-drop display order (the same
 * order `computeProductOrderRanks` flattens into the website's rank columns),
 * so applying the pulled list verbatim would reset that arrangement to
 * id-sorted on every reconnect — and then push that reset order straight back
 * out as the public menu's order.
 *
 * The rank columns can't be pulled back to settle this instead: they're
 * deliberately write-only (see `ProductRow` in `neonMappers.ts`), precisely
 * because this side is authoritative about order.
 *
 * @param remote Products as pulled from the website, in `category, item_id` order.
 * @param local The current local products, whose array order is authoritative.
 * @returns The remote products, ordered by their local position; ones with no
 *   local counterpart keep their relative pulled order and go last, since
 *   nothing here knows where the admin would have wanted them.
 */
function preserveLocalProductOrder(remote: Product[], local: Product[]): Product[] {
  const localPositionById = new Map(local.map((product, index) => [product.itemID, index]))
  const known: Product[] = []
  const unknown: Product[] = []
  for (const product of remote) {
    if (localPositionById.has(product.itemID)) known.push(product)
    else unknown.push(product)
  }
  known.sort((a, b) => localPositionById.get(a.itemID)! - localPositionById.get(b.itemID)!)
  return [...known, ...unknown]
}

/**
 * Carries the Register's own product fields (`barcode`, `readyToServe`, `vatCategory`) over from the
 * local copy onto pulled products. The website's `products` table has no columns for them, so without
 * this every reconnect's pull would silently erase every barcode staff had set up (and reset every
 * product's VAT category to `food`).
 */
function keepLocalRegisterFields(pulled: Product[], local: Product[]): Product[] {
  const localById = new Map(local.map((product) => [product.itemID, product]))
  return pulled.map((product) => {
    const own = localById.get(product.itemID)
    if (!own || (own.barcode === undefined && own.readyToServe === undefined && own.vatCategory === undefined)) return product
    const merged = { ...product }
    if (own.barcode !== undefined) merged.barcode = own.barcode
    if (own.readyToServe !== undefined) merged.readyToServe = own.readyToServe
    if (own.vatCategory !== undefined) merged.vatCategory = own.vatCategory
    return merged
  })
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
      return pushProducts(activeClient, value as Product[], currentCatalogues())
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

/** Pushes the active theme's fonts and resolved website colours — the only way `site_theme` on Neon is ever written. Skips silently when no theme resolves, rather than blanking the website's own styling. */
async function pushActiveTheme(activeClient: Client): Promise<void> {
  const settings = store.get('admin.appearanceThemes')?.value as AppearanceSettings | undefined
  const themes = settings?.themes ?? []
  // Same fallback as `useActiveAppearanceTheme`: a since-deleted `activeThemeId` uses the first theme rather than nothing.
  const active = themes.find((theme) => theme.id === settings?.activeThemeId) ?? themes[0]
  if (!active) return

  await pushSiteTheme(activeClient, toWebsiteThemeProjection(active))
}

/** Re-pushes the whole products table in its current catalogue/category order — what a catalogue/category reorder triggers, since that changes the order the website should show without changing `admin.products` itself (see `CATALOGUE_ORDER_KEYS`). Shares `pushProducts`' own advisory lock with the ordinary products push, so the two can never race. */
async function pushProductsInCurrentOrder(activeClient: Client): Promise<void> {
  const products = (store.get('admin.products')?.value as Product[] | undefined) ?? []
  await pushProducts(activeClient, products, currentCatalogues())
}

/** Runs once per fresh connection: for outbound keys, seeds Neon from local data if Neon's own table is still empty (first-sync safety, same spirit as the LAN sync's own `seeded` flag), else pulls Neon's value down; for inbound keys, always pulls down. */
async function reconcile(activeClient: Client) {
  for (const key of OUTBOUND_KEYS) {
    try {
      const remote = await pull(activeClient, key)
      const local = store.get(key)?.value
      if (isDefaultValue(key, remote) && !isDefaultValue(key, local)) {
        await push(activeClient, key, local)
        purgeForKeys([key])
        console.log(`[neon] seeded ${key} up to the website (was empty there)`)
      } else if (!isDefaultValue(key, remote)) {
        // Products are the one outbound key whose array order carries meaning,
        // so the pulled content is re-sorted into the local order rather than
        // replacing it — see `preserveLocalProductOrder`.
        applyUpdateRef?.(
          key,
          key === 'admin.products' ? keepLocalRegisterFields(preserveLocalProductOrder(remote as Product[], (local as Product[] | undefined) ?? []), (local as Product[] | undefined) ?? []) : remote,
        )
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
    purgeForKeys(MESSAGE_BOARD_KEYS)
  } catch (error) {
    console.error('[neon] reconciliation failed for the message board:', error)
    reportErrorRef?.('Failed to sync the message board with the website', errorDetail(error))
  }

  // Push-only for the same reason — see `THEME_KEYS`.
  try {
    await pushActiveTheme(activeClient)
    purgeForKeys(THEME_KEYS)
  } catch (error) {
    console.error('[neon] reconciliation failed for the site theme:', error)
    reportErrorRef?.('Failed to sync the appearance theme with the website', errorDetail(error))
  }

  // Push-only for the same reason — see `CATALOGUE_ORDER_KEYS`. Runs after the
  // outbound loop above deliberately: that loop is what settles what
  // `admin.products` currently holds, and this ranks exactly that.
  //
  // Unconditional rather than only-when-empty, because the rank columns are
  // never pulled back (see `ProductRow`): nothing here can tell whether the
  // website's own copy is already in the right order, only that the local
  // order is authoritative. Without this a reconnect leaves every row at its
  // `0` default — the products table is non-empty, so the outbound loop pulls
  // rather than pushes — and the public menu silently falls back to sorting
  // alphabetically by name until some unrelated product edit happens to
  // trigger a push.
  try {
    await pushProductsInCurrentOrder(activeClient)
    purgeForKeys(CATALOGUE_ORDER_KEYS)
  } catch (error) {
    console.error('[neon] reconciliation failed for the product display order:', error)
    reportErrorRef?.('Failed to sync the product display order with the website', errorDetail(error))
  }
}

// --- listen mode --------------------------------------------------------------

/**
 * Opens a short-lived connection, runs `run`, and always closes it again.
 *
 * Used for *pushes*, which are bursty and must not depend on whether the cafe
 * happens to be open. No socket outlives the work it was opened for, so the
 * website's database is free to suspend in between — hence the `finally`
 * rather than relying on any caller to clean up.
 *
 * Inbound work uses the long-lived listener instead (see `pullInbound`), since
 * that connection is already open and the database already awake.
 *
 * @param run Receives the connected client.
 * @returns Whatever `run` returns.
 * @throws If no connection string is configured, or the connection fails.
 */
async function withTemporaryClient<T>(run: (activeClient: Client) => Promise<T>): Promise<T> {
  const connectionString = store.getNeonDatabaseUrl()
  if (!connectionString) throw new Error('neonBridge: no connection string configured')

  const temporaryClient = new Client({ connectionString, application_name: APPLICATION_NAME })
  await temporaryClient.connect()
  try {
    return await run(temporaryClient)
  } finally {
    await temporaryClient.end().catch(() => {})
  }
}

/**
 * Whether the cafe is currently open, for the opening-hours gate.
 *
 * Defaults to **open** when there is no usable contact info yet: a fresh
 * install has no hours configured, and silently syncing nothing at all would
 * be a far worse failure than an unnecessary connection.
 */
function isCafeOpenNow(): boolean {
  const info = store.get('admin.contactInfo')?.value as ContactInfo | undefined
  if (!info?.hours) return true
  return isCafeOpenAt(info)
}

/** Whether the listener should currently be connected at all. */
function shouldBeConnected(): boolean {
  if (stopped) return false
  if (!store.getNeonDatabaseUrl()) return false
  if (!store.getNeonSyncConfig().pollOnlyDuringOpeningHours) return true
  return isCafeOpenNow()
}

/**
 * The backstop pull interval, honouring the configured value as a *floor*.
 *
 * The setting used to pace how quickly a new order was noticed. It no longer
 * does — notifications deliver in milliseconds — so a shorter value would buy
 * nothing while costing database compute for every extra wake-up. A longer
 * value is still respected, since that only relaxes the backstop.
 */
function safetyNetIntervalMs(): number {
  return Math.max(store.getNeonSyncConfig().pollIntervalSeconds * 1000, SAFETY_NET_PULL_MS)
}

/** Whether a notification for `key` is this process hearing its own recent push. */
function isEchoOfOurOwnPush(key: SyncedKey): boolean {
  const pushedAt = lastSelfPushAt.get(key)
  return pushedAt !== undefined && Date.now() - pushedAt < SELF_PUSH_ECHO_MS
}

/** Records that we just wrote `key` ourselves, so its own notification is ignored. */
function markSelfPush(key: SyncedKey): void {
  if (!INBOUND_KEYS.includes(key)) return
  lastSelfPushAt.set(key, Date.now())
}

/**
 * Pulls `key` once the echo window has closed.
 *
 * Without this, a real change landing during the window we are deliberately
 * ignoring would wait for `SAFETY_NET_PULL_MS`. One catch-up pull afterwards
 * costs nothing — the database is awake anyway, having just taken our push.
 */
function schedulePostPushPull(key: SyncedKey): void {
  if (!INBOUND_KEYS.includes(key)) return
  setTimeout(() => {
    if (stopped || !listenClient) return
    schedulePull(key)
  }, SELF_PUSH_ECHO_MS + 500).unref?.()
}

/** Queues a pull for `key` and (re)arms the debounce that runs the batch. */
function schedulePull(key: SyncedKey): void {
  pendingPullKeys.add(key)
  if (pullDebounceTimer) clearTimeout(pullDebounceTimer)
  pullDebounceTimer = setTimeout(() => {
    pullDebounceTimer = null
    void runPendingPulls()
  }, PULL_DEBOUNCE_MS)
}

/**
 * Pulls whatever notifications have asked for, on the listener's connection.
 *
 * Deferred while a push is in flight for the same reason `pollOnce` was: a
 * pull fully replaces the local value, so overlapping one with a push whose
 * own edit hasn't landed yet would pull the pre-edit state back over it.
 */
async function runPendingPulls(): Promise<void> {
  if (stopped || pendingPullKeys.size === 0) return

  const activeClient = listenClient
  if (!activeClient) {
    // Disconnected between the notification and now; the reconnect's own
    // reconcile will cover whatever these keys were.
    pendingPullKeys.clear()
    return
  }

  if (pullTickRunning || pushFlushRunning) {
    if (pullDebounceTimer) clearTimeout(pullDebounceTimer)
    pullDebounceTimer = setTimeout(() => {
      pullDebounceTimer = null
      void runPendingPulls()
    }, PULL_DEBOUNCE_MS)
    return
  }

  const keys = [...pendingPullKeys]
  pendingPullKeys.clear()

  pullTickRunning = true
  try {
    for (const key of keys) {
      await pullAndApply(activeClient, key)
    }
    syncFailureReported = false
  } catch (error) {
    console.error('[neon] pull failed:', error)
    if (!syncFailureReported) {
      syncFailureReported = true
      reportErrorRef?.('Lost contact with the website database', errorDetail(error))
    }
    // The connection is the likely casualty; dropping it forces a reconnect,
    // whose reconcile re-reads everything anyway.
    handleListenerLoss(error)
  } finally {
    pullTickRunning = false
  }
}

/** Handles one `<table>_changed` notification. */
function onNotification(channel: string): void {
  const key = CHANNEL_TO_KEY[channel]
  if (!key) return

  if (isEchoOfOurOwnPush(key)) return

  schedulePull(key)
}

/**
 * Waits for any in-flight push or pull to finish.
 *
 * `runPendingPulls` handles a busy bridge by arming a timer and returning, so
 * awaiting it proves nothing about whether a pull actually ran. Callers that
 * must not lose their pull — the closing-time catch-up above all, since
 * `closeListener` drops the queue immediately afterwards — wait here first.
 *
 * Bounded, so a wedged flush delays shutdown rather than blocking it forever.
 */
async function waitUntilIdle(timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while ((pushFlushRunning || pullTickRunning) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
}

/**
 * Pulls every inbound key now, rather than queueing it.
 *
 * Used by the safety net and by the final catch-up at closing time — both of
 * which are the backstop themselves, so neither can afford to be deferred.
 */
async function pullInboundBackstop(): Promise<void> {
  if (stopped || !listenClient) return

  await waitUntilIdle()

  for (const key of INBOUND_KEYS) pendingPullKeys.add(key)
  await runPendingPulls()
}

/**
 * Connects, reconciles, and starts listening.
 *
 * The full `reconcile` on connect is what makes a lost notification survivable
 * across a restart or a dropped socket: whatever changed while nothing was
 * listening is read on the way in.
 */
async function openListener(): Promise<void> {
  if (stopped || listenClient || listenConnecting) return

  const connectionString = store.getNeonDatabaseUrl()
  if (!connectionString) return

  listenConnecting = true
  const client = new Client({ connectionString, application_name: APPLICATION_NAME })

  try {
    await client.connect()

    // Attached before any await below, so a drop during reconcile is caught.
    client.on('error', (error) => handleListenerLoss(error))
    client.on('end', () => handleListenerLoss(new Error('connection ended')))
    client.on('notification', (message) => onNotification(message.channel))

    for (const channel of Object.keys(CHANNEL_TO_KEY)) {
      // Channel names are module constants, never user input, so the
      // identifier can't be injected here.
      await client.query(`listen ${channel}`)
    }

    listenClient = client
    reconnectAttempts = 0

    await reconcile(client)
    syncFailureReported = false

    startSafetyNet()
    console.log(`[neon] listening on ${Object.keys(CHANNEL_TO_KEY).join(', ')}`)
  } catch (error) {
    if (listenClient === client) listenClient = null
    client.removeAllListeners()
    await client.end().catch(() => {})

    console.error('[neon] failed to open the listener:', error)
    if (!syncFailureReported) {
      syncFailureReported = true
      reportErrorRef?.('Lost contact with the website database', errorDetail(error))
    }
    scheduleReconnect()
  } finally {
    listenConnecting = false
  }
}

/** Closes the listener and stops its timers. Safe to call when already closed. */
function closeListener(): void {
  stopSafetyNet()

  if (pullDebounceTimer) {
    clearTimeout(pullDebounceTimer)
    pullDebounceTimer = null
  }
  pendingPullKeys.clear()

  const client = listenClient
  listenClient = null
  if (!client) return

  // The handlers would otherwise fire `handleListenerLoss` for a close we
  // asked for, and immediately schedule a reconnect against it.
  client.removeAllListeners()
  void client.end().catch(() => {})
}

/**
 * Reacts to the listener dropping underneath us.
 *
 * Reconnects only while the cafe is still open — a drop at closing time is
 * simply the shutdown happening slightly early.
 */
function handleListenerLoss(error: unknown): void {
  if (!listenClient) return

  console.error('[neon] listener lost:', errorDetail(error))
  closeListener()

  if (shouldBeConnected()) scheduleReconnect()
}

/** Arms the next reconnect attempt, backing off so a long outage retries steadily. */
function scheduleReconnect(): void {
  if (stopped || reconnectTimer) return

  const delay = Math.min(RECONNECT_BASE_MS * 2 ** reconnectAttempts, RECONNECT_MAX_MS)
  reconnectAttempts += 1

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    if (!shouldBeConnected()) return
    void openListener()
  }, delay)
  reconnectTimer.unref?.()

  console.log(`[neon] reconnecting in ${Math.round(delay / 1000)}s`)
}

/** Starts the backstop pull loop. */
function startSafetyNet(): void {
  stopSafetyNet()
  safetyNetTimer = setInterval(() => {
    if (stopped || !listenClient) return
    void pullInboundBackstop()
  }, safetyNetIntervalMs())
  safetyNetTimer.unref?.()
}

function stopSafetyNet(): void {
  if (safetyNetTimer) {
    clearInterval(safetyNetTimer)
    safetyNetTimer = null
  }
}

/**
 * Connects or disconnects to match the cafe's opening hours.
 *
 * The closing-time transition still runs one final pull before disconnecting,
 * so anything submitted in the last minutes isn't stranded until morning —
 * the same guarantee the old `shouldRunPollTick` gave.
 */
async function syncOpenState(): Promise<void> {
  if (stopped) return

  const shouldConnect = shouldBeConnected()

  if (shouldConnect) {
    listenWasOpen = true
    if (!listenClient && !listenConnecting && !reconnectTimer) await openListener()
    return
  }

  if (listenWasOpen) {
    listenWasOpen = false
    console.log('[neon] cafe closed — running a final pull, then disconnecting until it reopens')
    if (listenClient) await pullInboundBackstop().catch(() => {})
  }

  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  closeListener()
}

/** Begins listen mode: connect if the cafe is open now, and re-check every minute. */
function startSync() {
  const { pollOnlyDuringOpeningHours } = store.getNeonSyncConfig()

  listenWasOpen = false
  syncFailureReported = false
  reconnectAttempts = 0

  console.log(
    `[neon] listen mode${pollOnlyDuringOpeningHours ? ' during opening hours' : ''}` +
      `, backstop pull every ${Math.round(safetyNetIntervalMs() / 60000)}min`,
  )

  void syncOpenState()

  openStateTimer = setInterval(() => {
    void syncOpenState()
  }, OPEN_STATE_CHECK_MS)
  openStateTimer.unref?.()
}

/** Queues a locally-edited key and (re)arms the debounce that flushes the batch. */
function schedulePolledPush(key: SyncedKey) {
  pendingPushKeys.add(key)
  if (pushFlushTimer) clearTimeout(pushFlushTimer)
  pushFlushTimer = setTimeout(() => {
    pushFlushTimer = null
    void flushPendingPushes()
  }, PUSH_DEBOUNCE_MS)
}

/**
 * Pushes every queued key up on a single short-lived connection.
 *
 * Values are re-read from the store rather than captured when the edit
 * happened, so a burst of saves to the same key sends only its final state —
 * `applyUpdate` has always written the store before calling `pushIfRelevant`.
 */
async function flushPendingPushes(): Promise<void> {
  if (stopped || pendingPushKeys.size === 0) return

  // Never open a second connection alongside one already in use; retry once
  // the current one is done.
  if (pushFlushRunning || pullTickRunning) {
    if (pushFlushTimer) clearTimeout(pushFlushTimer)
    pushFlushTimer = setTimeout(() => {
      pushFlushTimer = null
      void flushPendingPushes()
    }, PUSH_DEBOUNCE_MS)
    return
  }

  // The push-only groups each recompute a whole mirror from the store, so
  // however many of their keys are queued they collapse into one push apiece
  // rather than doing that work twice.
  const queued = [...pendingPushKeys]
  const keys = queued.filter((key) => !MESSAGE_BOARD_KEYS.includes(key) && !THEME_KEYS.includes(key) && !CATALOGUE_ORDER_KEYS.includes(key))
  const alsoPushMessageBoard = queued.some((key) => MESSAGE_BOARD_KEYS.includes(key))
  const alsoPushTheme = queued.some((key) => THEME_KEYS.includes(key))
  // Skipped when `admin.products` is in this same batch: its own push above already
  // sends the products table in its current catalogue order, so re-pushing here
  // would just repeat the identical full replace.
  const alsoPushProductOrder = queued.some((key) => CATALOGUE_ORDER_KEYS.includes(key)) && !keys.includes('admin.products')
  pendingPushKeys.clear()

  pushFlushRunning = true
  try {
    // Marked *before* the push: the notification is delivered on commit, which
    // can reach the listener before the push call resolves here.
    for (const key of keys) markSelfPush(key)

    await withTemporaryClient(async (temporaryClient) => {
      for (const key of keys) {
        await push(temporaryClient, key, store.get(key)?.value)
      }
      if (alsoPushMessageBoard) await pushPublicMessageBoardPosts(temporaryClient)
      if (alsoPushTheme) await pushActiveTheme(temporaryClient)
      if (alsoPushProductOrder) await pushProductsInCurrentOrder(temporaryClient)
    })
    // One purge for the whole batch, after every push in it landed.
    purgeForKeys(queued)

    // Re-mark now that the writes have actually committed, then arrange the
    // one catch-up pull that makes ignoring our own echo safe rather than
    // lossy — see `SELF_PUSH_ECHO_MS`.
    for (const key of keys) {
      markSelfPush(key)
      schedulePostPushPull(key)
    }
  } catch (error) {
    console.error('[neon] polled push failed:', error)
    reportErrorRef?.('Failed to push changes to the website', errorDetail(error))
    // Put the batch back so the next flush retries it, instead of the website
    // staying stale until someone happens to edit the same key again. No timer
    // is armed here on purpose: a permanently failing push would otherwise
    // reconnect in a loop, and the next edit (or the next restart's full
    // reconciliation) will pick these up anyway.
    for (const key of queued) pendingPushKeys.add(key)
  } finally {
    pushFlushRunning = false
  }
}

/**
 * Closes the listener, cancels every timer, and drops anything still queued.
 * Shared by `restart` and `stop`.
 *
 * Closing the listener here is not optional: a connection left behind by a
 * settings change would hold the website's database awake indefinitely, which
 * is the exact cost this design exists to avoid.
 */
function teardownSync() {
  if (openStateTimer) {
    clearInterval(openStateTimer)
    openStateTimer = null
  }
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  if (pushFlushTimer) {
    clearTimeout(pushFlushTimer)
    pushFlushTimer = null
  }
  closeListener()
  pendingPushKeys.clear()
  lastSelfPushAt.clear()
  listenWasOpen = false
}

/** Starts the bridge (a no-op if no connection string is configured, via either the env var or Settings → Connect to website). Call once at server boot, after `store.load()`. */
export function start(applyUpdate: ApplyUpdate, reportError: ReportError) {
  applyUpdateRef = applyUpdate
  reportErrorRef = reportError

  if (!store.getNeonDatabaseUrl()) {
    console.log('[neon] no Neon database URL configured — website sync is disabled')
    return
  }

  startSync()
}

/**
 * Stops and restarts polling using whatever `store.getNeonDatabaseUrl()`
 * returns right now — called after an admin edits or clears it from Settings,
 * so the change takes effect immediately without a server restart.
 *
 * With the URL cleared this leaves the bridge genuinely idle rather than
 * starting a timer that would fail on every tick.
 */
export function restart() {
  teardownSync()
  if (!store.getNeonDatabaseUrl()) return
  startSync()
}

/** Stops polling and drops anything queued — called on graceful shutdown (SIGTERM/SIGINT). */
export function stop() {
  stopped = true
  teardownSync()
}

/**
 * Pushes a client-originated write up to Neon if this bridge owns the key
 * outbound.
 *
 * **Outbound pushes are immediate**, independent of the poll interval: the key
 * is queued and flushed on its own short-lived connection a moment later
 * (`schedulePolledPush`). Only *inbound* freshness is paced by the interval,
 * so a staff edit never waits for the next tick.
 *
 * Silently no-ops when there is nothing to push to (no connection string
 * configured), rather than reporting a failure on every subsequent edit.
 */
export function pushIfRelevant(key: SyncedKey, value: unknown) {
  if (stopped) return
  if (!store.getNeonDatabaseUrl()) return
  if (!MESSAGE_BOARD_KEYS.includes(key) && !THEME_KEYS.includes(key) && !CATALOGUE_ORDER_KEYS.includes(key) && !OUTBOUND_KEYS.includes(key) && !INBOUND_KEYS.includes(key)) return

  // `value` is deliberately unused: the flush re-reads the current value from
  // the store, so a burst of saves to one key sends only its final state.
  void value
  schedulePolledPush(key)
}
