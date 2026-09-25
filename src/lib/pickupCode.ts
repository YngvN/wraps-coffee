/**
 * The website's pickup QR format, shared by the Register page (to tell a pickup QR from a product
 * barcode) and the server (to find the order). The website (wraps-ulven, `submit-order.ts`) makes
 * the code and encodes `WRAPS-PICKUP:<order id>:<code>` in the QR on its order confirmation. The
 * confirmation also shows the code as text, so staff can type it if a phone screen won't scan.
 *
 * The code is the website order's number everywhere (see `orderNumber`): 5 characters of Crockford
 * base32 (no I, L, O or U), never starting with F or W, which are reserved for Foodora and Wolt order
 * numbers. A typed code survives the usual mix-ups: O is read as 0, I or L as 1, and a leading `#` or
 * a dash is ignored. The first orders (2026-09-25) got 8-character codes, which are still accepted.
 */

/** Prefix of every pickup QR payload. */
export const PICKUP_QR_PREFIX = 'WRAPS-PICKUP:'

/** Length of a pickup code. */
export const PICKUP_CODE_LENGTH = 5

/** Pickup codes made before they were shortened — still accepted, so those orders can be picked up. */
export const LEGACY_PICKUP_CODE_LENGTH = 8

const CROCKFORD = /^[0-9A-HJKMNP-TV-Z]+$/

/** What a scan or typed entry asks for: a full QR (order id + code), or just the code. */
export type PickupRequest = { kind: 'qr'; orderId: string; code: string } | { kind: 'code'; code: string }

/** Uppercases, drops a leading `#`, spaces and dashes, and maps O→0 and I/L→1. Returns `null` unless the result is a well-formed code. */
export function normalizePickupCode(raw: string): string | null {
  const code = raw.toUpperCase().replace(/^#/, '').replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1')
  const lengthOk = code.length === PICKUP_CODE_LENGTH || code.length === LEGACY_PICKUP_CODE_LENGTH
  return lengthOk && CROCKFORD.test(code) ? code : null
}

/** Parses a scanned QR payload or a typed code. Returns `null` for anything that is neither. */
export function parsePickupRequest(raw: string): PickupRequest | null {
  const text = raw.trim()
  if (text.toUpperCase().startsWith(PICKUP_QR_PREFIX)) {
    const rest = text.slice(PICKUP_QR_PREFIX.length)
    const separator = rest.lastIndexOf(':')
    if (separator <= 0) return null
    const orderId = rest.slice(0, separator)
    const code = normalizePickupCode(rest.slice(separator + 1))
    return code && /^[0-9a-fA-F-]{8,64}$/.test(orderId) ? { kind: 'qr', orderId: orderId.toLowerCase(), code } : null
  }
  const code = normalizePickupCode(text)
  return code ? { kind: 'code', code } : null
}
