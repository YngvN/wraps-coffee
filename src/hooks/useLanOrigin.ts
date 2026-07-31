import { useEffect, useState } from 'react'
import { getLanIp } from '../lib/localServer'

/**
 * This page's own origin (protocol + host + port), but with `localhost`/
 * `127.0.0.1` swapped for the machine's actual LAN IP (fetched once via
 * `getLanIp`) — so a URL built from it (e.g. for a QR code) is reachable
 * from a different device on the same network, not just this one. Any
 * other hostname is already LAN-reachable as-is, so no lookup is needed;
 * falls back to `window.location.hostname` unchanged if the lookup fails.
 */
export function useLanOrigin(): string {
  const [lanIp, setLanIp] = useState<string | null>(null)

  useEffect(() => {
    if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') return
    getLanIp()
      .then(setLanIp)
      .catch(() => setLanIp(null))
  }, [])

  const host =
    window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
      ? (lanIp ?? window.location.hostname)
      : window.location.hostname

  return `${window.location.protocol}//${host}${window.location.port ? `:${window.location.port}` : ''}`
}
