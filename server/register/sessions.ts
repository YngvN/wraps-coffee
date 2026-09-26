/**
 * Who is signed in on each register tablet. Staff sign in from the register's staff list: the first
 * time each day on a given register they type their own PIN; after that, tapping their name is enough
 * until Oslo midnight (unless the tablet is set to ask for the PIN every time). A session ends when the
 * tablet has been idle for its logout time (the tablet's own setting, capped here at
 * `MAX_IDLE_MINUTES`), when staff sign out, when the day changes, or when an admin changes or
 * deactivates the member. Five wrong PINs lock the tablet out for five minutes.
 *
 * Sessions and "PIN given today" live in memory only: a server restart signs everyone out and asks
 * for PINs again, which is the safe direction.
 */
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { osloDate } from '../../src/lib/osloTime'
import { isValidPin, verifyPin } from './pinHash'
import type { StaffMember, StaffRole } from './staff'

/** The longest idle time a tablet may choose before it's signed out. */
export const MAX_IDLE_MINUTES = 10
/** Used when a tablet doesn't say. */
export const DEFAULT_IDLE_MINUTES = 2
/** Wrong PINs allowed per tablet before it's locked out… */
export const MAX_FAILED_ATTEMPTS = 5
/** …for this long. */
export const LOCKOUT_MS = 5 * 60_000

/** A signed-in staff member on one tablet. */
export interface StaffSession {
  token: string
  deviceId: string
  register: number
  staffId: string
  name: string
  role: StaffRole
  /** The Oslo day it was opened; it ends when the day changes. */
  day: string
  idleMs: number
  lastUsedAt: number
}

export interface SignInRequest {
  deviceId: string
  register: number
  member: StaffMember | undefined
  /** Absent for a name tap. */
  pin?: unknown
  /** The tablet's "PIN every time" setting. */
  pinEveryTime: boolean
  /** The tablet's logout time; clamped to 1–`MAX_IDLE_MINUTES`. */
  idleMinutes: unknown
}

export type SignInResult =
  | { ok: true; session: StaffSession; method: 'pin' | 'tap'; previousStaffId: string | null }
  | { ok: false; reason: 'unknownStaff' | 'inactive' | 'noPin' | 'pinRequired' | 'wrongPin' | 'lockedOut'; retryAfterMs?: number }

/** Why a session ended, as the journal records it. */
export type SignOutReason = 'manual' | 'idle' | 'dayEnd' | 'staffChanged' | 'replaced'

function clampIdleMinutes(value: unknown): number {
  const minutes = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : DEFAULT_IDLE_MINUTES
  return Math.min(MAX_IDLE_MINUTES, Math.max(1, minutes))
}

export class StaffSessions {
  private readonly sessions = new Map<string, StaffSession>()
  /** `staffId@register` → the Oslo day that member last typed their PIN on that register. */
  private readonly pinGiven = new Map<string, string>()
  private readonly failures = new Map<string, { count: number; lockedUntil: number }>()
  /** The last staff member signed in on each tablet, to notice when the next one takes over a cart. */
  private readonly lastStaff = new Map<string, string>()
  private readonly now: () => Date

  constructor(now: () => Date = () => new Date()) {
    this.now = now
  }

  /** Whether `staffId` must type their PIN to sign in on `register` right now. */
  needsPin(staffId: string, register: number, pinEveryTime: boolean): boolean {
    return pinEveryTime || this.pinGiven.get(`${staffId}@${register}`) !== osloDate(this.now())
  }

  signIn(request: SignInRequest): SignInResult {
    const now = this.now()
    const { member, deviceId, register } = request
    if (!member) return { ok: false, reason: 'unknownStaff' }
    if (!member.active) return { ok: false, reason: 'inactive' }
    if (!member.pin) return { ok: false, reason: 'noPin' }
    const failure = this.failures.get(deviceId) ?? { count: 0, lockedUntil: 0 }
    if (failure.lockedUntil > now.getTime()) return { ok: false, reason: 'lockedOut', retryAfterMs: failure.lockedUntil - now.getTime() }

    let method: 'pin' | 'tap' = 'tap'
    if (request.pin === undefined || request.pin === null || request.pin === '') {
      if (this.needsPin(member.id, register, request.pinEveryTime)) return { ok: false, reason: 'pinRequired' }
    } else {
      if (!isValidPin(request.pin) || !verifyPin(request.pin, member.pin)) {
        const count = failure.count + 1
        if (count >= MAX_FAILED_ATTEMPTS) {
          // The count restarts once the lockout is served, so the next mistake isn't an instant relock.
          this.failures.set(deviceId, { count: 0, lockedUntil: now.getTime() + LOCKOUT_MS })
          return { ok: false, reason: 'lockedOut', retryAfterMs: LOCKOUT_MS }
        }
        this.failures.set(deviceId, { count, lockedUntil: 0 })
        return { ok: false, reason: 'wrongPin' }
      }
      method = 'pin'
      this.pinGiven.set(`${member.id}@${register}`, osloDate(now))
    }

    this.failures.delete(deviceId)
    const session: StaffSession = {
      token: randomBytes(24).toString('hex'),
      deviceId,
      register,
      staffId: member.id,
      name: member.name,
      role: member.role,
      day: osloDate(now),
      idleMs: clampIdleMinutes(request.idleMinutes) * 60_000,
      lastUsedAt: now.getTime(),
    }
    this.sessions.set(deviceId, session)
    const previousStaffId = this.lastStaff.get(deviceId) ?? null
    this.lastStaff.set(deviceId, member.id)
    return { ok: true, session, method, previousStaffId }
  }

  /**
   * The live session for `deviceId` if `token` matches it, counting as use. `null` otherwise. A session
   * that has run out is ended here, and reported through `onExpired` so it can be journaled.
   */
  check(deviceId: string, token: unknown, onExpired?: (session: StaffSession, reason: SignOutReason) => void): StaffSession | null {
    const session = this.sessions.get(deviceId)
    if (!session || typeof token !== 'string') return null
    const expected = Buffer.from(session.token)
    const actual = Buffer.from(token)
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null
    const now = this.now()
    const reason: SignOutReason | null = osloDate(now) !== session.day ? 'dayEnd' : now.getTime() - session.lastUsedAt > session.idleMs ? 'idle' : null
    if (reason) {
      this.sessions.delete(deviceId)
      onExpired?.(session, reason)
      return null
    }
    session.lastUsedAt = now.getTime()
    return session
  }

  /** Who is signed in on `deviceId`, without counting as use or checking expiry. */
  peek(deviceId: string): StaffSession | null {
    return this.sessions.get(deviceId) ?? null
  }

  /** Signs out whoever is signed in on `deviceId`, returning their session. */
  signOut(deviceId: string): StaffSession | null {
    const session = this.sessions.get(deviceId) ?? null
    this.sessions.delete(deviceId)
    return session
  }

  /** Ends every session of `staffId` and forgets their PIN for today — after an admin changes or deactivates them. */
  endAllFor(staffId: string): StaffSession[] {
    const ended = [...this.sessions.values()].filter((session) => session.staffId === staffId)
    for (const session of ended) this.sessions.delete(session.deviceId)
    for (const key of [...this.pinGiven.keys()]) if (key.startsWith(`${staffId}@`)) this.pinGiven.delete(key)
    return ended
  }
}
