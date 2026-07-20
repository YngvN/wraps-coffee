import type { OrderRecord, OrderStatus } from '../src/types/order'
import type { WoltCredentials } from './store'

/** Wolt's own POS Integration API — development/test environment, confirmed directly against this host (probing its root, `/docs`, `/openapi.json` and `/health` all returned 404 with no public spec exposed, consistent with it being a gated partner API). Picked via the "Use development environment" checkbox in Settings → Testing. */
const WOLT_API_BASE_URL_DEVELOPMENT = 'https://pos-integration-service.development.dev.woltapi.com'
/** Wolt's own POS Integration API — production. Used whenever the Testing checkbox is unchecked (the default). */
const WOLT_API_BASE_URL_PRODUCTION = 'https://pos-integration-service.wolt.com'

/**
 * The base URL to call for this venue, per its own saved
 * `useDevelopmentEnvironment` flag (Settings → Testing → Wolt). TODO: exact
 * endpoint paths, auth header shape, and request/response payloads under
 * either base URL still need confirming against Wolt's own partner docs
 * once sandbox/production credentials are issued — nothing past the
 * hostnames themselves is verified yet.
 */
function woltApiBaseUrl(credentials: WoltCredentials): string {
  return credentials.useDevelopmentEnvironment ? WOLT_API_BASE_URL_DEVELOPMENT : WOLT_API_BASE_URL_PRODUCTION
}

/**
 * Fetches this venue's current/recent orders from Wolt. Returns `[]` (not
 * an error) when credentials aren't set, so the poller can call this
 * unconditionally. Throws on any other failure — deliberately, so the
 * poller's error/status-dot path is real and testable even before this
 * function's body is implemented for real.
 */
export async function fetchOrders(credentials: WoltCredentials): Promise<OrderRecord[]> {
  if (!credentials.apiKey || !credentials.venueId) return []

  // TODO: confirm the exact endpoint path, auth header shape (bearer
  // token? Basic auth with venueId:apiKey? a custom header?), and response
  // payload shape against Wolt's own partner API docs once access exists.
  throw new Error(`Wolt integration not yet configured — pending partner API access (base URL: ${woltApiBaseUrl(credentials)}, venue ${credentials.venueId})`)
}

/** Pushes a local status change for one order up to Wolt. Throws until this is implemented for real — see `fetchOrders`'s doc comment. */
export async function pushStatus(credentials: WoltCredentials, externalId: string, status: OrderStatus): Promise<void> {
  if (!credentials.apiKey || !credentials.venueId) throw new Error('Wolt credentials are not configured')

  // TODO: confirm the exact endpoint path, method, and payload shape
  // against Wolt's own partner API docs once access exists.
  throw new Error(`Wolt status push not yet configured — pending partner API access (base URL: ${woltApiBaseUrl(credentials)}, order ${externalId} -> "${status}")`)
}

/**
 * Maps Wolt's own order-status vocabulary to this app's `OrderStatus`.
 * TODO: placeholder mapping — confirm Wolt's real status strings against
 * their partner docs once access exists; until then this is only ever
 * reached from code paths that never actually run (`fetchOrders` throws
 * before producing any raw Wolt order data to map).
 */
export function mapWoltStatus(woltStatus: string): OrderStatus {
  switch (woltStatus) {
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
