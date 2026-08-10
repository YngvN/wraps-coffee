import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake'
import * as NavigationBar from 'expo-navigation-bar'
import { StatusBar } from 'expo-status-bar'
import { useCallback, useEffect, useState } from 'react'
import { BackHandler, Platform, StyleSheet, View } from 'react-native'
import { connectDeviceSocket, disconnectDeviceSocket } from './src/lib/deviceSocket'
import { getOrCreateMachineId, getStoredDeviceLabel, sendHeartbeat, setStoredDeviceLabel, DEVICE_MONITOR_ID } from './src/lib/pairing'
import { clearServerConnection, loadServerConnection, saveServerConnection, type ServerConnection } from './src/lib/serverConnection'
import { runPendingMigrations } from './src/lib/migrations'
import { useRemoteNav } from './src/lib/remoteNav'
import { setUpdateOrigin, startUpdateListener } from './src/lib/updates'
import { RemoteNavHud } from './src/components/RemoteNavHud'
import { UpdatingWatermark } from './src/components/UpdatingWatermark'
import { DisplayScreen } from './src/screens/DisplayScreen'
import { PairingScreen } from './src/screens/PairingScreen'
import { ServerSetupScreen } from './src/screens/ServerSetupScreen'
import { WaitingForAssignmentScreen } from './src/screens/WaitingForAssignmentScreen'

/** Matches `HEARTBEAT_INTERVAL_MS` elsewhere in this codebase (see `electron/main.cjs`). */
const HEARTBEAT_INTERVAL_MS = 20_000
/** The triple-Back-press disconnect gesture's own window — all 3 presses must land within this long of each other (see the `hardwareBackPress` listener below). */
const DISCONNECT_GESTURE_WINDOW_MS = 2_000
const DISCONNECT_GESTURE_PRESS_COUNT = 3

type AppState =
  | { stage: 'loading' }
  | { stage: 'server-setup' }
  | { stage: 'pairing'; connection: ServerConnection }
  | { stage: 'waiting'; connection: ServerConnection }
  | { stage: 'displaying'; connection: ServerConnection; screenId: string }

/**
 * Top-level state machine: **no server known** → `ServerSetupScreen` →
 * **server known, not approved** → `PairingScreen` (persists this device's
 * own `machineID` once, shows up passively in Display Manager for a
 * one-click Approve — no PIN/QR exchanged) → **approved** → polls
 * `POST /display-machines/heartbeat` every `HEARTBEAT_INTERVAL_MS`, showing
 * `WaitingForAssignmentScreen` until a Screen is assigned, then
 * `DisplayScreen`. A `409 { needsPairing: true }` at any point (this device
 * was removed in Display Manager) drops back to the pairing state.
 *
 * `handleDisconnect` (see `clearServerConnection`'s own doc comment for its
 * exact scope) is reachable three ways: `PairingScreen`'s and
 * `WaitingForAssignmentScreen`'s own plain buttons, and a triple-Back-press-
 * within-2s gesture via `BackHandler`, mounted once here as a single global
 * listener so it works from any screen — including the full-bleed
 * `DisplayScreen`, which has no chrome of its own to put a button on. Every
 * `hardwareBackPress` is deliberately
 * consumed (the listener always returns `true`), which also suppresses RN's
 * default single-back-press exit/background behavior app-wide — a
 * deliberate byproduct for this unattended kiosk app, not an oversight.
 * While remote-nav browse mode is active (`remoteNav.isBrowseModeActive()`,
 * see `src/lib/remoteNav.ts`), this same listener delegates to
 * `remoteNav.revertAndExit()` instead of counting the press toward
 * disconnect — without that branch, a user backing out of a screen preview
 * would walk two-thirds of the way to unpairing this display.
 *
 * Recovery after a power loss/reboot on the device itself is handled for
 * Windows, Android, and Linux via auto-launch-on-boot (see this app's own
 * README) — for iOS/iPadOS it remains a documented limitation (no relaunch
 * without MDM/Supervised Single App Mode), so an unattended iPad still needs
 * a manual relaunch to resume this flow after a power blip.
 */
export default function App() {
  const [state, setState] = useState<AppState>({ stage: 'loading' })
  const [machineID, setMachineID] = useState<string | null>(null)
  // Starts as the generic fallback, then overridden below (in the same
  // effect that loads `machineID`) if a dashboard rename was ever pushed
  // down and persisted locally on a previous run — see `getStoredDeviceLabel`'s
  // own doc comment. Also updated live by the heartbeat loop's own `beat()`
  // whenever a *new* rename arrives, so it's state (not another one-shot
  // lazy initializer) despite starting from one.
  const [deviceLabel, setDeviceLabel] = useState(() => `ADHDisplay Companion (${Platform.OS})`)

  // Owns its own deviceSocket subscriptions (messages, connection status) — safe to call
  // unconditionally regardless of pairing stage, see its own doc comment.
  const remoteNav = useRemoteNav()

  // An always-on kiosk display that sleeps defeats the whole feature — active
  // from launch, for the app's entire lifetime, not just while DisplayScreen
  // is mounted (the standby/pairing screens are just as unattended).
  useEffect(() => {
    void activateKeepAwakeAsync()
    return () => deactivateKeepAwake()
  }, [])

  useEffect(() => {
    if (Platform.OS !== 'android') return
    void NavigationBar.setVisibilityAsync('hidden')
    void NavigationBar.setBehaviorAsync('overlay-swipe')
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      await runPendingMigrations()
      const id = await getOrCreateMachineId()
      const connection = await loadServerConnection()
      const storedLabel = await getStoredDeviceLabel()
      if (cancelled) return
      setMachineID(id)
      if (storedLabel) setDeviceLabel(storedLabel)
      setState(connection ? { stage: 'pairing', connection } : { stage: 'server-setup' })
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const handleConnected = useCallback((connection: ServerConnection) => {
    void saveServerConnection(connection)
    setState({ stage: 'pairing', connection })
  }, [])

  const handleApproved = useCallback((connection: ServerConnection) => {
    setState({ stage: 'waiting', connection })
  }, [])

  const handleNeedsPairing = useCallback((connection: ServerConnection) => {
    setState({ stage: 'pairing', connection })
  }, [])

  const handleDisconnect = useCallback(() => {
    void clearServerConnection()
    disconnectDeviceSocket()
    setState({ stage: 'server-setup' })
  }, [])

  // Global triple-Back-press-within-2s disconnect gesture — see this
  // component's own doc comment for why it's one listener mounted here
  // rather than per-screen. `pressTimestamps` lives inside the closure, not
  // state — it never needs to trigger its own re-render, only to be read
  // back by the next press. Remote-nav browse mode (see this component's
  // own doc comment) preempts this counting entirely while active — the
  // disconnect gesture is only reachable from idle.
  const { isBrowseModeActive, revertAndExit } = remoteNav
  useEffect(() => {
    let pressTimestamps: number[] = []
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (isBrowseModeActive()) {
        revertAndExit()
        pressTimestamps = []
        return true
      }
      const now = Date.now()
      pressTimestamps = [...pressTimestamps, now].filter((t) => now - t < DISCONNECT_GESTURE_WINDOW_MS)
      if (pressTimestamps.length >= DISCONNECT_GESTURE_PRESS_COUNT) {
        pressTimestamps = []
        handleDisconnect()
      }
      return true // always consumed — a stray single/double back-press should not exit/background this kiosk app
    })
    return () => sub.remove()
  }, [handleDisconnect, isBrowseModeActive, revertAndExit])

  // Heartbeat loop, active once approved (waiting or displaying) — every
  // HEARTBEAT_INTERVAL_MS, learning this device's own assignedScreenID from
  // the heartbeat response itself, no separate endpoint needed. Offline/
  // unreachable failures are silently retried next interval, same
  // best-effort posture as every other heartbeat sender in this codebase
  // (see `registerDisplayHeartbeat`'s own comment on the web side).
  useEffect(() => {
    if (state.stage !== 'waiting' && state.stage !== 'displaying') return
    if (!machineID) return
    const connection = state.connection

    let cancelled = false
    const beat = async () => {
      try {
        const result = await sendHeartbeat(connection, machineID, deviceLabel)
        if (cancelled) return
        if (result.needsPairing) {
          handleNeedsPairing(connection)
          return
        }
        // A dashboard rename (Display Manager's own customLabel field), pushed down in this same response —
        // persist it locally and start reporting it as this device's own label from the next heartbeat/
        // pairing-heartbeat call onward, to this server or any future one (see getStoredDeviceLabel's own doc
        // comment for why this has to live on the device rather than only server-side).
        if (result.customLabel && result.customLabel !== deviceLabel) {
          void setStoredDeviceLabel(result.customLabel)
          setDeviceLabel(result.customLabel)
        }
        const assignedScreenID = result.monitors.find((monitor) => monitor.id === DEVICE_MONITOR_ID)?.assignedScreenID ?? null
        // Only actually transition state when the derived stage/assignment differs from what's
        // already there — `setState` with a freshly-literal object here is otherwise never
        // `Object.is`-equal to the previous state even when nothing changed, which (since this
        // effect depends on the whole `state` object below) unconditionally re-triggers this
        // effect on every single heartbeat response and re-invokes `beat()` immediately, turning
        // the intended HEARTBEAT_INTERVAL_MS cadence into a tight loop.
        const unchanged = assignedScreenID ? state.stage === 'displaying' && state.screenId === assignedScreenID : state.stage === 'waiting'
        if (!unchanged) {
          setState(assignedScreenID ? { stage: 'displaying', connection, screenId: assignedScreenID } : { stage: 'waiting', connection })
        }
      } catch {
        // Ignore — see this effect's own doc comment above.
      }
    }
    void beat()
    const interval = setInterval(() => void beat(), HEARTBEAT_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
    // `state` (not just `state.stage`) is the real dependency here: `state.connection`/`state.screenId` matter too, so re-keying this effect off the whole object on every stage transition is intentional, not an oversight.
  }, [state, machineID, deviceLabel, handleNeedsPairing])

  // Native update-check WS connection + expo-updates wiring (see `deviceSocket.ts`/`updates.ts`),
  // active under the same "approved" condition as the heartbeat loop above. Keyed on
  // `pairedConnection` rather than the whole `state` object (unlike the heartbeat effect above) —
  // `beat()` carries the same `connection` reference through a waiting→displaying transition, so
  // this stays referentially stable across that flip and doesn't need to tear down and reopen the
  // socket just because a screen got assigned; `connectDeviceSocket`'s own dedup guard exists for
  // this exact reason, but keying the effect this way avoids relying on it for the common case.
  const pairedConnection = state.stage === 'waiting' || state.stage === 'displaying' ? state.connection : null
  const [installingApk, setInstallingApk] = useState(false)
  useEffect(() => {
    if (!pairedConnection || !machineID) return
    connectDeviceSocket(pairedConnection, machineID)
    setUpdateOrigin(pairedConnection)
    return startUpdateListener(pairedConnection, () => setInstallingApk(true))
  }, [pairedConnection, machineID])

  return (
    <View style={styles.root}>
      <StatusBar hidden />
      <UpdatingWatermark installingApk={installingApk} />
      {state.stage === 'loading' && null}
      {state.stage === 'server-setup' && <ServerSetupScreen onConnected={handleConnected} />}
      {state.stage === 'pairing' && (
        <PairingScreen
          connection={state.connection}
          machineID={machineID ?? ''}
          deviceLabel={deviceLabel}
          onApproved={() => handleApproved(state.connection)}
          onDisconnect={handleDisconnect}
        />
      )}
      {state.stage === 'waiting' && (
        <WaitingForAssignmentScreen deviceLabel={deviceLabel} connection={state.connection} onDisconnect={handleDisconnect} />
      )}
      {state.stage === 'displaying' && (
        <>
          <DisplayScreen connection={state.connection} screenId={remoteNav.renderScreenId ?? state.screenId} />
          <RemoteNavHud hud={remoteNav.hud} />
        </>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  // Painted behind every stage, including 'loading' (which renders nothing
  // of its own) — without this, the 'loading' stage on cold start falls
  // through to the native window background instead of staying dark.
  root: { flex: 1, backgroundColor: '#111' },
})
