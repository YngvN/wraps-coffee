import { Bonjour } from 'bonjour-service'
import type { ScreenAddressSettings } from '../src/types/screenAddress'
import { deriveMdnsName } from '../src/utils/mdnsName'

/** The Vite dev/preview server's own port — the one screen links actually point at (the Node sync server here runs on a separate port, `WS_PORT`). */
const VITE_PORT = 5173

let bonjour: InstanceType<typeof Bonjour> | null = null

/**
 * Applies `settings` to this machine's own mDNS advertisement: unpublishes
 * whatever was previously advertised, then (only when `mode === 'mdns'` with
 * a non-empty `storeName`) publishes a placeholder service under
 * `${deriveMdnsName(storeName)}.local` — publishing a service is what makes
 * `bonjour-service` answer that hostname's A-record query on the LAN, which
 * is the actual goal (the service type/port themselves are otherwise
 * unused). Safe to call again on every settings or store-name change —
 * always tears down the previous advertisement first, so switching modes or
 * renaming the store never leaves a stale advertisement behind.
 */
export function apply(settings: ScreenAddressSettings, storeName: string) {
  if (bonjour) {
    bonjour.unpublishAll()
    bonjour.destroy()
    bonjour = null
  }

  if (settings.mode !== 'mdns' || !storeName.trim()) return

  const mdnsName = deriveMdnsName(storeName)
  bonjour = new Bonjour()
  bonjour.publish({
    name: `${storeName} kiosk display`,
    type: 'http',
    port: VITE_PORT,
    host: `${mdnsName}.local`,
  })
  console.log(`[mdns] advertising ${mdnsName}.local`)
}
