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
 * **Polling, not a persistent connection.** Every cycle opens a short-lived
 * connection, does its work, and closes it again, so the website's serverless
 * database is free to suspend in between. An always-open `LISTEN` connection
 * would deliver new orders within milliseconds — the database's own
 * `pg_notify` triggers are still there and still fire — but it would also keep
 * that database awake around the clock regardless of how many orders actually
 * arrive. For a cafe that is nearly all of the time, so the option was removed
 * rather than left as a tempting default.
 *
 * Only *inbound* freshness is paced by the interval: an order can sit up to
 * one cycle before the cafe sees it. Outbound pushes are immediate
 * (`pushIfRelevant`). Skipping the closed hours entirely
 * (`pollOnlyDuringOpeningHours`) saves far more than shortening the interval,
 * since an interval shorter than the database's own idle-suspend threshold
 * keeps it awake anyway and saves nothing.
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

/** Coalesces a burst of local edits (e.g. several keys saved together) into a single push connection. */
const PUSH_DEBOUNCE_MS = 300

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

// --- poll state ---------------------------------------------------------------

let pollTimer: NodeJS.Timeout | null = null
/** Guards against a slow tick overlapping the next one, which would open a second connection for the same work. */
let pollTickRunning = false
/** Whether the cafe was open at the previous tick — drives the single catch-up tick run just after closing time. */
let pollWasOpen = false
/** A poll failure repeats every interval, so only the first of a run is surfaced to the admin tabs; reset on the next success. */
let pollFailureReported = false
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
          key === 'admin.products' ? preserveLocalProductOrder(remote as Product[], (local as Product[] | undefined) ?? []) : remote,
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

// --- poll mode ---------------------------------------------------------------

/**
 * Opens a short-lived connection, runs `run`, and always closes it again.
 *
 * The point of poll mode is that no socket outlives the work it was opened
 * for, so the database is free to suspend in between — hence the `finally`
 * rather than relying on any caller to clean up.
 *
 * @param run Receives the connected client.
 * @returns Whatever `run` returns.
 * @throws If no connection string is configured, or the connection fails.
 */
async function withTemporaryClient<T>(run: (activeClient: Client) => Promise<T>): Promise<T> {
  const connectionString = store.getNeonDatabaseUrl()
  if (!connectionString) throw new Error('neonBridge: no connection string configured')

  const temporaryClient = new Client({ connectionString })
  await temporaryClient.connect()
  try {
    return await run(temporaryClient)
  } finally {
    await temporaryClient.end().catch(() => {})
  }
}

/**
 * Whether the cafe is currently open, for the opening-hours poll gate.
 *
 * Defaults to **open** when there is no usable contact info yet: a fresh
 * install has no hours configured, and silently syncing nothing at all would
 * be a far worse failure than an unnecessary poll.
 */
function isCafeOpenNow(): boolean {
  const info = store.get('admin.contactInfo')?.value as ContactInfo | undefined
  if (!info?.hours) return true
  return isCafeOpenAt(info)
}

/**
 * Whether this timer firing should actually open a connection.
 *
 * While the gate is on and the cafe is shut, ticks are skipped entirely — but
 * the first tick after closing time still runs, so anything submitted in the
 * final minutes isn't stranded until the next morning.
 */
function shouldRunPollTick(): boolean {
  if (!store.getNeonSyncConfig().pollOnlyDuringOpeningHours) return true

  if (isCafeOpenNow()) {
    pollWasOpen = true
    return true
  }

  if (pollWasOpen) {
    pollWasOpen = false
    console.log('[neon] cafe closed — running a final poll, then pausing until it reopens')
    return true
  }

  return false
}

/**
 * One poll cycle.
 *
 * @param full On the first cycle after (re)start, runs the same full
 *   `reconcile` a fresh connection would. Subsequent cycles pull
 *   `INBOUND_KEYS` only: re-running the outbound half every tick would race a
 *   local edit, pulling a stale remote value back over a save whose own push
 *   is still sitting in the debounce window.
 */
async function pollOnce(full: boolean): Promise<void> {
  if (stopped || pollTickRunning || pushFlushRunning) return

  pollTickRunning = true
  try {
    await withTemporaryClient(async (temporaryClient) => {
      if (full) {
        await reconcile(temporaryClient)
        return
      }
      for (const key of INBOUND_KEYS) {
        await pullAndApply(temporaryClient, key)
      }
    })
    pollFailureReported = false
  } catch (error) {
    console.error('[neon] poll failed:', error)
    if (!pollFailureReported) {
      pollFailureReported = true
      reportErrorRef?.('Lost contact with the website database', errorDetail(error))
    }
  } finally {
    pollTickRunning = false
  }
}

/** Begins poll mode: one full reconciliation now, then a gated tick every interval. */
function startPolling() {
  const { pollIntervalSeconds, pollOnlyDuringOpeningHours } = store.getNeonSyncConfig()

  // Seeded from the current state so the very next closing time is treated as
  // a transition rather than as "already closed, nothing to catch up".
  pollWasOpen = pollOnlyDuringOpeningHours ? isCafeOpenNow() : true
  pollFailureReported = false

  console.log(`[neon] polling every ${pollIntervalSeconds}s${pollOnlyDuringOpeningHours ? ' during opening hours' : ''}`)
  void pollOnce(true)

  pollTimer = setInterval(() => {
    if (stopped) return
    if (!shouldRunPollTick()) return
    void pollOnce(false)
  }, pollIntervalSeconds * 1000)
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
  if (pushFlushRunning || pollTickRunning) {
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

/** Cancels every poll-mode timer and drops anything still queued. Shared by `restart` and `stop`. */
function teardownPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
  if (pushFlushTimer) {
    clearTimeout(pushFlushTimer)
    pushFlushTimer = null
  }
  pendingPushKeys.clear()
}

/** Starts the bridge (a no-op if no connection string is configured, via either the env var or Settings → Connect to website). Call once at server boot, after `store.load()`. */
export function start(applyUpdate: ApplyUpdate, reportError: ReportError) {
  applyUpdateRef = applyUpdate
  reportErrorRef = reportError

  if (!store.getNeonDatabaseUrl()) {
    console.log('[neon] no Neon database URL configured — website sync is disabled')
    return
  }

  startPolling()
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
  teardownPolling()
  if (!store.getNeonDatabaseUrl()) return
  startPolling()
}

/** Stops polling and drops anything queued — called on graceful shutdown (SIGTERM/SIGINT). */
export function stop() {
  stopped = true
  teardownPolling()
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
