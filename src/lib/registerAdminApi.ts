/**
 * The admin dashboard's calls to the local server for the Register — the staff list, the journal's
 * health, the cash registers' names, the barcode
 * lookup behind the product editor's "Look up", changing a counter sale's status from the Orders
 * view, and the payment integrations' credentials. Every call carries the admin's session token;
 * the tablet's own calls are in `registerApi.ts`.
 */
import type { BarcodeLookupResult } from '../types/barcode'
import type { OrderStatus } from '../types/order'
import type { PaymentCredentialsByKind, PaymentCredentialsKind } from '../types/payments'
import type { RegisterReport } from '../types/registerReport'
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

/** A register staff member as the dashboard sees them — never the PIN (see `server/register/staff.ts`). */
export interface RegisterStaffMember {
  id: string
  name: string
  employeeNumber: string
  role: 'staff' | 'manager'
  active: boolean
  hasPin: boolean
}

/** What can be set on a staff member; `pin` present means "set this PIN" (4 digits). */
export interface RegisterStaffInput {
  name?: string
  employeeNumber?: string
  role?: 'staff' | 'manager'
  active?: boolean
  pin?: string
}

/** Admin only: every register staff member, active or not. */
export async function fetchRegisterStaffList(token: string): Promise<RegisterStaffMember[]> {
  const response = await fetch(`${serverBaseUrl()}/register/admin/staff`, { headers: { Authorization: `Bearer ${token}` } })
  const body = (await response.json().catch(() => ({}))) as { staff?: RegisterStaffMember[]; error?: string }
  if (!response.ok) unexpected(response.status, body)
  return body.staff ?? []
}

/** Admin only: adds a staff member (`id` absent) or changes one. Resolves the saved member; rejects with the server's reason. */
export async function saveRegisterStaff(token: string, input: RegisterStaffInput, id?: string): Promise<RegisterStaffMember> {
  const response = await fetch(`${serverBaseUrl()}/register/admin/staff${id ? `/${encodeURIComponent(id)}` : ''}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  })
  const body = (await response.json().catch(() => ({}))) as { member?: RegisterStaffMember; reason?: string; error?: string }
  if (!response.ok || !body.member) throw new Error(body.reason ?? body.error ?? `The server answered ${response.status}`)
  return body.member
}

/** One problem the journal check found (see `server/journal/journal.ts`). */
export interface JournalProblemSummary {
  kind: string
  file: string
  seq?: number
  detail: string
}

/** The journal's size and the last integrity check's result. */
export interface JournalHealth {
  entries: number
  problems: JournalProblemSummary[]
  checkedAt: string
}

/** Admin only: the journal's health, or (`verify`) a fresh full check of it. */
export async function fetchJournalHealth(token: string, verify = false): Promise<JournalHealth> {
  const response = await fetch(`${serverBaseUrl()}/register/admin/journal${verify ? '/verify' : ''}`, {
    method: verify ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${token}` },
  })
  const body = (await response.json().catch(() => ({}))) as JournalHealth & { error?: string }
  if (!response.ok) unexpected(response.status, body)
  return body
}

/** One cash register (tablet) as the admin sees it — see `server/register/registers.ts`. */
export interface CashRegisterSummary {
  number: number
  name: string
  createdAt: string
}

/** Admin only: every cash register, numbered in the order the tablets first opened the register. */
export async function fetchCashRegisters(token: string): Promise<CashRegisterSummary[]> {
  const response = await fetch(`${serverBaseUrl()}/register/registers`, { headers: { Authorization: `Bearer ${token}` } })
  const body = (await response.json().catch(() => ({}))) as { registers?: CashRegisterSummary[]; error?: string }
  if (!response.ok) unexpected(response.status, body)
  return body.registers ?? []
}

/** Admin only: renames cash register `number`. Its number, printed on receipts, never changes. */
export async function renameCashRegister(token: string, number: number, name: string): Promise<void> {
  const response = await fetch(`${serverBaseUrl()}/register/registers/${number}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name }),
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

/** One Z report from the journal. */
export interface ZReportSummary {
  seq: number
  at: string
  register: number
  number: number
  report: RegisterReport
}

/** Admin only: every Z report, newest first. */
export async function fetchZReports(token: string): Promise<ZReportSummary[]> {
  const response = await fetch(`${serverBaseUrl()}/register/admin/z-reports`, { headers: { Authorization: `Bearer ${token}` } })
  const body = (await response.json().catch(() => ({}))) as { reports?: ZReportSummary[]; error?: string }
  if (!response.ok) unexpected(response.status, body)
  return body.reports ?? []
}

/** Admin only: prints Z report `seq` again on the default printer, marked KOPI. */
export async function reprintZReport(token: string, seq: number): Promise<'printed' | 'notFound' | 'noPrinter' | 'printerFailed'> {
  const response = await fetch(`${serverBaseUrl()}/register/admin/z-reports/${seq}/print`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
  const body = (await response.json().catch(() => ({}))) as { result?: 'printed' | 'notFound' | 'noPrinter' | 'printerFailed' }
  return body.result ?? 'printerFailed'
}

/** Admin only: the SAF-T Cash Register file for `from`–`to` (Oslo dates, inclusive), for every register or just `register`. */
export async function downloadSaft(token: string, from: string, to: string, register?: number): Promise<{ blob: Blob; filename: string }> {
  const query = new URLSearchParams({ from, to, ...(register ? { register: String(register) } : {}) })
  const response = await fetch(`${serverBaseUrl()}/register/admin/saft?${query}`, { headers: { Authorization: `Bearer ${token}` } })
  if (!response.ok) unexpected(response.status, await response.json().catch(() => ({})))
  const disposition = response.headers.get('Content-Disposition') ?? ''
  const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? `SAF-T Cash Register_${from}_${to}.xml`
  return { blob: await response.blob(), filename }
}

/** Admin only: the journal's public signing keys (PEM), for Skatteetaten to verify the SAF-T signatures. */
export async function downloadPublicKey(token: string): Promise<Blob> {
  const response = await fetch(`${serverBaseUrl()}/register/admin/public-key`, { headers: { Authorization: `Bearer ${token}` } })
  if (!response.ok) unexpected(response.status, await response.json().catch(() => ({})))
  return response.blob()
}
