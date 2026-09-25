/**
 * Payment-provider credentials. Secrets, so server-only files in `server/data/` (mirrored to the
 * backup like `wolt-credentials.json`), never a synced key every display can read. Each has a
 * `useDevelopmentEnvironment` flag, toggled in Settings → Testing, choosing the provider's test
 * environment over production.
 */
import { readDataFile, writeDataFile } from '../dataFile'

import type { VippsCredentials, ZettleCredentials } from '../../src/types/payments'

export type { VippsCredentials, ZettleCredentials }

const VIPPS_FILE = 'vipps-credentials.json'
const ZETTLE_FILE = 'zettle-credentials.json'

const EMPTY_VIPPS: VippsCredentials = { clientId: null, clientSecret: null, subscriptionKey: null, merchantSerialNumber: null, useDevelopmentEnvironment: false }
const EMPTY_ZETTLE: ZettleCredentials = { clientId: null, useDevelopmentEnvironment: false }

/** The saved Vipps credentials, with defaults for anything missing. */
export function getVippsCredentials(): VippsCredentials {
  return { ...EMPTY_VIPPS, ...readDataFile<Partial<VippsCredentials>>(VIPPS_FILE, {}) }
}

export function setVippsCredentials(credentials: VippsCredentials): void {
  writeDataFile(VIPPS_FILE, credentials)
}

/** The saved Zettle credentials, with defaults for anything missing. */
export function getZettleCredentials(): ZettleCredentials {
  return { ...EMPTY_ZETTLE, ...readDataFile<Partial<ZettleCredentials>>(ZETTLE_FILE, {}) }
}

export function setZettleCredentials(credentials: ZettleCredentials): void {
  writeDataFile(ZETTLE_FILE, credentials)
}

/** Turns an untrusted request body into credentials: strings are trimmed, blanks become `null`. */
export function parseCredentials<T extends object>(body: unknown, empty: T): T {
  const input = (body ?? {}) as Record<string, unknown>
  const result = { ...empty } as Record<string, unknown>
  for (const key of Object.keys(empty)) {
    const value = input[key]
    if (typeof (empty as Record<string, unknown>)[key] === 'boolean') result[key] = value === true
    else result[key] = typeof value === 'string' && value.trim() ? value.trim() : null
  }
  return result as T
}

/** Empty credential shapes, for `parseCredentials`. */
export const EMPTY_CREDENTIALS = { vipps: EMPTY_VIPPS, zettle: EMPTY_ZETTLE }
