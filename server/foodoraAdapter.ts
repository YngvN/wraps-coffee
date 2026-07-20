import type { OrderRecord, OrderStatus } from '../src/types/order'
import type { FoodoraCredentials } from './store'

/**
 * Foodora's own POS Integration API — unlike Wolt, no base URL has been
 * confirmed yet (no partner docs, no dev/test host handed over). TODO: fill
 * these in once you have Foodora partner access — see `woltAdapter.ts` for
 * the equivalent constants once a real value exists here.
 */
const FOODORA_API_BASE_URL_DEVELOPMENT = ''
/** Foodora's own POS Integration API — production. Same TODO as the development URL above. */
const FOODORA_API_BASE_URL_PRODUCTION = ''

/**
 * The base URL to call for this venue, per its own saved
 * `useDevelopmentEnvironment` flag (Settings → Testing → Foodora) — see
 * `woltAdapter.ts`'s `woltApiBaseUrl` for the equivalent once Wolt's own
 * hostnames were confirmed. Both Foodora constants above are still empty.
 */
function foodoraApiBaseUrl(credentials: FoodoraCredentials): string {
  return credentials.useDevelopmentEnvironment ? FOODORA_API_BASE_URL_DEVELOPMENT : FOODORA_API_BASE_URL_PRODUCTION
}

/**
 * Fetches this venue's current/recent orders from Foodora. Returns `[]`
 * (not an error) when credentials aren't set, so the poller can call this
 * unconditionally. Throws on any other failure — deliberately, so the
 * poller's error/status-dot path is real and testable even before this
 * function's body is implemented for real.
 */
export async function fetchOrders(credentials: FoodoraCredentials): Promise<OrderRecord[]> {
  if (!credentials.apiKey || !credentials.venueId) return []

  // TODO: no base URL, endpoint path, auth header shape, or response
  // payload shape is confirmed yet — nothing here can be implemented for
  // real until Foodora partner docs (and ideally a dev/test host, like
  // Wolt's) are available.
  const baseUrl = foodoraApiBaseUrl(credentials)
  throw new Error(`Foodora integration not yet configured — no partner API access or base URL set yet (base URL: ${baseUrl || '(none configured)'}, venue ${credentials.venueId})`)
}

/** Pushes a local status change for one order up to Foodora. Throws until this is implemented for real — see `fetchOrders`'s doc comment. */
export async function pushStatus(credentials: FoodoraCredentials, externalId: string, status: OrderStatus): Promise<void> {
  if (!credentials.apiKey || !credentials.venueId) throw new Error('Foodora credentials are not configured')

  // TODO: same — confirm endpoint path, method, and payload shape once
  // partner docs and a base URL exist.
  const baseUrl = foodoraApiBaseUrl(credentials)
  throw new Error(`Foodora status push not yet configured — no partner API access or base URL set yet (base URL: ${baseUrl || '(none configured)'}, order ${externalId} -> "${status}")`)
}

/**
 * Maps Foodora's own order-status vocabulary to this app's `OrderStatus`.
 * TODO: placeholder mapping — confirm Foodora's real status strings against
 * their partner docs once access exists; until then this is only ever
 * reached from code paths that never actually run (`fetchOrders` throws
 * before producing any raw Foodora order data to map).
 */
export function mapFoodoraStatus(foodoraStatus: string): OrderStatus {
  switch (foodoraStatus) {
    case 'received':
      return 'received'
    case 'accepted':
      return 'accepted'
    case 'preparing':
      return 'preparing'
    case 'ready':
    case 'ready-for-pickup':
      return 'ready'
    case 'delivered':
    case 'completed':
      return 'completed'
    case 'rejected':
    case 'cancelled':
      return 'cancelled'
    default:
      return 'received'
  }
}
