import type { ServerConnection } from './serverConnection'

/** Matches the payload `DisplayManagerView.tsx`'s own "Pair a mobile display" QR code encodes on the server side — a small versioned URI, not a bare host string, so a future field can be added without breaking an older app build's own parsing. */
const PAIR_URI_PREFIX = 'adhdisplay-companion-pair://v1?'

/**
 * Parses the `adhdisplay-companion-pair://v1?host=...&wsPort=...&contentPort=...`
 * payload the server's own pairing QR code encodes. Returns `null` for
 * anything that doesn't match (a stray QR code, a wrong-app old link) so a
 * scan of something unrelated just falls through to "try again" instead of
 * crashing or silently connecting to garbage.
 */
export function parsePairingQrValue(value: string): ServerConnection | null {
  if (!value.startsWith(PAIR_URI_PREFIX)) return null
  const params = new URLSearchParams(value.slice(PAIR_URI_PREFIX.length))
  const host = params.get('host')
  const wsPort = Number(params.get('wsPort'))
  const contentPort = Number(params.get('contentPort'))
  if (!host || !Number.isFinite(wsPort) || !Number.isFinite(contentPort)) return null
  return { host, wsPort, contentPort }
}
