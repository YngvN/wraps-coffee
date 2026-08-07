import { DeviceEventEmitter } from 'react-native'

export type RemoteKey = 'up' | 'down' | 'select'

/**
 * Subscribes to D-pad key events bridged from native (see
 * `plugins/withKeyEventBridge.js`'s own `MainActivity.kt`
 * `dispatchKeyEvent` override) — `up`/`down`/`select` only, matching that
 * bridge's own narrow scope (screen-only v1, per the Remote Screen
 * Navigation plan's own resolved scope — left/right and back are
 * deliberately never bridged at all, see that plugin's own doc comment for
 * why back specifically stays untouched). Returns an unsubscribe function.
 *
 * A no-op subscription (the listener just never fires) on any platform
 * without the native bridge — iOS/web/Electron, or an Android build
 * predating commit 10a — `DeviceEventEmitter` itself is always available
 * as a core RN API, so unlike `packageInstaller.ts`'s own native-module
 * checks, there's no presence check needed here: nothing ever emits this
 * event on those platforms, which is exactly the graceful degradation
 * wanted.
 */
export function subscribeToRemoteKeyEvents(listener: (key: RemoteKey) => void): () => void {
  const subscription = DeviceEventEmitter.addListener('onRemoteKeyEvent', (key: RemoteKey) => listener(key))
  return () => subscription.remove()
}
