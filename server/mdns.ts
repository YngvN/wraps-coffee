import { Bonjour } from 'bonjour-service'
import type { ScreenAddressSettings } from '../src/types/screenAddress'
import { deriveMdnsName } from '../src/utils/mdnsName'
import { sanitizeDisplayName } from '../src/utils/sanitizeDisplayName'

/** The maximum length (in Unicode code points) advertised in the presence TXT record's `storeName` — a plain character-count bound, not a byte budget; see `advertiseServerPresence`'s own doc comment. */
const STORE_NAME_TXT_MAX_LENGTH = 63

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
let presenceService: ReturnType<InstanceType<typeof Bonjour>['publish']> | null = null
/** Serializes `advertiseServerPresence` calls (see its own doc comment) — each call chains onto this promise rather than running concurrently with the previous one, so two renames close together can't interleave a stop() and a publish() and leave a stale TXT record live. */
let presenceQueue: Promise<void> = Promise.resolve()

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
 * at server startup, and again any time the store's own name changes (see
 * `currentStoreName` in `server/index.ts`) so the advertised name stays
 * live without a restart. `wsPort`/`contentPort` are carried as TXT records
 * so any future LAN-discovery consumer (browsing for
 * `SERVER_PRESENCE_SERVICE_TYPE` via its own `bonjour-service` import, since
 * a non-Node/TS process can't share this module directly) knows which ports
 * to actually use on whichever host address the browse resolves — see this
 * constant's own comment for why nothing currently browses for it directly.
 * `storeName` is carried the same way, sanitized and length-capped via
 * `sanitizeDisplayName` (control/bidi/zero-width stripped, so a name typed
 * in the dashboard can't break a single-line row on the TV or spoof another
 * store's name) and included only when non-empty, so `adhdisplay-companion`
 * can fall back to its own generic "ADHDisplay" label when it's absent.
 *
 * Unlike `apply` above, a rename here does **not** tear down and rebuild the
 * whole `Bonjour` instance (which owns the underlying multicast socket) —
 * `presenceBonjour` is created once and kept alive. Only the one `Service`
 * object `publish()` returns is stopped and republished: a `Service`'s own
 * `stop(callback)` runs the exact same goodbye-record teardown
 * `Bonjour.unpublishAll()` does, just scoped to this one service, so this is
 * both correct and cheaper than `apply`'s unpublish-then-destroy pattern.
 * Calls are serialized through `presenceQueue` so two renames close together
 * can't interleave a stop() and a publish() and leave a stale TXT record
 * live on the network.
 */
export function advertiseServerPresence(wsPort: number, contentPort: number, storeName: string) {
  const name = sanitizeDisplayName(storeName, STORE_NAME_TXT_MAX_LENGTH)
  const txt: Record<string, string> = { wsPort: String(wsPort), contentPort: String(contentPort) }
  if (name) txt.storeName = name

  presenceQueue = presenceQueue.then(
    () =>
      new Promise<void>((resolve) => {
        if (!presenceBonjour) presenceBonjour = new Bonjour()
        const publishNewService = () => {
          presenceService = presenceBonjour!.publish({
            name: 'ADHDisplay server',
            type: SERVER_PRESENCE_SERVICE_TYPE,
            port: wsPort,
            txt,
          })
          console.log('[mdns] advertising server presence for LAN auto-discovery')
          resolve()
        }
        if (presenceService) {
          presenceService.stop(publishNewService)
        } else {
          publishNewService()
        }
      }),
  )
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
    presenceService = null
  }
}
