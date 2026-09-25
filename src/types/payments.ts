/**
 * Vipps MobilePay ePayment API keys for one sales unit, from the merchant portal once "Payment
 * integration" is ordered. The header names these feed are confirmed in their docs (2026-09-25):
 * `Ocp-Apim-Subscription-Key` and `Merchant-Serial-Number`; `clientId`/`clientSecret` are for the
 * access token. Server-only (`server/payments/credentials.ts`); the admin reads them over an
 * authenticated route, never through a synced key.
 */
export interface VippsCredentials {
  clientId: string | null
  clientSecret: string | null
  subscriptionKey: string | null
  merchantSerialNumber: string | null
  /** Settings → Testing: use Vipps' test environment (MT) instead of production. */
  useDevelopmentEnvironment: boolean
}

/**
 * Zettle Developer Portal app credentials. The card reader (Zettle Reader 2, Bluetooth) is driven by
 * Zettle's native Android SDK on the tablet, which authenticates with an OAuth client id and a
 * redirect URL registered on the portal. TODO: confirm the exact fields the SDK and Zettle's
 * purchase-lookup API need once a developer account exists — only the client id is certain.
 */
export interface ZettleCredentials {
  clientId: string | null
  /** Settings → Testing: run the SDK in its developer mode instead of taking real payments. */
  useDevelopmentEnvironment: boolean
}

/** Which payment integration's credentials a route or form is about. */
export type PaymentCredentialsKind = 'vipps' | 'zettle'

/** The credentials shape for each kind. */
export interface PaymentCredentialsByKind {
  vipps: VippsCredentials
  zettle: ZettleCredentials
}
