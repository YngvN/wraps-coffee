import { randomBytes, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEFAULT_EXTENSIONS_CONFIG } from '../src/types/extensions'
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
  'admin.messages': 'messages.json',
  'admin.events': 'events.json',
  'admin.contactInfo': 'contactInfo.json',
  'admin.textSizePresets': 'textSizePresets.json',
  'admin.screensaverClockFormat': null,
  'admin.screenLockPin': null,
  'admin.screensaverSchedule': null,
  'admin.screens': 'screens.json',
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
  'admin.screensaverClockFormat': '24h',
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
}

const USERS_FILE = join(DATA_DIR, 'admin-users.json')
let users: AdminUser[] = []

function loadUsers() {
  if (existsSync(USERS_FILE)) {
    users = JSON.parse(readFileSync(USERS_FILE, 'utf-8')) as AdminUser[]
    return
  }
  // Seeded on first boot with exactly one account. Plain-text password for
  // v1, matching the explicit "start simple" ask — hashing is a natural
  // low-risk follow-up, not blocking.
  users = [{ id: 'admin', username: 'admin', password: '1234', role: 'admin' }]
  writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf-8')
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
  writeFileSync(dataFilePath(key), JSON.stringify(entry), 'utf-8')
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
  return key
}
