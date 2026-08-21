import { Client } from 'pg'
import type { WebsiteCheckReason, WebsiteCheckResult, WebsiteConnectionTestResult } from '../src/types/websiteProvider'
import * as store from './store'

/**
 * Diagnoses the connection between this dashboard and the public website,
 * for the guided setup in Settings → Connect to website.
 *
 * **Why this exists rather than "just save and watch for errors".** Saving the
 * settings does tell you something eventually — the bridge fails and an error
 * toast appears seconds later, naming whichever sync key happened to run
 * first. That is useless to someone who doesn't know what a sync key is, and
 * it can't distinguish "wrong password" from "the website hasn't deployed
 * yet" from "the two halves disagree about the shared secret". Each check
 * below isolates one thing that can be misconfigured, so the answer points at
 * a specific fix.
 *
 * **Nothing here is a secret.** `pg` errors carry the database host and
 * sometimes the credentials themselves, and this result crosses to the
 * browser. Every failure is therefore mapped to one of a fixed set of
 * `WebsiteCheckReason` values and the raw error is only ever logged
 * server-side — same posture as the website's own `withErrorHandling`.
 *
 * Read-only: it opens its own short-lived connection and never writes, so
 * running it is safe at any time and does not disturb the live bridge.
 */

/** Long enough for a suspended serverless database to wake, short enough that the UI isn't left hanging. */
const CONNECT_TIMEOUT_MS = 15_000

/** The website check must not hang the whole test on an unreachable host. */
const WEBSITE_TIMEOUT_MS = 10_000

/** Every table the bridge reads or writes — see `neonMappers.ts`. All are created by the website's own first deploy. */
const REQUIRED_TABLES = ['products', 'category_prices', 'events', 'contact_info', 'messages', 'orders', 'message_board', 'site_theme']

/**
 * Classifies a driver error into one of the reasons the UI can explain.
 *
 * @param error Whatever `pg` threw.
 * @returns The matching reason, or `'unknown'` when it isn't one we recognise.
 */
function classifyDatabaseError(error: unknown): WebsiteCheckReason {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String((error as { code: unknown }).code) : ''

  // 28P01 invalid password, 28000 invalid authorization specification.
  if (code === '28P01' || code === '28000') return 'authFailed'
  // 3D000 database does not exist — in practice a mistyped connection string.
  if (code === '3D000') return 'unreachable'
  if (code === 'ENOTFOUND' || code === 'ECONNREFUSED' || code === 'ETIMEDOUT' || code === 'EAI_AGAIN') return 'unreachable'

  // A failed TCP connect arrives as an AggregateError whose own message is
  // empty; its inner errors carry the real code.
  if (error instanceof AggregateError) {
    for (const inner of error.errors) {
      const innerReason = classifyDatabaseError(inner)
      if (innerReason !== 'unknown') return innerReason
    }
    return 'unreachable'
  }

  return 'unknown'
}

/** Checks the database half: reachable, and carrying the tables the website creates on its first deploy. */
async function checkDatabase(): Promise<WebsiteCheckResult[]> {
  const connectionString = store.getNeonDatabaseUrl()
  if (!connectionString) {
    return [
      { id: 'database', status: 'failed', reason: 'notConfigured' },
      { id: 'tables', status: 'skipped' },
    ]
  }

  const client = new Client({ connectionString, connectionTimeoutMillis: CONNECT_TIMEOUT_MS })

  try {
    await client.connect()
  } catch (error) {
    console.error('[neon] connection test failed to connect:', error)
    return [
      { id: 'database', status: 'failed', reason: classifyDatabaseError(error) },
      { id: 'tables', status: 'skipped' },
    ]
  }

  try {
    const { rows } = await client.query<{ table_name: string }>(
      `select table_name from information_schema.tables where table_schema = 'public' and table_name = any($1)`,
      [REQUIRED_TABLES],
    )
    const present = new Set(rows.map((row) => row.table_name))
    const missing = REQUIRED_TABLES.filter((table) => !present.has(table))

    if (missing.length > 0) {
      console.warn(`[neon] connection test: missing tables — ${missing.join(', ')}`)
      return [
        { id: 'database', status: 'ok' },
        { id: 'tables', status: 'failed', reason: 'missingTables' },
      ]
    }

    return [
      { id: 'database', status: 'ok' },
      { id: 'tables', status: 'ok' },
    ]
  } catch (error) {
    console.error('[neon] connection test failed while querying:', error)
    return [
      { id: 'database', status: 'ok' },
      { id: 'tables', status: 'failed', reason: classifyDatabaseError(error) },
    ]
  } finally {
    await client.end().catch(() => {})
  }
}

/**
 * Checks the website half by calling its own cache-purge endpoint with the
 * developer key.
 *
 * This is the only way to find out whether the two Netlify environment
 * variables were actually set, and set to *this* key — a mismatch is
 * otherwise completely invisible until an edit silently fails to appear on
 * the live site. A 401 says the key is wrong; a 404 says the address is.
 *
 * Purging an already-fresh cache is harmless, which is what makes it usable
 * as a probe.
 */
async function checkWebsite(): Promise<WebsiteCheckResult> {
  const websiteUrl = store.getWebsiteUrl()
  // Optional by design — the site works without it, just with slower updates.
  if (!websiteUrl) return { id: 'website', status: 'skipped' }

  const apiKey = store.getDeveloperApiKey()
  if (!apiKey) return { id: 'website', status: 'failed', reason: 'notConfigured' }

  try {
    const response = await fetch(`${websiteUrl}/.netlify/functions/purge-cache`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ tags: ['menu'] }),
      signal: AbortSignal.timeout(WEBSITE_TIMEOUT_MS),
    })

    if (response.ok) return { id: 'website', status: 'ok' }
    if (response.status === 401) return { id: 'website', status: 'failed', reason: 'unauthorized' }
    // 404 is the obvious "no such endpoint"; 400 lands here too, because a
    // *different* site answering at this address rejects the request as
    // malformed rather than as missing. Both mean the same thing to the person
    // reading it — this address isn't the website we're looking for — and our
    // own endpoint never returns 400 for the well-formed body sent above.
    if (response.status === 404 || response.status === 400) return { id: 'website', status: 'failed', reason: 'notFound' }

    console.warn(`[neon] connection test: website returned ${response.status}`)
    return { id: 'website', status: 'failed', reason: 'unknown' }
  } catch (error) {
    console.error('[neon] connection test failed to reach the website:', error)
    return { id: 'website', status: 'failed', reason: 'unreachable' }
  }
}

/**
 * Runs every check and returns one result per check.
 *
 * Never throws and never rejects: a diagnostic that can itself fail opaquely
 * would defeat its own purpose.
 *
 * @returns One `WebsiteCheckResult` per check, in display order.
 */
export async function testWebsiteConnection(): Promise<WebsiteConnectionTestResult> {
  // Run in parallel: the website check doesn't depend on the database one, and
  // both can spend seconds waiting on a network round trip.
  const [databaseChecks, websiteCheck] = await Promise.all([checkDatabase(), checkWebsite()])
  return { checks: [...databaseChecks, websiteCheck] }
}
