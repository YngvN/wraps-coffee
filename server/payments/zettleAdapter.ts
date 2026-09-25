/**
 * Zettle (PayPal) card payments — scaffolding, no live payments yet.
 *
 * The café's reader is a **Zettle Reader 2 (Bluetooth)**. That reader is only reachable through
 * Zettle's native Android SDK running in the Companion app on the tablet — not from this server. So
 * `start` here only tells the register "take it on the device"; the tablet then calls the SDK over
 * the Companion bridge (`chargeWithZettle` in `src/lib/companionBridge.ts`) and reports the outcome
 * back (`POST /register/payments/:id/device-result`).
 *
 * Confirmed from developer.zettle.com and the SDK's GitHub on 2026-09-25: the Android SDK is
 * distributed through GitHub Packages (needs a GitHub token to build), authenticates with an OAuth
 * client id and redirect URL from the Zettle Developer Portal, has a developer mode for testing, and
 * Norway is a supported market. A single-merchant ("self-hosted") app needs no partner approval.
 *
 * TODO (not confirmed — do not fill in from memory):
 * - the SDK's current version, minimum Android API level, and its payment/refund call shapes;
 * - Zettle's REST purchase-lookup endpoint and OAuth scopes, for the server to verify a payment the
 *   tablet reports (until then a device-reported payment is trusted like a manual "Paid by card");
 * - refunds (the SDK has a refund flow; whether it needs the original card present is unconfirmed).
 */
import type { PaymentProvider } from './types'
import type { ZettleCredentials } from './credentials'

/** Whether a Zettle app has been registered (Integrations page). */
export function zettleConfigured(credentials: ZettleCredentials): boolean {
  return Boolean(credentials.clientId)
}

function notYet(credentials: ZettleCredentials, what: string): never {
  if (!zettleConfigured(credentials)) throw new Error('Zettle is not configured — add its app credentials on the Integrations page')
  throw new Error(`Zettle ${what} is not implemented yet — pending a Zettle developer account and the native SDK in the Companion app`)
}

/** The Zettle provider, bound to a way of reading the current credentials. */
export function createZettleProvider(readCredentials: () => ZettleCredentials): PaymentProvider {
  return {
    id: 'zettle',
    method: 'card',
    isConfigured: () => zettleConfigured(readCredentials()),
    // TODO: set to `true` once the Companion app has the Zettle SDK and a real payment has been taken in developer mode.
    live: false,
    start: async () => {
      if (!zettleConfigured(readCredentials())) notYet(readCredentials(), 'payment start')
      return { kind: 'device', action: 'zettle-charge' }
    },
    // TODO: look the purchase up through Zettle's REST API once its endpoint and scopes are confirmed.
    status: async () => notYet(readCredentials(), 'status check'),
    // TODO: a reader payment in progress is cancelled on the device through the SDK, not here.
    cancel: async () => notYet(readCredentials(), 'cancel'),
    // TODO: SDK refund flow, see the header.
    refund: async () => notYet(readCredentials(), 'refund'),
  }
}
