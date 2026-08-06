import { Bonjour } from 'bonjour-service'
import type { ScreenAddressSettings } from '../src/types/screenAddress'
import { deriveMdnsName } from '../src/utils/mdnsName'

/** The Vite dev/preview server's own port — the one screen links actually point at (the Node sync server here runs on a separate port, `WS_PORT`). */
const VITE_PORT = 5173

/**
 * DNS-SD service type for the always-on "an ADHDisplay server is running
 * here" advertisement (see `advertiseServerPresence` below) — deliberately
 * separate from the opt-in `'http'`-typed hostname advertisement `apply`
 * manages, which is off by default and unrelated to "a server exists" (it's
 * a cosmetic `.local` name for screen links). Kept to 10 characters,
 * comfortably under RFC 6763 §7's 15-character DNS-SD service-name cap —
 * Android's `NsdManager` (what browses for this on the companion app's
 * side) has historically been the strict end of the mDNS ecosystem about
 * out-of-spec labels. Browsed for by `adhdisplay-companion`'s
 * `browseForServerViaMdns` (`src/lib/serverConnection.ts` in that app) as
 * the fast counterpart to its own LAN subnet sweep — this value must match
 * that file's own `MDNS_SERVICE_TYPE` constant exactly.
 */
const SERVER_PRESENCE_SERVICE_TYPE = 'adhdisplay'

let bonjour: InstanceType<typeof Bonjour> | null = null
let presenceBonjour: InstanceType<typeof Bonjour> | null = null

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

/**
 * Advertises "an ADHDisplay server is running on this machine," always,
 * regardless of the opt-in hostname mode `apply` manages above — call once
 * at server startup. `wsPort`/`contentPort` are carried as TXT records so
 * any future LAN-discovery consumer (browsing for
 * `SERVER_PRESENCE_SERVICE_TYPE` via its own `bonjour-service` import, since
 * a non-Node/TS process can't share this module directly) knows which ports
 * to actually use on whichever host address the browse resolves — see this
 * constant's own comment for why nothing currently browses for it.
 */
export function advertiseServerPresence(wsPort: number, contentPort: number) {
  presenceBonjour = new Bonjour()
  presenceBonjour.publish({
    name: 'ADHDisplay server',
    type: SERVER_PRESENCE_SERVICE_TYPE,
    port: wsPort,
    txt: { wsPort: String(wsPort), contentPort: String(contentPort) },
  })
  console.log('[mdns] advertising server presence for LAN auto-discovery')
}

/** Tears down both advertisements (the opt-in hostname one and the always-on presence one) — called on graceful shutdown (SIGTERM/SIGINT) so this machine stops answering mDNS queries for a server that's no longer running. */
export function stop() {
  if (bonjour) {
    bonjour.unpublishAll()
    bonjour.destroy()
    bonjour = null
  }
  if (presenceBonjour) {
    presenceBonjour.unpublishAll()
    presenceBonjour.destroy()
    presenceBonjour = null
  }
}
