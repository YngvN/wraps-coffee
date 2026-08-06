const APPROVE_URI_PREFIX = 'adhdisplay-companion-approve://v1?'

/**
 * Parses the QR code `PairingScreen.tsx` (adhdisplay-companion) shows
 * alongside its PIN — scanning it is a shortcut for typing that same PIN
 * into Display Manager, not a separate approval mechanism (see
 * `QrPairingScanner.tsx`, which feeds this straight into the same
 * `approveDisplayPairing` call the manual PIN form uses).
 */
export function parsePairingApprovalQrValue(value: string): { machineID: string; pin: string } | null {
  if (!value.startsWith(APPROVE_URI_PREFIX)) return null
  const params = new URLSearchParams(value.slice(APPROVE_URI_PREFIX.length))
  const machineID = params.get('machineID')
  const pin = params.get('pin')
  if (!machineID || !pin) return null
  return { machineID, pin }
}
