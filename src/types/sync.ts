/** Every `useLocalStorage` key the local LAN server keeps in sync across devices. */
export const SYNCED_KEYS = [
  'admin.products',
  'admin.categoryPrices',
  'admin.catalogues',
  'admin.messages',
  'admin.events',
  'admin.contactInfo',
  'admin.storeSettings',
  'admin.textSizePresets',
  'admin.clockFormat',
  'admin.dateFormat',
  'admin.paneLanguage',
  'admin.screenLockPin',
  'admin.screensaverSchedule',
  'admin.screens',
  'admin.extensions',
  'admin.sidebarSettings',
  'admin.orders',
  'admin.messageBoards',
  'admin.messageBoardPosts',
] as const

export type SyncedKey = (typeof SYNCED_KEYS)[number]

/** A user's role. `admin` and `subadmin` have full rights over every section; `limited` is scoped to `allowedSections`. */
export type AdminRole = 'admin' | 'subadmin' | 'limited'

/** Dashboard sections a `limited` account can be scoped to. Matches every `AdminSidebarNav` item except `overview` (always visible), `images`/`users` (admin/subadmin only, never assignable to a `limited` account), and `settings` (a personal/device preference, not a permissioned section). `store` covers both `admin.storeSettings` (company name/logo/favicon) and `admin.contactInfo` (nested inside that same admin page as a sub-view) as one unit — was `contact` before Contact info moved under Store settings; see `useSidebarSettings`/`store/loadUsers`'s "remap on read" migration for any already-persisted `'contact'` value. */
export type DashboardSection = 'messages' | 'products' | 'events' | 'store' | 'orders' | 'screens' | 'extensions' | 'messageboard'

/** Runtime list matching `DashboardSection`, in the same order `AdminSidebarNav` shows them — used to build a `limited` account's own section-picker checkboxes (see `UserForm`). */
export const DASHBOARD_SECTIONS: DashboardSection[] = ['messages', 'products', 'events', 'store', 'orders', 'screens', 'extensions', 'messageboard']

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
  state: Partial<Record<SyncedKey, { seeded: boolean; value: unknown }>>
}

export interface UpdateMessage {
  type: 'update'
  key: SyncedKey
  value: unknown
}

/** A background/operational problem worth surfacing to every open admin tab — e.g. the Neon bridge losing its connection — not tied to any specific synced key, so (unlike `UpdateMessage`) it's broadcast to every connection regardless of its own interest set. See `src/lib/errorNotifications.ts`. */
export interface ErrorMessage {
  type: 'error'
  message: string
  detail?: string
}

export type ClientMessage = HelloMessage | WriteMessage
export type ServerMessage = SnapshotMessage | UpdateMessage | ErrorMessage
