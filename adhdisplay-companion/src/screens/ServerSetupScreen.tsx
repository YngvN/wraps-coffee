import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Animated, BackHandler, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity } from 'react-native'
import { FadeInView } from '../components/FadeInView'
import { FocusableButton } from '../components/FocusableButton'
import { useDpadNav } from '../hooks/useDpadNav'
import { useFocusGrow } from '../hooks/useFocusGrow'
import { browseForServerViaMdns, sweepLanForServer, type ServerConnection } from '../lib/serverConnection'

interface ServerSetupScreenProps {
  onConnected: (connection: ServerConnection) => void
}

type Mode = 'searching' | 'found' | 'list' | 'manual'

/** How often the LAN sweep retries on its own while sitting on the `searching` screen. */
const SWEEP_RETRY_INTERVAL_MS = 15_000

/**
 * How long to keep collecting discovery results after the *first* one
 * resolves before rendering anything selectable — absorbs mDNS-vs-sweep
 * arrival skew for the same server, plus a second server trailing slightly
 * behind the first, both sub-second gaps in practice. `mode` deliberately
 * stays `'searching'` for this entire window (see `isSettling` below) so the
 * mDNS/sweep effects, both keyed on `[mode]`, aren't torn down and restarted
 * partway through it.
 */
const SETTLE_WINDOW_MS = 1000

/** Dedup key for `registerFoundConnection` — `pickIPv4` (see `serverConnection.ts`) already normalises `host` to an IPv4 literal whenever one's available on both the mDNS and sweep paths, so this is enough to recognise the same physical server found twice without any new host normalisation here. */
function connectionKey(connection: ServerConnection): string {
  return `${connection.host}:${connection.wsPort}`
}

interface ServerRowProps {
  connection: ServerConnection
  focused: boolean
  onPress: () => void
}

const SERVER_ROW_PADDING = 14

/**
 * One row in `'list'` mode's server picker — its own component (not inlined in the `.map()`
 * below) purely so it can call `useFocusGrow` (React's rules of hooks forbid calling a hook a
 * variable number of times inside a loop/callback).
 */
function ServerRow({ connection, focused, onPress }: ServerRowProps) {
  const extraPadding = useFocusGrow(focused)
  return (
    <TouchableOpacity
      style={[styles.serverRow, focused && styles.serverRowFocused, { padding: Animated.add(SERVER_ROW_PADDING, extraPadding) }]}
      onPress={onPress}
      focusable={false}
      activeOpacity={0.7}
    >
      <Text style={styles.serverRowName} numberOfLines={1} ellipsizeMode="tail">
        {connection.storeName || 'ADHDisplay'}
      </Text>
      {/* Host stays visible on every row, unconditionally — it's the only guaranteed way to tell two
          same-named or both-unnamed servers apart, and it's also the only thing a person can actually
          check when a name *looks* right but shouldn't be (a spoofed/impersonating store name on a shared
          LAN). Don't "clean this up" as redundant once names are reliably sanitized — it's doing double
          duty on purpose. */}
      <Text style={styles.serverRowHost}>{connection.host}</Text>
    </TouchableOpacity>
  )
}

/**
 * "No server known" — the very first screen a fresh install/reset lands on.
 * Discovery runs two sources side by side while this screen is showing:
 * a passive mDNS/DNS-SD browse (`browseForServerViaMdns`) that stays
 * subscribed for as long as the screen keeps searching, typically resolving
 * in well under a second, plus an active LAN subnet sweep
 * (`sweepLanForServer`) that retries on its own every `SWEEP_RETRY_INTERVAL_MS`
 * as a fallback for networks where mDNS's multicast dependency doesn't work
 * (e.g. client-isolated Wi-Fi). Typing a LAN IP on a bare Android TV stick's
 * D-pad/on-screen keyboard is the worst minute in the whole setup flow, and
 * it's the *first* minute, so a "Look for server" button lets the user force
 * an immediate sweep retry instead of waiting, and manual host:port entry
 * stays reachable as a persistent fallback link rather than the automatic
 * destination after one failed pass. There is deliberately no camera/
 * QR-scanning path here — most TV boxes/sticks don't have a camera, and the
 * ones that do make a poor substitute for aiming a phone at a screen.
 * Pairing itself (once a server connection is known) needs no camera/PIN on
 * either side — the device just shows up passively in Display Manager for
 * an admin to approve with one click, see `PairingScreen.tsx`.
 *
 * More than one server can be found on a LAN with multiple store locations
 * or a dev + prod box — see `SETTLE_WINDOW_MS`/`registerFoundConnection` for
 * how results are collected before deciding whether to show a single
 * confirm screen or a selection list, and `isSettling`/`acceptingResultsRef`
 * for how that decision, once made, stays frozen for the rest of this
 * screen visit rather than mutating whichever screen is already showing.
 */
export function ServerSetupScreen({ onConnected }: ServerSetupScreenProps) {
  const [mode, setMode] = useState<Mode>('searching')
  const [foundConnections, setFoundConnections] = useState<ServerConnection[]>([])
  const [isSweepRunning, setIsSweepRunning] = useState(false)
  // Flips true after the first sweep pass resolves; never reset while `mode`
  // stays 'searching', and deliberately NOT reset on a manual -> searching
  // round trip either — the "Looking for a server…" first-attempt copy is
  // about the first attempt on this screen visit, not the first attempt
  // since coming back from manual entry.
  const [hasSweptOnce, setHasSweptOnce] = useState(false)
  const [retryTrigger, setRetryTrigger] = useState(0)
  const [manualHost, setManualHost] = useState('')
  const [manualWsPort, setManualWsPort] = useState('4000')
  const [manualContentPort, setManualContentPort] = useState('4173')
  // Mirrors `foundConnections` for synchronous reads from the settle timer's
  // callback (a plain closure over state would see a stale, possibly-empty
  // array from whichever render scheduled the timeout).
  const foundConnectionsRef = useRef<ServerConnection[]>([])
  // Guards against starting more than one settle timer per discovery attempt.
  const settleTimerStartedRef = useRef(false)
  // Flips false the instant the settle window's decision is made (single
  // confirm vs. list), *before* `setMode` even runs — closes the narrow race
  // where a result resolves in the same tick the timer fires but before
  // React has torn down the mDNS/sweep effects that produced it. A result
  // arriving after this point is silently dropped, never added to
  // `foundConnections`, so whichever screen just rendered can't be mutated
  // out from under a focused item.
  const acceptingResultsRef = useRef(true)

  const isSettling = mode === 'searching' && foundConnections.length > 0

  const registerFoundConnection = (result: ServerConnection) => {
    if (!acceptingResultsRef.current) return
    setFoundConnections((current) => {
      const index = current.findIndex((c) => connectionKey(c) === connectionKey(result))
      let next = current
      if (index === -1) {
        next = [...current, result]
      } else if (!current[index].storeName && result.storeName) {
        next = current.slice()
        next[index] = { ...next[index], storeName: result.storeName }
      }
      foundConnectionsRef.current = next
      return next
    })
    if (!settleTimerStartedRef.current) {
      settleTimerStartedRef.current = true
      setTimeout(() => {
        acceptingResultsRef.current = false
        setMode(foundConnectionsRef.current.length >= 2 ? 'list' : 'found')
      }, SETTLE_WINDOW_MS)
    }
  }

  // Passive mDNS browse, kept alive for as long as the screen keeps
  // searching (which now spans the settle window too, since `mode` stays
  // 'searching' throughout it — see `isSettling`). Deliberately its own
  // effect, keyed only on `[mode]` — a `retryTrigger` bump (the "Look for
  // server" button, see the sweep effect below) only needs to restart the
  // *sweep*; a passive listener that's already subscribed doesn't need
  // restarting to "retry." An earlier version of this combined both sources
  // under one effect, which meant every retryTrigger bump also tore down
  // and reconstructed the mDNS browse — a real stop()-then-scan() ordering
  // race against the native bridge for no benefit. Splitting them removes
  // that race entirely instead of working around it.
  useEffect(() => {
    if (mode !== 'searching') return
    // Fresh discovery attempt: first mount, or a manual -> searching round trip.
    foundConnectionsRef.current = []
    settleTimerStartedRef.current = false
    acceptingResultsRef.current = true
    const handle = browseForServerViaMdns((result) => {
      registerFoundConnection(result)
    })
    return () => handle.stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- registerFoundConnection is stable across a given 'searching' run; including it would restart the browse on every render.
  }, [mode])

  useEffect(() => {
    if (mode !== 'searching') return
    let cancelled = false
    let retryTimer: ReturnType<typeof setTimeout> | null = null

    const runSweep = () => {
      setIsSweepRunning(true)
      // .catch(() => null): sweepLanForServer()'s Promise<ServerConnection | null>
      // signature only describes its happy path — a throw from the fetch/socket
      // layer on an unusual TV network stack must still be treated as "not found
      // this pass," not left to fall through unhandled. Without this, a rejection
      // would skip straight past setIsSweepRunning(false)/the retry schedule,
      // permanently stranding the screen on "Searching…" with no way out short
      // of restarting the app — exactly the failure this screen exists to
      // prevent. No console on this device, but the log is retrievable via
      // `adb logcat`.
      sweepLanForServer()
        .catch((err) => {
          console.warn('sweepLanForServer failed', err)
          return null
        })
        .then((result) => {
          if (cancelled) return
          setIsSweepRunning(false)
          setHasSweptOnce(true)
          if (result) {
            registerFoundConnection(result)
            return
          }
          retryTimer = setTimeout(runSweep, SWEEP_RETRY_INTERVAL_MS)
        })
    }

    runSweep()

    return () => {
      cancelled = true
      setIsSweepRunning(false) // otherwise a cleanup mid-flight (e.g. searching -> manual) leaves this stranded true until the next effect run happens to correct it
      if (retryTimer) clearTimeout(retryTimer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- registerFoundConnection is stable across a given 'searching' run; including it would restart the sweep on every render.
  }, [mode, retryTrigger])

  const handleLookNow = () => {
    if (isSweepRunning) return // no-op rather than stacking a second concurrent sweep
    setRetryTrigger((n) => n + 1)
  }

  const handleManualSubmit = () => {
    const wsPort = Number(manualWsPort)
    const contentPort = Number(manualContentPort)
    if (!manualHost.trim() || !Number.isFinite(wsPort) || !Number.isFinite(contentPort)) return
    onConnected({ host: manualHost.trim(), wsPort, contentPort })
  }

  const handleSearchAutomatically = () => {
    setFoundConnections([])
    setMode('searching')
  }

  // Matches exactly the condition the interactive 'searching' JSX below renders under —
  // the other two 'searching' sub-states (isSettling / !hasSweptOnce) are loading spinners
  // with no navigable items at all.
  const showSearchingButtons = mode === 'searching' && !isSettling && hasSweptOnce
  /**
   * `'manual'` mode's own 5 items (3 `TextInput`s, indices 0-2, then the 2 buttons, indices
   * 3-4) — all part of this hook, same as every other mode's items, so all 5 get a real, JS-driven
   * ring (confirmed reliable everywhere else in this file) rather than depending on native focus
   * events for it. Two earlier designs were tried and confirmed broken on real hardware first:
   *
   * 1. Reactively calling `.focus()` on whichever `TextInput` ref `selectedIndex` pointed at
   *    (a plain effect keyed on `selectedIndex`) — the moment a `TextInput` gains real native
   *    focus this way, Android's key event dispatch stops reaching this app's own
   *    `dispatchKeyEvent` override (`withKeyEventBridge.js`) *at all*, even before any keyboard
   *    is visibly shown — breaking D-pad input for the rest of the screen, not just that input.
   * 2. Leaving the `TextInput`s on bare native focus (`hasTVPreferredFocus`) and driving their
   *    ring off their own `onFocus`/`onBlur` — confirmed via `adb shell dumpsys input_method`
   *    that these never fire for real D-pad-driven focus on this hardware either (same
   *    unreliability `useDpadNav`'s own doc comment already established for plain
   *    `View`/`TouchableOpacity` — evidently true for `TextInput` here too, contrary to the
   *    reasonable-sounding assumption that its real IME-backed focus callbacks would differ).
   *
   * This is the third design: browsing (`selectedIndex` moving on up/down) never touches real
   * focus at all, so the D-pad bridge stays intact the whole time — `.focus()` is only ever
   * called once, imperatively, as the direct result of an explicit "select" press on one of the
   * 3 input indices (see `handleDpadSelect` below), the same deliberate gesture that already
   * activates a button. From that point the person is editing text, same as using any on-screen
   * keyboard — D-pad browsing naturally isn't available again until they submit (see each
   * `TextInput`'s own `onSubmitEditing`, which blurs it back to hand control back to this hook).
   */
  const manualItemRefs = useRef<(TextInput | null)[]>([])
  const dpadItemCount = showSearchingButtons
    ? 2
    : mode === 'found' && foundConnections[0]
      ? 2
      : mode === 'list'
        ? foundConnections.length + 1
        : mode === 'manual'
          ? 5
          : 0
  const handleDpadSelect = (index: number) => {
    if (showSearchingButtons) {
      if (index === 0) handleLookNow()
      else setMode('manual')
      return
    }
    if (mode === 'found' && foundConnections[0]) {
      if (index === 0) onConnected(foundConnections[0])
      else setMode('manual')
      return
    }
    if (mode === 'list') {
      if (index < foundConnections.length) onConnected(foundConnections[index])
      else setMode('manual')
      return
    }
    if (mode === 'manual') {
      if (index <= 2) manualItemRefs.current[index]?.focus()
      else if (index === 3) handleManualSubmit()
      else handleSearchAutomatically()
    }
  }
  const selectedIndex = useDpadNav(dpadItemCount, handleDpadSelect)

  // Feature: pressing Back while on the manual-entry screen returns to auto-search, rather than
  // just counting toward the global triple-Back-press disconnect gesture (App.tsx's own
  // top-level listener) — registered only while `mode === 'manual'`, and only for as long as
  // that's true, so leaving this mode any other way (Connect, "Search automatically") doesn't
  // leave a stale listener intercepting Back on some *later* screen. `BackHandler` calls the
  // most-recently-registered listener first, so this takes priority over the app-level one
  // while mounted.
  useEffect(() => {
    if (mode !== 'manual') return
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      handleSearchAutomatically()
      return true
    })
    return () => sub.remove()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handleSearchAutomatically is stable across renders (only closes over stable setState setters).
  }, [mode])

  if (mode === 'searching' && isSettling) {
    return (
      <FadeInView key="settling" style={styles.container}>
        <ActivityIndicator size="large" color="#dfa93e" />
        <Text style={styles.text}>Found a server — checking for others…</Text>
      </FadeInView>
    )
  }

  if (mode === 'searching' && !hasSweptOnce) {
    return (
      <FadeInView key="first-search" style={styles.container}>
        <ActivityIndicator size="large" color="#dfa93e" />
        <Text style={styles.text}>Looking for an ADHDisplay server on this network…</Text>
      </FadeInView>
    )
  }

  if (mode === 'searching') {
    return (
      <FadeInView key="searching" style={styles.container}>
        <Text style={styles.text}>No ADHDisplay server found on this network yet.</Text>
        <Text style={styles.subText}>Checking again automatically every few seconds.</Text>
        <FocusableButton focused={selectedIndex === 0} onPress={handleLookNow}>
          {isSweepRunning ? 'Searching…' : 'Look for server'}
        </FocusableButton>
        <FocusableButton variant="link" focused={selectedIndex === 1} onPress={() => setMode('manual')}>
          Enter a server manually
        </FocusableButton>
      </FadeInView>
    )
  }

  if (mode === 'found' && foundConnections[0]) {
    const foundConnection = foundConnections[0]
    return (
      <FadeInView key="found" style={styles.container}>
        <Text style={styles.foundName} numberOfLines={1} ellipsizeMode="tail">
          {foundConnection.storeName || 'ADHDisplay'}
        </Text>
        <Text style={styles.text}>Found at {foundConnection.host} — connect?</Text>
        <FocusableButton focused={selectedIndex === 0} onPress={() => onConnected(foundConnection)}>
          Connect
        </FocusableButton>
        <FocusableButton variant="link" focused={selectedIndex === 1} onPress={() => setMode('manual')}>
          Enter a server manually
        </FocusableButton>
      </FadeInView>
    )
  }

  if (mode === 'list') {
    return (
      <FadeInView key="list" style={styles.container}>
        <Text style={styles.text}>Found {foundConnections.length} ADHDisplay servers — choose one</Text>
        <ScrollView style={styles.serverList} contentContainerStyle={styles.serverListContent}>
          {foundConnections.map((connection, index) => (
            <ServerRow key={connectionKey(connection)} connection={connection} focused={selectedIndex === index} onPress={() => onConnected(connection)} />
          ))}
        </ScrollView>
        <FocusableButton variant="link" focused={selectedIndex === foundConnections.length} onPress={() => setMode('manual')}>
          Enter a server manually
        </FocusableButton>
      </FadeInView>
    )
  }

  return (
    <FadeInView key="manual" style={styles.container}>
      <Text style={styles.text}>
        Enter this server&apos;s address — see Settings → &quot;For developers&quot; in the admin dashboard, or the &quot;On other devices&quot; line
        printed when the server starts.
      </Text>
      <TextInput
        ref={(ref) => {
          manualItemRefs.current[0] = ref
        }}
        style={[styles.input, selectedIndex === 0 && styles.inputFocused]}
        placeholder="192.168.1.47"
        placeholderTextColor="#888"
        value={manualHost}
        onChangeText={setManualHost}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="done"
        onSubmitEditing={() => manualItemRefs.current[0]?.blur()}
      />
      <TextInput
        ref={(ref) => {
          manualItemRefs.current[1] = ref
        }}
        style={[styles.input, selectedIndex === 1 && styles.inputFocused]}
        placeholder="Sync port (default 4000)"
        placeholderTextColor="#888"
        value={manualWsPort}
        onChangeText={setManualWsPort}
        keyboardType="number-pad"
        returnKeyType="done"
        onSubmitEditing={() => manualItemRefs.current[1]?.blur()}
      />
      <TextInput
        ref={(ref) => {
          manualItemRefs.current[2] = ref
        }}
        style={[styles.input, selectedIndex === 2 && styles.inputFocused]}
        placeholder="Content port (default 4173)"
        placeholderTextColor="#888"
        value={manualContentPort}
        onChangeText={setManualContentPort}
        keyboardType="number-pad"
        returnKeyType="done"
        onSubmitEditing={() => manualItemRefs.current[2]?.blur()}
      />
      <FocusableButton focused={selectedIndex === 3} onPress={handleManualSubmit}>
        Connect
      </FocusableButton>
      <FocusableButton variant="link" focused={selectedIndex === 4} onPress={handleSearchAutomatically}>
        Search automatically instead
      </FocusableButton>
    </FadeInView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  foundName: { color: '#fff', fontSize: 22, fontWeight: '700', textAlign: 'center', width: '100%', maxWidth: 320 },
  text: { color: '#ccc', fontSize: 16, textAlign: 'center' },
  subText: { color: '#888', fontSize: 13, textAlign: 'center' },
  // borderColor-only change on focus (borderWidth stays constant throughout) — same
  // "no layout shift on focus" reasoning as FocusableButton's own focus ring, just swapping
  // shades on an already-visible border instead of appearing from nothing.
  input: { width: '100%', maxWidth: 320, backgroundColor: '#222', color: '#eee', borderWidth: 1, borderColor: '#444', borderRadius: 6, padding: 10, fontSize: 16 },
  inputFocused: { borderColor: '#dfa93e' },
  serverList: { width: '100%', maxWidth: 360, maxHeight: 320 },
  serverListContent: { gap: 10 },
  serverRow: { backgroundColor: '#222', borderWidth: 1, borderColor: '#444', borderRadius: 8 },
  serverRowFocused: { backgroundColor: '#2a2a2a', borderColor: '#dfa93e', borderWidth: 2 },
  serverRowName: { color: '#fff', fontSize: 18, fontWeight: '700' },
  serverRowHost: { color: '#888', fontSize: 13, marginTop: 4 },
})
