/**
 * The admin dashboard's calls to the local server for the Register — the staff PIN, the barcode
 * lookup behind the product editor's "Look up", changing a counter sale's status from the Orders
 * view, and the payment integrations' credentials. Every call carries the admin's session token;
 * the tablet's own calls are in `registerApi.ts`.
 */
import type { BarcodeLookupResult } from '../types/barcode'
import type { OrderStatus } from '../types/order'
import type { PaymentCredentialsByKind, PaymentCredentialsKind } from '../types/payments'
import { serverBaseUrl } from './localServer'

/** Throws the server's own message for a failed response. */
function unexpected(status: number, body: unknown): never {
  throw new Error((body as { error?: string })?.error ?? `The server answered ${status}`)
}

/** Admin only: changes one counter sale's status from the Orders view (`POST /register/orders/:id/status`), one order at a time like the board. */
export async function pushRegisterOrderStatus(token: string, orderId: string, status: OrderStatus): Promise<void> {
  const response = await fetch(`${serverBaseUrl()}/register/orders/${encodeURIComponent(orderId)}/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ status }),
  })
  if (!response.ok) unexpected(response.status, await response.json().catch(() => ({})))
}

/** Admin only: whether a staff PIN is set for the registers (never the PIN itself). */
export async function fetchRegisterPinStatus(token: string): Promise<boolean> {
  const response = await fetch(`${serverBaseUrl()}/register/pin`, { headers: { Authorization: `Bearer ${token}` } })
  const body = (await response.json().catch(() => ({}))) as { isSet?: boolean; error?: string }
  if (!response.ok) unexpected(response.status, body)
  return Boolean(body.isSet)
}

/** Admin only: sets the registers' staff PIN (4–6 digits), or removes it with `null`. Every unlocked register locks again. */
export async function saveRegisterPin(token: string, pin: string | null): Promise<void> {
  const response = await fetch(`${serverBaseUrl()}/register/pin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ pin }),
  })
  if (!response.ok) unexpected(response.status, await response.json().catch(() => ({})))
}

/** Admin only: the same barcode lookup the register uses (products → catalogue → Open Food Facts), for the product editor's "Look up". */
export async function lookupBarcodeAsAdmin(token: string, code: string): Promise<BarcodeLookupResult> {
  const response = await fetch(`${serverBaseUrl()}/barcodes/${encodeURIComponent(code)}`, { headers: { Authorization: `Bearer ${token}` } })
  const body = (await response.json().catch(() => ({}))) as BarcodeLookupResult & { error?: string }
  if (response.ok || response.status === 400) return body
  return unexpected(response.status, body)
}

/** Admin/subadmin only: one payment integration's saved credentials (`GET /vipps/credentials` or `/zettle/credentials`). */
export async function getPaymentCredentials<K extends PaymentCredentialsKind>(token: string, kind: K): Promise<PaymentCredentialsByKind[K]> {
  const response = await fetch(`${serverBaseUrl()}/${kind}/credentials`, { headers: { Authorization: `Bearer ${token}` } })
  const body = (await response.json().catch(() => ({}))) as PaymentCredentialsByKind[K] & { error?: string }
  if (!response.ok) unexpected(response.status, body)
  return body
}

/** Admin/subadmin only: saves one payment integration's credentials. Blank fields are stored as "not set". */
export async function savePaymentCredentials<K extends PaymentCredentialsKind>(token: string, kind: K, credentials: PaymentCredentialsByKind[K]): Promise<void> {
  const response = await fetch(`${serverBaseUrl()}/${kind}/credentials`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(credentials),
  })
  if (!response.ok) unexpected(response.status, await response.json().catch(() => ({})))
}
