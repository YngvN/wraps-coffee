import * as Updates from 'expo-updates'
import { subscribeToDeviceMessages } from './deviceSocket'
import { downloadVerifyAndInstall } from './packageInstaller'
import { syncOrigin, type ServerConnection } from './serverConnection'

/**
 * Wires this device's own persistent WS connection (see `deviceSocket.ts`)
 * to `expo-updates`' own check/fetch/reload flow (`check-update`, Tier 1)
 * and to `packageInstaller.ts`'s own download/verify/install flow
 * (`install-update`, Tier 2/3 — commit 7). Call once, at the same point
 * `connectDeviceSocket` is called from (see `App.tsx`) — returns an
 * unsubscribe function for that effect's own cleanup.
 *
 * `checkAutomatically: ON_ERROR_RECOVERY` (`app.json`) is the *only* other
 * trigger this app relies on for Tier 1 — a kiosk display can run for weeks
 * without relaunching, so a launch-time check is close to useless here
 * (Update Channel spec §2.1). This hub-pushed message is what makes Display
 * Manager's own update button (commit 5) actually do something, for either
 * mechanism — which one arrives is the hub's own decision (§5.4), not this
 * function's.
 */
export function startUpdateListener(connection: ServerConnection, onInstallStart?: () => void): () => void {
  return subscribeToDeviceMessages((message) => {
    if (message.type === 'check-update') void checkAndApplyUpdate()
    if (message.type === 'install-update') {
      onInstallStart?.()
      void handleInstallUpdate(connection)
    }
  })
}

/**
 * Downloads and installs the hub's current APK — see
 * `packageInstaller.ts`'s own doc comment for why this promise resolving
 * isn't a success signal (Update Channel spec §3.3.4). Only a *rejection*
 * here is meaningful, and even that only covers the pre-commit portion of
 * the flow (download, signature verification) — a rejection after commit
 * is unreachable in practice since the process is expected to already be
 * dead by then.
 */
async function handleInstallUpdate(connection: ServerConnection) {
  try {
    await downloadVerifyAndInstall(`${syncOrigin(connection)}/updates/apk/current`)
  } catch (err) {
    console.warn('[updates] install-update failed', err)
  }
}

async function checkAndApplyUpdate() {
  try {
    const result = await Updates.checkForUpdateAsync()
    if (!result.isAvailable) return
    await Updates.fetchUpdateAsync()
    // Reload timing (Update Channel spec §5.4): an admin-button-originated check should apply
    // immediately, a background/automatic one should defer to a quiet window instead. The hub
    // doesn't distinguish the two in its push yet (that's commit 5's own concern, once there's an
    // actual button to originate an "apply now" flag from) — reload immediately for now, since
    // every check today is either that same explicit path or ON_ERROR_RECOVERY.
    await Updates.reloadAsync()
  } catch (err) {
    console.warn('[updates] check/fetch/reload failed', err)
  }
}

/**
 * Points this device's own update manifest URL at the paired hub, once
 * pairing resolves — the hub's address isn't known at build time (Update
 * Channel spec §2.1), so `app.json`'s own `updates.url` is just a
 * build-time placeholder, always overridden here at runtime.
 *
 * PROVISIONAL — spec §7.1, unverified against real hardware. Expo's own
 * types mark `setUpdateURLAndRequestHeadersOverride` `@experimental
 * @hidden` — this is exactly the kind of thing spec §7.1 flags as needing
 * confirmation on the actual Toshiba/Vestel unit before this can be trusted.
 * If it proves unreliable, the fallback is resolving this URL via the same
 * mDNS discovery `serverConnection.ts` already uses for pairing instead of
 * a runtime override — a change scoped entirely to this one function,
 * nothing else in this module or the server needs to change.
 */
export function setUpdateOrigin(connection: ServerConnection): void {
  // The manifest endpoint (server/updates.ts) is served by the main sync/HTTP server, not the
  // content-port vite-preview server — same origin `syncOrigin` already uses for the heartbeat.
  const updateUrl = `http://${connection.host}:${connection.wsPort}/updates/manifest`
  try {
    Updates.setUpdateURLAndRequestHeadersOverride({ updateUrl, requestHeaders: {} })
  } catch (err) {
    console.warn('[updates] setUpdateURLAndRequestHeadersOverride failed — see this function\'s own §7.1 note', err)
  }
}
