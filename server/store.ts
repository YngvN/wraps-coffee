import { randomBytes, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mirrorFile } from './backup'
import { DEFAULT_DASHBOARD_SCREENSAVER_SETTINGS } from '../src/types/dashboardScreensaver'
import { DEFAULT_EXTENSIONS_CONFIG } from '../src/types/extensions'
import { DEFAULT_SCREEN_ADDRESS_SETTINGS, type ScreenAddressSettings } from '../src/types/screenAddress'
import { DEFAULT_SIDEBAR_SETTINGS } from '../src/types/sidebarSettings'
import { SYNCED_KEYS, type AdminRole, type DashboardSection, type SyncedKey } from '../src/types/sync'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, 'data')
const SEED_DIR = join(__dirname, '..', 'src', 'data')

mkdirSync(DATA_DIR, { recursive: true })

interface StoredEntry {
  /** True until this key's first real client write — see "First-sync safety" in the sync-server plan. */
  seeded: boolean
  value: unknown
}

interface AdminUser {
  id: string
  username: string
  password: string
  role: AdminRole
  allowedSections?: DashboardSection[]
}

interface SessionInfo {
  username: string
  role: AdminRole
  allowedSections?: DashboardSection[]
}

/** Bundled seed file (relative to `src/data/`) for each synced key, or `null` for a key with no seed file — see `HARDCODED_DEFAULTS`. */
const SEED_FILES: Record<SyncedKey, string | null> = {
  'admin.products': 'products.json',
  'admin.categoryPrices': 'categoryPrices.json',
  'admin.catalogues': 'catalogues.json',
  'admin.messages': 'messages.json',
  'admin.events': 'events.json',
  'admin.contactInfo': 'contactInfo.json',
  'admin.storeSettings': 'storeSettings.json',
  'admin.textSizePresets': 'textSizePresets.json',
  'admin.clockFormat': null,
  'admin.dateFormat': null,
  'admin.paneLanguage': null,
  'admin.screenLockPin': null,
  'admin.screensaverSchedule': null,
  'admin.dashboardScreensaver': null,
  'admin.screens': 'screens.json',
  'admin.displayMachines': null,
  'admin.extensions': null,
  'admin.sidebarSettings': null,
  'admin.orders': null,
  'admin.messageBoards': null,
  'admin.messageBoardPosts': null,
}

/** Hardcoded defaults for the synced keys with no bundled seed file. */
const HARDCODED_DEFAULTS: Partial<Record<SyncedKey, unknown>> = {
  'admin.screenLockPin': null,
  'admin.screensaverSchedule': null,
  'admin.dashboardScreensaver': DEFAULT_DASHBOARD_SCREENSAVER_SETTINGS,
  'admin.displayMachines': [],
  'admin.clockFormat': '24h',
  'admin.dateFormat': 'dmy',
  // The cafe's own default language for kiosk pane content — set to
  // Norwegian on a fresh install per the explicit ask (see the "Standard
  // pane language" Settings card); each pane can still override it
  // individually (see `ScreenSlot.language`).
  'admin.paneLanguage': 'no',
  'admin.extensions': DEFAULT_EXTENSIONS_CONFIG,
  'admin.sidebarSettings': DEFAULT_SIDEBAR_SETTINGS,
  // No bundled seed — orders only ever arrive via the Neon bridge pulling
  // real submissions down from the public website (see `neonBridge.ts`).
  'admin.orders': [],
  // One default board so a fresh install has somewhere to post immediately.
  'admin.messageBoards': [{ id: 'general', name: 'General' }],
  'admin.messageBoardPosts': [],
}

function dataFilePath(key: SyncedKey): string {
  return join(DATA_DIR, `${key.replace(/\./g, '-')}.json`)
}

const state = new Map<SyncedKey, StoredEntry>()

function loadKey(key: SyncedKey) {
  const filePath = dataFilePath(key)
  if (existsSync(filePath)) {
    state.set(key, JSON.parse(readFileSync(filePath, 'utf-8')) as StoredEntry)
    return
  }

  const seedFile = SEED_FILES[key]
  const value = seedFile ? JSON.parse(readFileSync(join(SEED_DIR, seedFile), 'utf-8')) : HARDCODED_DEFAULTS[key]
  const entry: StoredEntry = { seeded: true, value }
  state.set(key, entry)
  writeFileSync(filePath, JSON.stringify(entry), 'utf-8')
  mirrorFile(filePath)
}

const USERS_FILE = join(DATA_DIR, 'admin-users.json')
let users: AdminUser[] = []

function loadUsers() {
  if (existsSync(USERS_FILE)) {
    users = JSON.parse(readFileSync(USERS_FILE, 'utf-8')) as AdminUser[]
    // Contact info moved from its own top-level `contact` DashboardSection
    // to nest under the new `store` one (see `src/types/sync.ts`) — remap
    // any already-persisted `'contact'` entry so a `limited` account
    // scoped to it before this change doesn't silently lose that access.
    for (const user of users) {
      if (!user.allowedSections) continue
      user.allowedSections = user.allowedSections.map((section) => ((section as string) === 'contact' ? 'store' : section))
    }
    return
  }
  // Seeded on first boot with exactly one account. Plain-text password for
  // v1, matching the explicit "start simple" ask — hashing is a natural
  // low-risk follow-up, not blocking.
  users = [{ id: 'admin', username: 'admin', password: '1234', role: 'admin' }]
  writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf-8')
  mirrorFile(USERS_FILE)
}

const SESSIONS_FILE = join(DATA_DIR, 'sessions.json')
let sessions = new Map<string, SessionInfo>()

function loadSessions() {
  if (!existsSync(SESSIONS_FILE)) return
  const entries = JSON.parse(readFileSync(SESSIONS_FILE, 'utf-8')) as [string, SessionInfo][]
  sessions = new Map(entries)
}

function persistSessions() {
  writeFileSync(SESSIONS_FILE, JSON.stringify([...sessions.entries()]), 'utf-8')
  mirrorFile(SESSIONS_FILE)
}

/** Loads (or seeds, on first boot) every synced key, the admin users file, and any still-valid sessions. Call once at server startup. */
export function load() {
  for (const key of SYNCED_KEYS) loadKey(key)
  loadUsers()
  // Persisted (not just in-memory) so a process restart — e.g. `tsx watch`
  // picking up an edit to a server/ file — doesn't silently log everyone
  // out with a confusing 401 on their very next request.
  loadSessions()
}

export function get(key: SyncedKey): StoredEntry | undefined {
  return state.get(key)
}

/** Persists a real client write — always flips `seeded` to `false` permanently. */
export function set(key: SyncedKey, value: unknown) {
  const entry: StoredEntry = { seeded: false, value }
  state.set(key, entry)
  const filePath = dataFilePath(key)
  writeFileSync(filePath, JSON.stringify(entry), 'utf-8')
  mirrorFile(filePath)
}

/** A snapshot scoped to just `keys` — see "Scoped subscriptions" in the sync-server plan. */
export function snapshot(keys: SyncedKey[]): Partial<Record<SyncedKey, StoredEntry>> {
  const result: Partial<Record<SyncedKey, StoredEntry>> = {}
  for (const key of keys) {
    const entry = state.get(key)
    if (entry) result[key] = entry
  }
  return result
}

export function verifyLogin(username: string, password: string): AdminUser | null {
  return users.find((user) => user.username === username && user.password === password) ?? null
}

function persistUsers() {
  writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf-8')
  mirrorFile(USERS_FILE)
}

/** Every user account, minus its password — for listing in the admin dashboard's own Users tab (see "Add Users" in the codebase's own todo). */
export function listUsers(): Omit<AdminUser, 'password'>[] {
  return users.map((user) => ({ id: user.id, username: user.username, role: user.role, allowedSections: user.allowedSections }))
}

export function findUserById(id: string): AdminUser | undefined {
  return users.find((user) => user.id === id)
}

/** How many accounts currently hold the `admin` role — used to block deleting the very last one, which would leave the dashboard with no admin account able to manage users/roles at all. */
export function adminUserCount(): number {
  return users.filter((user) => user.role === 'admin').length
}

/** Adds a new user account. Returns `null` if `username` is already taken (case-sensitive, matching `verifyLogin`'s own comparison) rather than throwing — the caller (an HTTP route) turns that into a 409. */
export function createUser(input: { username: string; password: string; role: AdminRole; allowedSections?: DashboardSection[] }): Omit<AdminUser, 'password'> | null {
  if (users.some((user) => user.username === input.username)) return null
  const user: AdminUser = { id: randomUUID(), username: input.username, password: input.password, role: input.role, allowedSections: input.allowedSections }
  users.push(user)
  persistUsers()
  return { id: user.id, username: user.username, role: user.role, allowedSections: user.allowedSections }
}

/** Deletes a user by id. Returns `false` if no such user exists — the caller treats that as a 404, not a crash. Every actual authorization check (self-delete, an admin-role target, the last remaining admin) is the HTTP route's own job, not this function's — it only ever removes exactly what it's told to. */
export function deleteUser(id: string): boolean {
  const before = users.length
  users = users.filter((user) => user.id !== id)
  if (users.length === before) return false
  persistUsers()
  return true
}

/** Overwrites a user's password — `admin`/`subadmin`'s own "reset password" action. Returns `false` if no such user exists. */
export function setUserPassword(id: string, password: string): boolean {
  const user = users.find((candidate) => candidate.id === id)
  if (!user) return false
  user.password = password
  persistUsers()
  return true
}

export function createSession(user: AdminUser): { token: string; session: SessionInfo } {
  const token = randomUUID()
  const session: SessionInfo = { username: user.username, role: user.role, allowedSections: user.allowedSections }
  sessions.set(token, session)
  persistSessions()
  return { token, session }
}

export function getSession(token: string): SessionInfo | undefined {
  return sessions.get(token)
}

export function destroySession(token: string) {
  sessions.delete(token)
  persistSessions()
}

// --- Developer API key -------------------------------------------------------
//
// A shared secret the public website's own Netlify Functions check on their
// public write endpoints (see the "Website integration" plan) — a lightweight
// deterrent against blind bot traffic, not a strong secret (it has to be
// embedded in that project's own public client bundle to be usable by real
// visitors). Plain value on disk, same "start simple" precedent as
// `admin-users.json`'s own plain-text passwords above.

const API_KEY_FILE = join(DATA_DIR, 'website-api-key.json')

export function getDeveloperApiKey(): string | null {
  if (!existsSync(API_KEY_FILE)) return null
  return (JSON.parse(readFileSync(API_KEY_FILE, 'utf-8')) as { key: string }).key
}

export function regenerateDeveloperApiKey(): string {
  const key = randomBytes(24).toString('hex')
  writeFileSync(API_KEY_FILE, JSON.stringify({ key }), 'utf-8')
  mirrorFile(API_KEY_FILE)
  return key
}

// --- Neon database URL -------------------------------------------------------
//
// An editable override for the `NEON_DATABASE_URL` environment variable (see
// `neonBridge.ts`), settable from Settings → For developers instead of
// requiring a server restart with a new env var. Once this file exists — even
// holding an explicit `null`, i.e. after hitting "Clear" — it takes
// precedence over the environment variable, so a clear reliably disables the
// bridge even if the env var is still set in the shell that launched `tsx`.

const NEON_URL_FILE = join(DATA_DIR, 'neon-database-url.json')

export function getNeonDatabaseUrl(): string | null {
  if (existsSync(NEON_URL_FILE)) {
    return (JSON.parse(readFileSync(NEON_URL_FILE, 'utf-8')) as { url: string | null }).url
  }
  return process.env.NEON_DATABASE_URL ?? null
}

export function setNeonDatabaseUrl(url: string | null) {
  writeFileSync(NEON_URL_FILE, JSON.stringify({ url }), 'utf-8')
  mirrorFile(NEON_URL_FILE)
}

// How a screen's own `/screens/:screenId` link should be addressed (see
// Settings → Advanced) — same "small standalone file, not a synced key"
// shape as the Neon database URL above, since it's a machine-level setting
// rather than data that needs to sync/broadcast to every connected client.

const SCREEN_ADDRESS_FILE = join(DATA_DIR, 'screen-address-settings.json')

export function getScreenAddressSettings(): ScreenAddressSettings {
  if (existsSync(SCREEN_ADDRESS_FILE)) {
    return JSON.parse(readFileSync(SCREEN_ADDRESS_FILE, 'utf-8')) as ScreenAddressSettings
  }
  return DEFAULT_SCREEN_ADDRESS_SETTINGS
}

export function setScreenAddressSettings(settings: ScreenAddressSettings) {
  writeFileSync(SCREEN_ADDRESS_FILE, JSON.stringify(settings), 'utf-8')
  mirrorFile(SCREEN_ADDRESS_FILE)
}
