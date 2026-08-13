import { useCallback, useEffect, useRef, useState } from 'react'
import { requestFreshDeviceState, sendScreenOverride, subscribeToDeviceConnectionStatus, subscribeToDeviceMessages } from './deviceSocket'
import { syncPreviewCache } from './previewCache'
import { subscribeToRemoteKeyEvents, type RemoteKey } from './remoteKeyEvents'
import type { ServerConnection } from './serverConnection'

/** First press arms (renders a HUD hint); a second press within this window enters browse mode. Generous relative to a real double-click's own ~400ms — this is an arming *state*, not double-click detection, so it can afford to be. */
const ARM_WINDOW_MS = 2500
/** Reverts and exits browse mode after this long with no further press — a screen cycling in front of customers with nobody actually there is a real complaint. */
const INACTIVITY_TIMEOUT_MS = 20_000
/** Safety net for `pendingCommitScreenId` — if neither an `effective-screen` push nor the next
 * heartbeat has confirmed a commit by this long, stop pinning the display to the locally-optimistic
 * value rather than risk it getting stuck there forever on a lost message. Generous relative to the
 * 20s heartbeat interval so a normal round trip never trips it. */
const PENDING_COMMIT_TIMEOUT_MS = 15_000

export interface NavigableScreen {
  screenId: string
  name: string
  /** This screen's own stage-1 screenshot, as a local `file://` uri once `previewCache.ts` has
   * resolved it (or the bare remote URL on web, which has no local cache — see its own doc comment).
   * `null` until resolved, or permanently for a screen with no screenshot at all. */
  previewImage: string | null
}

export type RemoteNavMode = 'idle' | 'armed' | 'previewing'

export interface RemoteNavHudState {
  mode: RemoteNavMode
  /** Only set while `previewing` — the screen currently selected (not yet committed). `null` if the navigable set is empty. */
  currentScreenName: string | null
  /** 1-based position within the navigable set, only set while `previewing` with a non-empty set. */
  position: { index: number; total: number } | null
  /** The currently-selected screen's own cached preview image (see `NavigableScreen.previewImage`) —
   * `null` while `previewing` a screen with no screenshot yet, and always `null` outside `previewing`.
   * `RemoteNavPreview.tsx` renders this as a still image instead of the live `DisplayScreen` for the
   * duration of a browse session. */
  previewImage: string | null
}

export interface UseRemoteNavResult {
  hud: RemoteNavHudState
  /**
   * Which screen `DisplayScreen` should actually render right now. Deliberately **not** affected by
   * `previewing` at all — browsing only ever swaps the still image `RemoteNavPreview` shows (via
   * `hud.previewImage`); the live WebView stays parked on the last confirmed screen for the whole
   * session and navigates exactly once, on commit (see `pendingCommitScreenId` below). This is what
   * makes reverting free (back/timeout/disconnect just stop diverging locally, nothing to restore)
   * and makes a multi-step browse session cost zero WebView navigations until OK is actually pressed.
   */
  renderScreenId: string | null
  /** Whether browse mode (`armed` or `previewing`) is currently active — `App.tsx`'s own triple-back `BackHandler` checks this to decide whether to delegate a back press here instead of counting it toward the disconnect gesture. */
  isBrowseModeActive: () => boolean
  /** Reverts and exits to `idle` — called by `App.tsx`'s own `BackHandler` when browse mode is active. */
  revertAndExit: () => void
  /**
   * Lets `App.tsx`'s own heartbeat loop (already polling every 20s regardless of the device
   * socket's health) correct `effectiveScreenId` from the hub's own freshly-resolved
   * `effectiveScreenID` in every heartbeat response (override ?? assignment — see
   * `resolveEffectiveScreen` server-side; deliberately *not* the raw assignment alone, which would
   * fight a standing remote-nav override every 20s). Without this, a single dropped
   * `effective-screen` push (see `requestFreshDeviceState`'s own doc comment for why that happens)
   * leaves `renderScreenId` showing a stale screen *indefinitely* — the heartbeat's own
   * `state.screenId` only ever wins as a fallback for a `null` `effectiveScreenId`, and once any push
   * has ever landed, it's never `null` again. Calling this every heartbeat bounds the staleness to at
   * most one heartbeat interval instead of forever. A no-op while `previewing` — a live remote-browse
   * session's own local selection must not be interrupted by this. Also clears any still-pending
   * commit, same as a real `effective-screen` push does.
   */
  syncEffectiveScreenId: (screenId: string | null) => void
}

/**
 * TV-remote screen browsing (Remote Screen Navigation spec) — a D-pad
 * up/down double-press arms and enters browse mode, single presses then
 * move a local selection through the hub's own `navigable-set`, OK commits
 * (`sendScreenOverride`) and exits, back/20s-inactivity/disconnect all
 * revert with no server round-trip. Built on commit 10a's native bridge
 * (`remoteKeyEvents.ts`) and commit 9's server-side push protocol
 * (`deviceSocket.ts`). Browsing itself never touches the live WebView — see
 * `renderScreenId`'s own doc comment — it only steps through each screen's
 * own cached screenshot (`previewCache.ts`), synced from `admin.screens` on
 * the hub, showing `RemoteNavPreview` as a still image.
 *
 * Owns its own connection-status subscription (`subscribeToDeviceConnectionStatus`) — call
 * unconditionally from `App.tsx` once (it degrades to inert, connected-gated no-ops before
 * `connectDeviceSocket` has ever been called, same as every other `deviceSocket.ts` subscriber).
 * `connected` gates the whole feature — browse mode is disabled while disconnected (a commit
 * couldn't persist, and the navigable set may be stale), and an in-progress session reverts
 * immediately if the connection drops out from under it.
 *
 * `connection`, when non-null, is used purely to resolve each screen's own preview image to a local
 * file via `previewCache.ts` (it needs `syncOrigin` to turn the hub's relative `?size=medium` path
 * into a fetchable URL) — passed in rather than read from `deviceSocket.ts`'s own module state so this
 * hook stays a pure function of its own inputs.
 */
export function useRemoteNav(connection: ServerConnection | null): UseRemoteNavResult {
  const [navigableSet, setNavigableSet] = useState<NavigableScreen[]>([])
  const [effectiveScreenId, setEffectiveScreenId] = useState<string | null>(null)
  const [pendingCommitScreenId, setPendingCommitScreenId] = useState<string | null>(null)
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
  const connectionRef = useRef(connection)
  connectionRef.current = connection

  const armTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
  const clearPendingCommit = useCallback(() => {
    if (pendingCommitTimerRef.current) {
      clearTimeout(pendingCommitTimerRef.current)
      pendingCommitTimerRef.current = null
    }
    setPendingCommitScreenId(null)
  }, [])

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
      if (message.type === 'navigable-set') {
        const incoming = message.screens
        // Show names/positions immediately, carrying over whatever local preview uri a screen
        // already had — the cache sync below resolves the rest asynchronously rather than blocking
        // browse mode on a round trip.
        setNavigableSet((current) =>
          incoming.map((screen) => ({
            screenId: screen.screenId,
            name: screen.name,
            previewImage: current.find((existing) => existing.screenId === screen.screenId)?.previewImage ?? null,
          })),
        )
        const activeConnection = connectionRef.current
        if (activeConnection) {
          void syncPreviewCache(activeConnection, incoming).then((localUris) => {
            setNavigableSet((current) => current.map((screen) => ({ ...screen, previewImage: localUris[screen.screenId] ?? null })))
          })
        }
      }
      if (message.type === 'effective-screen') {
        setEffectiveScreenId(message.screenId)
        clearPendingCommit()
        // A concurrent admin reassignment arriving mid-preview drops the preview — same
        // precedence rule as a remote commit (spec §D1): the pushed screen always wins.
        if (modeRef.current === 'previewing') exitToIdle()
      }
    })
  }, [exitToIdle, clearPendingCommit])

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
        if (screen) {
          sendScreenOverride(screen.screenId)
          // Pins renderScreenId to the just-committed screen so the WebView navigates exactly once,
          // straight to it, instead of first snapping back to the pre-browse screen while waiting for
          // the hub's own confirmation to round-trip (see renderScreenId's own doc comment).
          setPendingCommitScreenId(screen.screenId)
          if (pendingCommitTimerRef.current) clearTimeout(pendingCommitTimerRef.current)
          pendingCommitTimerRef.current = setTimeout(clearPendingCommit, PENDING_COMMIT_TIMEOUT_MS)
        }
        exitToIdle()
        return
      }

      // up/down
      if (modeRef.current === 'idle') {
        setMode('armed')
        clearArmTimer()
        armTimerRef.current = setTimeout(exitToIdle, ARM_WINDOW_MS)
        // Forces a fresh `navigable-set`/`effective-screen` round trip (see
        // `requestFreshDeviceState`'s own doc comment) before the second press needs either —
        // ARM_WINDOW_MS (2.5s) is generally enough for a reply over a healthy LAN connection. Cheap
        // to call unconditionally here: arming is a user-initiated, low-frequency action, not
        // something that could turn into a request flood.
        requestFreshDeviceState()
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

      // previewing — moves the local selection only; renderScreenId (the live WebView) is
      // untouched, see its own doc comment.
      if (navigableSetRef.current.length === 0) return
      const delta = key === 'up' ? -1 : 1
      setSelectedIndex((current) => (current + delta + navigableSetRef.current.length) % navigableSetRef.current.length)
      resetInactivityTimer()
    })
  }, [exitToIdle, resetInactivityTimer, clearPendingCommit])

  const isBrowseModeActive = useCallback(() => modeRef.current !== 'idle', [])

  const syncEffectiveScreenId = useCallback(
    (screenId: string | null) => {
      if (modeRef.current === 'previewing') return
      setEffectiveScreenId(screenId)
      clearPendingCommit()
    },
    [clearPendingCommit],
  )

  const renderScreenId = pendingCommitScreenId ?? effectiveScreenId

  const hud: RemoteNavHudState =
    mode === 'previewing'
      ? {
          mode,
          currentScreenName: navigableSet[selectedIndex]?.name ?? null,
          position: navigableSet.length > 0 ? { index: selectedIndex + 1, total: navigableSet.length } : null,
          previewImage: navigableSet[selectedIndex]?.previewImage ?? null,
        }
      : { mode, currentScreenName: null, position: null, previewImage: null }

  return { hud, renderScreenId, isBrowseModeActive, revertAndExit: exitToIdle, syncEffectiveScreenId }
}
