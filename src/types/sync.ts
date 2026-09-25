/** Every `useLocalStorage` key the local LAN server keeps in sync across devices. */
export const SYNCED_KEYS = [
  'admin.products',
  'admin.categoryPrices',
  'admin.catalogues',
  'admin.messages',
  'admin.events',
  'admin.contactInfo',
  'admin.storeSettings',
  'admin.appearanceThemes',
  'admin.textSizePresets',
  'admin.clockFormat',
  'admin.dateFormat',
  'admin.paneLanguage',
  'admin.screensaverSchedule',
  'admin.dashboardScreensaver',
  'admin.screens',
  'admin.displayMachines',
  'admin.displayMachineCloseRequests',
  'admin.displayPairingRequests',
  'admin.displayUpdateState',
  'admin.displayScreenOverride',
  'admin.integrations',
  'admin.transitDepartures',
  'admin.sidebarSettings',
  'admin.orders',
  'admin.messageBoards',
  'admin.messageBoardPosts',
  'admin.woltConfig',
  'admin.woltOrders',
  'admin.foodoraConfig',
  'admin.foodoraOrders',
  'admin.printers',
  'admin.registerOrders',
] as const

export type SyncedKey = (typeof SYNCED_KEYS)[number]

/** A user's role. `admin` and `subadmin` have full rights over every section; `limited` is scoped to `allowedSections`. */
export type AdminRole = 'admin' | 'subadmin' | 'limited'

/** Dashboard sections a `limited` account can be scoped to. Matches every `AdminSidebarNav` item except `overview` (always visible), `images`/`users` (admin/subadmin only, never assignable to a `limited` account), and `settings` (a personal/device preference, not a permissioned section) — plus `store` and `displaymanager`, neither of which has a sidebar item of its own anymore (`store` is reached as a submenu of Settings, `displaymanager` as a submenu of Screens) but both remain their own assignable permission scope. `store` covers both `admin.storeSettings` (company name/logo/favicon) and `admin.contactInfo` (nested inside that same admin page as a sub-view) as one unit. */
export type DashboardSection = 'messages' | 'products' | 'events' | 'store' | 'orders' | 'screens' | 'displaymanager' | 'integrations' | 'messageboard'

/** Runtime list matching `DashboardSection`, in the same order `AdminSidebarNav` shows them (`store`/`displaymanager` included even though neither has its own sidebar item anymore) — used to build a `limited` account's own section-picker checkboxes (see `UserForm`). */
export const DASHBOARD_SECTIONS: DashboardSection[] = ['messages', 'products', 'events', 'store', 'orders', 'screens', 'displaymanager', 'integrations', 'messageboard']

/** The session info returned by `/login` and attached to every authenticated request. */
export interface AdminSession {
  token: string
  username: string
  role: AdminRole
  allowedSections?: DashboardSection[]
}

/**
 * Sent on connect, and again any time this tab starts caring about a key it
 * hasn't told the server about yet. `keys` is only ever the *newly*
 * interesting ones, not the full running total — the client tracks what
 * it's already declared.
 */
export interface HelloMessage {
  type: 'hello'
  keys: SyncedKey[]
}

export interface WriteMessage {
  type: 'write'
  key: SyncedKey
  value: unknown
  token: string
}

export interface SnapshotMessage {
  type: 'snapshot'
  state: Partial<Record<SyncedKey, { seeded: boolean; value: unknown; revision: number }>>
}

export interface UpdateMessage {
  type: 'update'
  key: SyncedKey
  value: unknown
  revision: number
}

/** A background/operational problem worth surfacing to every open admin tab — e.g. the Neon bridge losing its connection — not tied to any specific synced key, so (unlike `UpdateMessage`) it's broadcast to every connection regardless of its own interest set. See `src/lib/errorNotifications.ts`. */
export interface ErrorMessage {
  type: 'error'
  message: string
  detail?: string
}

/**
 * Sent by the server to every socket every `HEARTBEAT_INTERVAL_MS`, so a page can tell a live but
 * quiet connection from a dead one. Protocol-level WebSocket pings are invisible to page script, and
 * some WebViews (the Companion tablet's, notably) never fire `close` when the server goes away — see
 * `syncClient.ts`'s watchdog.
 */
export interface HeartbeatMessage {
  type: 'heartbeat'
}

/** How often the server sends `HeartbeatMessage`. */
export const HEARTBEAT_INTERVAL_MS = 10_000

export type ClientMessage = HelloMessage | WriteMessage
export type ServerMessage = SnapshotMessage | UpdateMessage | ErrorMessage | HeartbeatMessage

// --- Neon bridge sync configuration ------------------------------------------
//
// How the local server keeps in touch with the public website's own Postgres
// database (see `server/neonBridge.ts`). Persisted alongside the connection
// string in `server/data/neon-database-url.json` and edited from
// Settings → Connect to website.

/**
 * How the local server keeps in touch with the website's database.
 *
 * **Orders and messages arrive by `LISTEN`, not by polling.** While the cafe
 * is open the bridge holds one connection and the website's own `pg_notify`
 * triggers deliver a new order in milliseconds; while it is closed nothing is
 * connected at all. See `server/neonBridge.ts` for why that costs no more than
 * the polling it replaced — briefly, the old default interval and the
 * database's idle-suspend window were both ~5 minutes, so polling never let it
 * suspend anyway and merely delivered orders late.
 */
export interface NeonSyncConfig {
  /**
   * How often to pull anyway, as a backstop against a lost notification.
   *
   * No longer what paces a new order reaching the cafe — that is immediate
   * now. Lowering this therefore buys nothing while costing database compute
   * for every extra wake-up, so the bridge treats it as a *floor* and never
   * pulls more often than its own `SAFETY_NET_PULL_MS`. Raising it is still
   * honoured, since that only relaxes the backstop.
   */
  pollIntervalSeconds: number
  /**
   * Disconnect entirely while the cafe is closed (per `admin.contactInfo`'s
   * own opening hours). Nobody is waiting on an order at a closed cafe, and an
   * uninterrupted overnight gap is the one thing that genuinely lets the
   * database sleep — it is where all of the saving actually comes from.
   */
  pollOnlyDuringOpeningHours: boolean
}

/** Five minutes is kept as the stored default for continuity, but it now only sets the backstop floor — the bridge's own 15-minute minimum wins. Disconnecting overnight is the setting that matters. */
export const DEFAULT_NEON_SYNC_CONFIG: NeonSyncConfig = {
  pollIntervalSeconds: 300,
  pollOnlyDuringOpeningHours: true,
}

/** Floor of 30s stops a typo turning polling into a busy loop against the database; ceiling of 1h keeps an order from sitting unseen for most of a shift. */
export const MIN_POLL_INTERVAL_SECONDS = 30
export const MAX_POLL_INTERVAL_SECONDS = 3600

/**
 * Forces a poll interval into the supported range.
 *
 * @param seconds Raw value, from the settings form or an older config file.
 * @returns The value clamped to `[MIN_POLL_INTERVAL_SECONDS, MAX_POLL_INTERVAL_SECONDS]`,
 *   or the default when it isn't a usable number at all.
 */
export function clampPollIntervalSeconds(seconds: number): number {
  if (!Number.isFinite(seconds)) return DEFAULT_NEON_SYNC_CONFIG.pollIntervalSeconds
  return Math.min(MAX_POLL_INTERVAL_SECONDS, Math.max(MIN_POLL_INTERVAL_SECONDS, Math.round(seconds)))
}
