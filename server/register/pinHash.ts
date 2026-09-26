/**
 * Staff PINs are stored only as salted scrypt hashes, in a server-only file (never a synced key,
 * since every display can read those).
 */
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

/** A stored PIN: never the PIN itself. */
export interface PinRecord {
  salt: string
  hash: string
}

/** Whether `pin` has the accepted shape: exactly 4 digits. */
export function isValidPin(pin: unknown): pin is string {
  return typeof pin === 'string' && /^\d{4}$/.test(pin)
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
