/**
 * Live poll-health for a delivery-platform integration (Wolt or Foodora),
 * reported by the local server's own background poller (see
 * `server/woltPoller.ts`/`server/foodoraPoller.ts`) after every sync
 * attempt — read by the
 * Integrations page's own status dot and "last synced" line so an admin can
 * tell whether it's actually working without leaving the dashboard. Purely
 * a live status signal, not configuration — same posture as
 * `ExtensionsConfig['weather']['locationStatus']`.
 */
export interface DeliveryProviderStatus {
  state: 'live' | 'stale' | 'error' | 'disabled'
  updatedAt: number
  /** The last error's message, shown in the card when `state === 'error'`. */
  detail?: string
  /** ISO date-time of the most recently synced order, for the card's "last order" line. */
  lastOrderAt?: string
}

/**
 * Cafe-wide, non-secret configuration for the Wolt delivery-order
 * integration, edited from the admin's Integrations tab. The actual API
 * credentials (venue id + API key) are deliberately NOT part of this —
 * unlike this config, they're a secret, so they're stored server-side only
 * and fetched/set over an authenticated HTTP route (see
 * `getWoltCredentials`/`setWoltCredentials` in `src/lib/localServer.ts`),
 * never broadcast to every LAN device the way a `SyncedKey` value is.
 */
export interface WoltConfig {
  enabled: boolean
  status: DeliveryProviderStatus
}

/** Starting values for a cafe that hasn't configured the Wolt integration yet. */
export const DEFAULT_WOLT_CONFIG: WoltConfig = {
  enabled: false,
  status: { state: 'disabled', updatedAt: 0 },
}

/**
 * Wolt's own POS Integration API credentials for this cafe's venue — a
 * secret, so (unlike `WoltConfig` above) never part of a `SyncedKey`; only
 * ever fetched/set over the authenticated `/wolt/credentials` route (see
 * `getWoltCredentials`/`setWoltCredentials` in `src/lib/localServer.ts`).
 * Mirrors `WoltCredentials` in `server/store.ts` — kept in sync by hand
 * since the server module isn't importable from client code.
 * `useDevelopmentEnvironment` (Settings → Testing → Wolt) picks which of
 * Wolt's own base URLs the server calls: the confirmed development/test
 * host while checked, Wolt's production host once unchecked.
 */
export interface WoltCredentials {
  venueId: string | null
  apiKey: string | null
  useDevelopmentEnvironment: boolean
}

/**
 * Cafe-wide, non-secret configuration for the Foodora delivery-order
 * integration — same shape and posture as `WoltConfig` above; credentials
 * live server-side only (see `FoodoraCredentials` below).
 */
export interface FoodoraConfig {
  enabled: boolean
  status: DeliveryProviderStatus
}

/** Starting values for a cafe that hasn't configured the Foodora integration yet. */
export const DEFAULT_FOODORA_CONFIG: FoodoraConfig = {
  enabled: false,
  status: { state: 'disabled', updatedAt: 0 },
}

/**
 * Foodora's own POS Integration API credentials for this cafe's venue —
 * same posture as `WoltCredentials` above (a secret, never part of a
 * `SyncedKey`, fetched/set over the authenticated `/foodora/credentials`
 * route). TODO: this is a placeholder shape (`venueId`/`apiKey`, mirroring
 * Wolt's own) — Foodora's real field names are unverified; no partner docs
 * exist yet to confirm them against. `useDevelopmentEnvironment` (Settings
 * → Testing → Foodora) is wired the same way as Wolt's, but has no real
 * hostname to pick between yet — see `server/foodoraAdapter.ts`.
 */
export interface FoodoraCredentials {
  venueId: string | null
  apiKey: string | null
  useDevelopmentEnvironment: boolean
}
