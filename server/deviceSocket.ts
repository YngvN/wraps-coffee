import type { WebSocket } from 'ws'

/**
 * Sent once by a companion device right after its WS connection opens (and
 * again on every reconnect), identifying itself so `pushToDevice` can find
 * it again — see `adhdisplay-companion/src/lib/deviceSocket.ts`. No token,
 * same LAN-trust posture as the heartbeat route: this connection only ever
 * exists for a `machineID` that's already an approved `admin.displayMachines`
 * entry (the heartbeat route already gates that), so there's nothing new to
 * authorize here.
 */
export interface DeviceHelloMessage {
  type: 'device-hello'
  machineID: string
}

/**
 * Sent once, on OK — a companion device committing a remote-navigation
 * preview to a real screen (Remote Screen Navigation spec §D1/commit 10b),
 * never sent per-keypress. No `machineID` field: this always arrives on an
 * already-`device-hello`'d socket, so the hub identifies the sender via
 * `getMachineIDForSocket` rather than trusting a client-supplied id (which
 * would need validating against the socket's own registration anyway — this
 * way there's nothing to validate, the lookup itself is the authorization).
 */
export interface ScreenOverrideMessage {
  type: 'screen-override'
  screenId: string
}

/** Everything a companion device's own persistent WS connection can send to the hub. */
export type DeviceClientMessage = DeviceHelloMessage | ScreenOverrideMessage

/**
 * Everything a companion device's own persistent WS connection can receive
 * from the hub — see the Update Channel spec's own "push mechanism" design:
 * a real native socket, not the admin-dashboard sync protocol above (a
 * companion device isn't declaring interest in `SyncedKey`s).
 *
 * `navigable-set`/`effective-screen` are the Remote Screen Navigation spec's
 * own additions (commit 9) — hub-decided screen browsing state, pushed on
 * `device-hello` and again on whatever changed it (see
 * `resolveEffectiveScreen`/`buildNavigableSet` in `server/index.ts`).
 * `effective-screen`'s `screenId` is nullable — a monitor can have no
 * screen assigned at all (shows the standby screensaver instead), same as
 * `DisplayMonitor.assignedScreenID`.
 */
export type DeviceServerMessage =
  | { type: 'check-update' }
  | { type: 'install-update'; mechanism: 'apk' }
  | { type: 'navigable-set'; screens: { screenId: string; name: string }[] }
  | { type: 'effective-screen'; screenId: string | null }

const deviceSockets = new Map<string, WebSocket>()
const machineIDBySocket = new Map<WebSocket, string>()

/** Registers (or re-registers, on reconnect) one device's own socket — called from the WS connection handler in `server/index.ts` on receiving `device-hello`. */
export function registerDeviceSocket(machineID: string, socket: WebSocket) {
  deviceSockets.set(machineID, socket)
  machineIDBySocket.set(socket, machineID)
}

/**
 * Cleans up both maps when a socket closes — called from the same `close`
 * handler every socket already goes through in `server/index.ts`, a no-op
 * if `socket` was never a registered device socket (e.g. an admin-dashboard
 * tab). Guards against a reconnect race: if the device already reconnected
 * (registering a *new* socket for the same `machineID`) before this old
 * socket's own `close` event fired, this must not delete the newly
 * registered entry out from under it.
 */
export function unregisterDeviceSocket(socket: WebSocket) {
  const machineID = machineIDBySocket.get(socket)
  if (!machineID) return
  machineIDBySocket.delete(socket)
  if (deviceSockets.get(machineID) === socket) deviceSockets.delete(machineID)
}

/** The `machineID` a given socket identified itself as via `device-hello`, or `undefined` if it never has (e.g. an admin-dashboard tab, or a device socket that hasn't sent `device-hello` yet). How the hub authenticates a `screen-override` message — see that message type's own doc comment. */
export function getMachineIDForSocket(socket: WebSocket): string | undefined {
  return machineIDBySocket.get(socket)
}

/**
 * Pushes a message to one specific companion device's own persistent WS connection, if it currently
 * has one open — still a no-op (not queued, not retried) if it doesn't, same best-effort posture as
 * this device's own heartbeat.
 *
 * Returns whether the message was actually handed to a socket. Callers that only fire and forget can
 * ignore it, but an update trigger must not: a push dropped here used to be indistinguishable from
 * one the device simply hadn't acted on yet, so a display that was offline at the moment of the click
 * sat showing "Updating…" for the full `UPDATE_FAILURE_TIMEOUT_MS` (10 minutes) before the sweep in
 * `server/index.ts` called it failed.
 */
export function pushToDevice(machineID: string, message: DeviceServerMessage): boolean {
  const socket = deviceSockets.get(machineID)
  if (!socket || socket.readyState !== socket.OPEN) return false
  socket.send(JSON.stringify(message))
  return true
}

/** Pushes a message to every currently-connected companion device — used for `navigable-set` when the underlying screen list itself changes (every connected device's own browsable set is affected, not just one). */
export function pushToAllDevices(message: DeviceServerMessage) {
  const serialized = JSON.stringify(message)
  for (const socket of deviceSockets.values()) {
    if (socket.readyState === socket.OPEN) socket.send(serialized)
  }
}
