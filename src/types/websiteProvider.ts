/**
 * The platforms this dashboard can connect a public website on, and the setup
 * steps each one needs.
 *
 * **Only Netlify is supported today.** The others are listed so the picker
 * shows what is and isn't possible rather than implying Netlify is the only
 * platform that exists — and because the shape of "which steps does this
 * provider need" is worth having before a second one arrives.
 *
 * A caveat worth keeping in mind before adding one: Squarespace and WordPress
 * have no Postgres database, so connecting to either would be a different
 * mechanism entirely (a REST API, or a plugin), not a different way to obtain
 * a connection string. The step list below is deliberately just a list — it
 * does not pretend to abstract over a mechanism that doesn't exist yet.
 */

export type WebsiteProviderId = 'netlify' | 'squarespace' | 'wordpress' | 'other'

/**
 * One screen of the setup flow.
 *
 * - `prerequisite` — confirm the site is already published; this dashboard
 *   can neither create nor verify a deploy.
 * - `keys` — copy the developer key into the site's own environment.
 * - `database` — paste the database connection string.
 * - `address` — paste the site's public URL (optional; enables instant updates).
 * - `test` — run the real connection checks and report in plain language.
 */
export type WebsiteSetupStepId = 'prerequisite' | 'keys' | 'database' | 'address' | 'test'

export interface WebsiteProvider {
  id: WebsiteProviderId
  /** False renders the row disabled with a "not supported yet" note instead of opening the flow. */
  supported: boolean
  /** The provider's steps, in order. Empty for an unsupported provider. */
  steps: WebsiteSetupStepId[]
}

/** Every provider the picker offers, in display order. */
export const WEBSITE_PROVIDERS: WebsiteProvider[] = [
  { id: 'netlify', supported: true, steps: ['prerequisite', 'keys', 'database', 'address', 'test'] },
  { id: 'squarespace', supported: false, steps: [] },
  { id: 'wordpress', supported: false, steps: [] },
  { id: 'other', supported: false, steps: [] },
]

/** Looks up a provider by id. */
export function findWebsiteProvider(id: WebsiteProviderId): WebsiteProvider | undefined {
  return WEBSITE_PROVIDERS.find((provider) => provider.id === id)
}

// --- connection test ----------------------------------------------------------

/**
 * The individual checks `POST /neon-url/test` runs, in the order they're
 * reported. Each one maps to a distinct thing that can be misconfigured, so a
 * failure points at a specific fix rather than "it didn't work".
 */
export type WebsiteCheckId = 'database' | 'tables' | 'website'

/** `skipped` covers a check that couldn't run — an optional value wasn't set, or an earlier check already failed. */
export type WebsiteCheckStatus = 'ok' | 'warning' | 'failed' | 'skipped'

export interface WebsiteCheckResult {
  id: WebsiteCheckId
  status: WebsiteCheckStatus
  /**
   * Which known cause this was, used to pick the explanation shown to the
   * user. Never a raw driver message: `pg` errors carry the database host and
   * sometimes credentials, and this crosses to the browser.
   */
  reason?: WebsiteCheckReason
}

/** The fixed set of diagnoses the test can return — see `websiteConnectionTest.ts`. */
export type WebsiteCheckReason =
  | 'notConfigured'
  | 'unreachable'
  | 'authFailed'
  | 'missingTables'
  | 'notFound'
  | 'unauthorized'
  | 'unknown'

export interface WebsiteConnectionTestResult {
  checks: WebsiteCheckResult[]
}
