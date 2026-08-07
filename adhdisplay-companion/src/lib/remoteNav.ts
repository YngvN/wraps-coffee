import { useCallback, useEffect, useRef, useState } from 'react'
import { sendScreenOverride, subscribeToDeviceConnectionStatus, subscribeToDeviceMessages } from './deviceSocket'
import { subscribeToRemoteKeyEvents, type RemoteKey } from './remoteKeyEvents'

/** First press arms (renders a HUD hint); a second press within this window enters browse mode. Generous relative to a real double-click's own ~400ms — this is an arming *state*, not double-click detection, so it can afford to be. */
const ARM_WINDOW_MS = 2500
/** Reverts and exits browse mode after this long with no further press — a screen cycling in front of customers with nobody actually there is a real complaint. */
const INACTIVITY_TIMEOUT_MS = 20_000

export interface NavigableScreen {
  screenId: string
  name: string
}

export type RemoteNavMode = 'idle' | 'armed' | 'previewing'

export interface RemoteNavHudState {
  mode: RemoteNavMode
  /** Only set while `previewing` — the screen currently selected (not yet committed). `null` if the navigable set is empty. */
  currentScreenName: string | null
  /** 1-based position within the navigable set, only set while `previewing` with a non-empty set. */
  position: { index: number; total: number } | null
}

export interface UseRemoteNavResult {
  hud: RemoteNavHudState
  /** Which screen `DisplayScreen` should actually render right now — the locally-selected preview while `previewing`, else the last hub-confirmed `effective-screen` (override ?? assignment). Never touches the confirmed value during a preview, which is what makes reverting free (see `exitToIdle`'s own doc comment). */
  renderScreenId: string | null
  /** Whether browse mode (`armed` or `previewing`) is currently active — `App.tsx`'s own triple-back `BackHandler` checks this to decide whether to delegate a back press here instead of counting it toward the disconnect gesture. */
  isBrowseModeActive: () => boolean
  /** Reverts and exits to `idle` — called by `App.tsx`'s own `BackHandler` when browse mode is active. */
  revertAndExit: () => void
}

/**
 * TV-remote screen browsing (Remote Screen Navigation spec) — a D-pad
 * up/down double-press arms and enters browse mode, single presses then
 * move a local selection through the hub's own `navigable-set`, OK commits
 * (`sendScreenOverride`) and exits, back/20s-inactivity/disconnect all
 * revert with no server round-trip. Built on commit 10a's native bridge
 * (`remoteKeyEvents.ts`) and commit 9's server-side push protocol
 * (`deviceSocket.ts`).
 *
 * Owns its own connection-status subscription (`subscribeToDeviceConnectionStatus`) — call
 * unconditionally from `App.tsx` once (it degrades to inert, connected-gated no-ops before
 * `connectDeviceSocket` has ever been called, same as every other `deviceSocket.ts` subscriber).
 * `connected` gates the whole feature — browse mode is disabled while disconnected (a commit
 * couldn't persist, and the navigable set may be stale), and an in-progress session reverts
 * immediately if the connection drops out from under it.
 */
export function useRemoteNav(): UseRemoteNavResult {
  const [navigableSet, setNavigableSet] = useState<NavigableScreen[]>([])
  const [effectiveScreenId, setEffectiveScreenId] = useState<string | null>(null)
  const [mode, setMode] = useState<RemoteNavMode>('idle')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [connected, setConnected] = useState(false)

  // Refs mirroring the state above, assigned fresh on every render — lets the key-event handler
  // (subscribed once, see below) always read the *current* value without needing to re-subscribe
  // DeviceEventEmitter on every keypress-driven state change.
  const navigableSetRef = useRef(navigableSet)
  navigableSetRef.current = navigableSet
  const effectiveScreenIdRef = useRef(effectiveScreenId)
  effectiveScreenIdRef.current = effectiveScreenId
  const modeRef = useRef(mode)
  modeRef.current = mode
  const selectedIndexRef = useRef(selectedIndex)
  selectedIndexRef.current = selectedIndex
  const connectedRef = useRef(connected)
  connectedRef.current = connected

  const armTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearArmTimer = () => {
    if (armTimerRef.current) {
      clearTimeout(armTimerRef.current)
      armTimerRef.current = null
    }
  }
  const clearInactivityTimer = () => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current)
      inactivityTimerRef.current = null
    }
  }

  /** `renderScreenId` is derived, never a separate piece of state — `effectiveScreenId` itself is never touched during a preview, so "revert" is just "stop diverging locally," nothing to restore. */
  const exitToIdle = useCallback(() => {
    clearArmTimer()
    clearInactivityTimer()
    setMode('idle')
  }, [])

  const resetInactivityTimer = useCallback(() => {
    clearInactivityTimer()
    inactivityTimerRef.current = setTimeout(exitToIdle, INACTIVITY_TIMEOUT_MS)
  }, [exitToIdle])

  // Hub-pushed navigable set / effective screen (see server/index.ts's own device-hello and
  // applyUpdate-diff pushes) — subscribed once, for the component's whole lifetime.
  useEffect(() => {
    return subscribeToDeviceMessages((message) => {
      if (message.type === 'navigable-set') setNavigableSet(message.screens)
      if (message.type === 'effective-screen') {
        setEffectiveScreenId(message.screenId)
        // A concurrent admin reassignment arriving mid-preview drops the preview — same
        // precedence rule as a remote commit (spec §D1): the pushed screen always wins.
        if (modeRef.current === 'previewing') exitToIdle()
      }
    })
  }, [exitToIdle])

  // Browse mode disabled while disconnected — a commit couldn't persist, and the navigable set
  // may be stale by the time a connection comes back.
  useEffect(() => {
    return subscribeToDeviceConnectionStatus((isConnected) => {
      setConnected(isConnected)
      if (!isConnected) exitToIdle()
    })
  }, [exitToIdle])

  // D-pad up/down/select, bridged from native (commit 10a) — subscribed once; every value the
  // handler needs comes from the refs above, always current, so this never needs to re-subscribe.
  useEffect(() => {
    return subscribeToRemoteKeyEvents((key: RemoteKey) => {
      if (!connectedRef.current) return

      if (key === 'select') {
        if (modeRef.current !== 'previewing') return
        const screen = navigableSetRef.current[selectedIndexRef.current]
        if (screen) sendScreenOverride(screen.screenId)
        exitToIdle()
        return
      }

      // up/down
      if (modeRef.current === 'idle') {
        setMode('armed')
        clearArmTimer()
        armTimerRef.current = setTimeout(exitToIdle, ARM_WINDOW_MS)
        return
      }

      if (modeRef.current === 'armed') {
        clearArmTimer()
        if (navigableSetRef.current.length === 0) {
          exitToIdle()
          return
        }
        const startIndex = Math.max(
          0,
          navigableSetRef.current.findIndex((screen) => screen.screenId === effectiveScreenIdRef.current),
        )
        setSelectedIndex(startIndex)
        setMode('previewing')
        resetInactivityTimer()
        return
      }

      // previewing
      if (navigableSetRef.current.length === 0) return
      const delta = key === 'up' ? -1 : 1
      setSelectedIndex((current) => (current + delta + navigableSetRef.current.length) % navigableSetRef.current.length)
      resetInactivityTimer()
    })
  }, [exitToIdle, resetInactivityTimer])

  const isBrowseModeActive = useCallback(() => modeRef.current !== 'idle', [])

  const renderScreenId = mode === 'previewing' ? (navigableSet[selectedIndex]?.screenId ?? effectiveScreenId) : effectiveScreenId

  const hud: RemoteNavHudState =
    mode === 'previewing'
      ? {
          mode,
          currentScreenName: navigableSet[selectedIndex]?.name ?? null,
          position: navigableSet.length > 0 ? { index: selectedIndex + 1, total: navigableSet.length } : null,
        }
      : { mode, currentScreenName: null, position: null }

  return { hud, renderScreenId, isBrowseModeActive, revertAndExit: exitToIdle }
}
