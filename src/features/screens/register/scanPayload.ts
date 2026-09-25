/**
 * Decides what a scan is, whichever scanner it came from (wedge or camera): a customer's pickup QR, a
 * product barcode, or noise. Pickup QRs are recognised only by their `WRAPS-PICKUP:` prefix — a bare
 * pickup code is typed into its own field instead, since an all-digit code could pass as an EAN-8.
 */
import { normalizeGtin } from '../../../lib/gtin'
import { PICKUP_QR_PREFIX } from '../../../lib/pickupCode'

/** What a scan turned out to be. */
export type ScanPayload = { kind: 'pickup'; payload: string } | { kind: 'barcode'; code: string } | { kind: 'unknown'; raw: string }

/** Classifies one scanned string. */
export function classifyScan(raw: string): ScanPayload {
  const text = raw.trim()
  if (text.toUpperCase().startsWith(PICKUP_QR_PREFIX)) return { kind: 'pickup', payload: text }
  const code = normalizeGtin(text)
  return code ? { kind: 'barcode', code } : { kind: 'unknown', raw: text }
}
