import { Bonjour } from 'bonjour-service'
import type { ScreenAddressSettings } from '../src/types/screenAddress'
import { deriveMdnsName } from '../src/utils/mdnsName'

/** The Vite dev/preview server's own port — the one screen links actually point at (the Node sync server here runs on a separate port, `WS_PORT`). */
const VITE_PORT = 5173

/**
 * DNS-SD service type for the always-on "a Wraps & Coffee server is running
 * here" advertisement (see `advertiseServerPresence` below) — deliberately
 * separate from the opt-in `'http'`-typed hostname advertisement `apply`
 * manages, which is off by default and unrelated to "a server exists" (it's
 * a cosmetic `.local` name for screen links). `electron/roleSetup.cjs`
 * browses for this exact type to decide whether a fresh install defaults to
 * "Server + Display" or "Display only."
 */
const SERVER_PRESENCE_SERVICE_TYPE = 'wrapscoffee-server'

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
 * Advertises "a Wraps & Coffee server is running on this machine," always,
 * regardless of the opt-in hostname mode `apply` manages above — call once
 * at server startup. `wsPort`/`contentPort` are carried as TXT records so a
 * "Display only" machine's first-run wizard (`electron/roleSetup.cjs`,
 * browsing for `SERVER_PRESENCE_SERVICE_TYPE` directly via its own
 * `bonjour-service` import — it can't share this module, a compiled-once
 * Node/TS file, from a separate Electron/CJS process) knows which ports to
 * actually use on whichever host address the browse resolves.
 */
export function advertiseServerPresence(wsPort: number, contentPort: number) {
  presenceBonjour = new Bonjour()
  presenceBonjour.publish({
    name: 'Wraps & Coffee server',
    type: SERVER_PRESENCE_SERVICE_TYPE,
    port: wsPort,
    txt: { wsPort: String(wsPort), contentPort: String(contentPort) },
  })
  console.log('[mdns] advertising server presence for LAN auto-discovery')
}
