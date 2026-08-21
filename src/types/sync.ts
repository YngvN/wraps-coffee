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

export type ClientMessage = HelloMessage | WriteMessage
export type ServerMessage = SnapshotMessage | UpdateMessage | ErrorMessage

// --- Neon bridge sync configuration ------------------------------------------
//
// How the local server keeps in touch with the public website's own Postgres
// database (see `server/neonBridge.ts`). Persisted alongside the connection
// string in `server/data/neon-database-url.json` and edited from
// Settings → Connect to website.

/**
 * How often the bridge checks the website's database for new orders and
 * messages.
 *
 * **Polling is the only mode.** An always-open `LISTEN` connection would
 * deliver new orders within milliseconds, but it also stops a serverless
 * database from ever suspending — a cost paid around the clock regardless of
 * how many orders actually arrive, which for a cafe is nearly all of the time.
 * That trade was not worth it, so the option is gone rather than merely
 * discouraged.
 *
 * Only *inbound* freshness is affected. A change made in the dashboard is
 * still pushed to the website immediately.
 */
export interface NeonSyncConfig {
  pollIntervalSeconds: number
  /**
   * Skip checking entirely while the cafe is closed (per `admin.contactInfo`'s
   * own opening hours). Nobody is waiting on an order at a closed cafe, so an
   * uninterrupted overnight gap is what actually lets the database sleep — far
   * more than shortening the interval ever saves.
   */
  pollOnlyDuringOpeningHours: boolean
}

/** Five minutes during opening hours: frequent enough that an order isn't missed, sparse enough that the database can suspend overnight. */
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
