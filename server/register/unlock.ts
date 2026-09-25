/**
 * The Register's staff lock. An admin sets a 4–6 digit PIN in Settings; the server keeps only a
 * salted scrypt hash of it (`register-pin.json`, never a synced key, since every display can read
 * those). A tablet that sends the right PIN gets a short-lived token bound to that tablet, which the
 * product-editing and barcode-saving routes require. Tokens live in memory only: a server restart
 * simply locks every register again.
 */
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { readDataFile, writeDataFile } from '../dataFile'

/** A stored PIN: never the PIN itself. */
export interface PinRecord {
  salt: string
  hash: string
}

const PIN_FILE = 'register-pin.json'

/** A token expires this long after its last use… */
export const UNLOCK_IDLE_MS = 2 * 60_000
/** …and this long after it was issued, however busy the register is. */
export const UNLOCK_ABSOLUTE_MS = 10 * 60_000
/** Wrong PINs allowed per tablet before it's locked out… */
export const MAX_FAILED_ATTEMPTS = 5
/** …for this long. */
export const LOCKOUT_MS = 5 * 60_000

/** Whether `pin` has the accepted shape: 4 to 6 digits. */
export function isValidPin(pin: unknown): pin is string {
  return typeof pin === 'string' && /^\d{4,6}$/.test(pin)
}

/** Hashes `pin` with a fresh salt. */
export function hashPin(pin: string): PinRecord {
  const salt = randomBytes(16).toString('hex')
  return { salt, hash: scryptSync(pin, salt, 32).toString('hex') }
}

/** Constant-time check of `pin` against `record`. */
export function verifyPin(pin: string, record: PinRecord): boolean {
  const actual = scryptSync(pin, record.salt, 32)
  const expected = Buffer.from(record.hash, 'hex')
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

/** The stored PIN, or `null` when none is set (then the register can't be unlocked at all). */
export function readPinRecord(): PinRecord | null {
  return readDataFile<PinRecord | null>(PIN_FILE, null)
}

/** Stores a new PIN (hashed), or removes it with `null`. */
export function writePin(pin: string | null): void {
  writeDataFile(PIN_FILE, pin === null ? null : hashPin(pin))
}

/** Outcome of an unlock attempt. `retryAfterMs` tells a locked-out tablet how long to wait. */
export type UnlockResult = { ok: true; token: string; expiresAt: number } | { ok: false; reason: 'noPin' | 'wrongPin' | 'lockedOut'; retryAfterMs?: number }

interface TokenState {
  token: string
  issuedAt: number
  lastUsedAt: number
}

/** Issues and checks unlock tokens, and counts failed attempts, per tablet. The clock is injectable for tests. */
export class UnlockManager {
  private tokens = new Map<string, TokenState>()
  private failures = new Map<string, { count: number; lockedUntil: number }>()
  private readonly now: () => number

  constructor(now: () => number = Date.now) {
    this.now = now
  }

  /** Tries `pin` for `deviceId` against `record`. */
  attempt(deviceId: string, pin: string, record: PinRecord | null): UnlockResult {
    const now = this.now()
    if (!record) return { ok: false, reason: 'noPin' }
    const failure = this.failures.get(deviceId) ?? { count: 0, lockedUntil: 0 }
    if (failure.lockedUntil > now) return { ok: false, reason: 'lockedOut', retryAfterMs: failure.lockedUntil - now }

    if (!isValidPin(pin) || !verifyPin(pin, record)) {
      const count = failure.count + 1
      if (count >= MAX_FAILED_ATTEMPTS) {
        // The count restarts once the lockout is served, so the next mistake isn't an instant relock.
        this.failures.set(deviceId, { count: 0, lockedUntil: now + LOCKOUT_MS })
        return { ok: false, reason: 'lockedOut', retryAfterMs: LOCKOUT_MS }
      }
      this.failures.set(deviceId, { count, lockedUntil: 0 })
      return { ok: false, reason: 'wrongPin' }
    }

    this.failures.delete(deviceId)
    const token = randomBytes(24).toString('hex')
    this.tokens.set(deviceId, { token, issuedAt: now, lastUsedAt: now })
    return { ok: true, token, expiresAt: now + UNLOCK_IDLE_MS }
  }

  /** Whether `token` is the live token for `deviceId`. A successful check counts as use and extends the idle window. */
  check(deviceId: string, token: unknown): boolean {
    const state = this.tokens.get(deviceId)
    if (!state || typeof token !== 'string') return false
    const now = this.now()
    const expected = Buffer.from(state.token)
    const actual = Buffer.from(token)
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return false
    if (now - state.lastUsedAt > UNLOCK_IDLE_MS || now - state.issuedAt > UNLOCK_ABSOLUTE_MS) {
      this.tokens.delete(deviceId)
      return false
    }
    state.lastUsedAt = now
    return true
  }

  /** Locks `deviceId` again straight away. */
  lock(deviceId: string): void {
    this.tokens.delete(deviceId)
  }

  /** Locks every tablet — used when the PIN changes, so an old unlock never outlives it. */
  lockAll(): void {
    this.tokens.clear()
  }
}
