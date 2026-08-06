import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { browseForServerViaMdns, sweepLanForServer, type ServerConnection } from '../lib/serverConnection'

interface ServerSetupScreenProps {
  onConnected: (connection: ServerConnection) => void
}

type Mode = 'searching' | 'found' | 'manual'

/** How often the LAN sweep retries on its own while sitting on the `searching` screen. */
const SWEEP_RETRY_INTERVAL_MS = 15_000

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
 * Pairing itself (once a server connection is known) instead has the TV
 * *display* a QR code for the admin's phone to scan — see `PairingScreen.tsx`.
 */
export function ServerSetupScreen({ onConnected }: ServerSetupScreenProps) {
  const [mode, setMode] = useState<Mode>('searching')
  const [foundConnection, setFoundConnection] = useState<ServerConnection | null>(null)
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
  // Shared between the mDNS and sweep effects below: whichever discovery
  // source finds a server first sets this, so a result that arrives from
  // the other source afterward gets ignored instead of firing a second
  // setMode('found'). A plain ref, not state — flipping it never needs to
  // trigger a re-render on its own.
  const settledRef = useRef(false)

  // Passive mDNS browse, kept alive for as long as the screen keeps
  // searching. Deliberately its own effect, keyed only on `[mode]` — a
  // `retryTrigger` bump (the "Look for server" button, see the sweep effect
  // below) only needs to restart the *sweep*; a passive listener that's
  // already subscribed doesn't need restarting to "retry." An earlier
  // version of this combined both sources under one effect, which meant
  // every retryTrigger bump also tore down and reconstructed the mDNS
  // browse — a real stop()-then-scan() ordering race against the native
  // bridge for no benefit. Splitting them removes that race entirely
  // instead of working around it.
  useEffect(() => {
    if (mode !== 'searching') return
    settledRef.current = false // fresh discovery attempt: first mount, or a manual -> searching round trip
    const handle = browseForServerViaMdns((result) => {
      if (settledRef.current) return
      settledRef.current = true
      setFoundConnection(result)
      setMode('found') // leaving 'searching' triggers this effect's own cleanup below -> stops listening
    })
    return () => handle.stop()
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
          if (result && !settledRef.current) {
            settledRef.current = true
            setFoundConnection(result)
            setMode('found') // leaving 'searching' triggers this effect's own cleanup -> retries pause
            return
          }
          if (!result) retryTimer = setTimeout(runSweep, SWEEP_RETRY_INTERVAL_MS)
        })
    }

    runSweep()

    return () => {
      cancelled = true
      setIsSweepRunning(false) // otherwise a cleanup mid-flight (e.g. searching -> manual) leaves this stranded true until the next effect run happens to correct it
      if (retryTimer) clearTimeout(retryTimer)
    }
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

  if (mode === 'searching' && !hasSweptOnce) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#dfa93e" />
        <Text style={styles.text}>Looking for an ADHDisplay server on this network…</Text>
      </View>
    )
  }

  if (mode === 'searching') {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>No ADHDisplay server found on this network yet.</Text>
        <Text style={styles.subText}>Checking again automatically every few seconds.</Text>
        <Pressable style={styles.button} onPress={handleLookNow} hasTVPreferredFocus>
          <Text style={styles.buttonText}>{isSweepRunning ? 'Searching…' : 'Look for server'}</Text>
        </Pressable>
        <Pressable style={styles.linkButton} onPress={() => setMode('manual')}>
          <Text style={styles.linkText}>Enter a server manually</Text>
        </Pressable>
      </View>
    )
  }

  if (mode === 'found' && foundConnection) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>Found ADHDisplay at {foundConnection.host} — connect?</Text>
        <Pressable style={styles.button} onPress={() => onConnected(foundConnection)} hasTVPreferredFocus>
          <Text style={styles.buttonText}>Connect</Text>
        </Pressable>
        <Pressable style={styles.linkButton} onPress={() => setMode('manual')}>
          <Text style={styles.linkText}>Enter a server manually</Text>
        </Pressable>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <Text style={styles.text}>
        Enter this server&apos;s address — see Settings → &quot;For developers&quot; in the admin dashboard, or the &quot;On other devices&quot; line
        printed when the server starts.
      </Text>
      <TextInput
        style={styles.input}
        placeholder="192.168.1.47"
        placeholderTextColor="#888"
        value={manualHost}
        onChangeText={setManualHost}
        autoCapitalize="none"
        autoCorrect={false}
        hasTVPreferredFocus
      />
      <TextInput
        style={styles.input}
        placeholder="Sync port (default 4000)"
        placeholderTextColor="#888"
        value={manualWsPort}
        onChangeText={setManualWsPort}
        keyboardType="number-pad"
      />
      <TextInput
        style={styles.input}
        placeholder="Content port (default 4173)"
        placeholderTextColor="#888"
        value={manualContentPort}
        onChangeText={setManualContentPort}
        keyboardType="number-pad"
      />
      <Pressable style={styles.button} onPress={handleManualSubmit}>
        <Text style={styles.buttonText}>Connect</Text>
      </Pressable>
      <Pressable
        style={styles.linkButton}
        onPress={() => {
          setFoundConnection(null)
          setMode('searching')
        }}
      >
        <Text style={styles.linkText}>Search automatically instead</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  text: { color: '#ccc', fontSize: 16, textAlign: 'center' },
  subText: { color: '#888', fontSize: 13, textAlign: 'center' },
  button: { backgroundColor: '#dfa93e', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 8 },
  buttonText: { color: '#111', fontWeight: '700', fontSize: 16 },
  linkButton: { paddingVertical: 8 },
  linkText: { color: '#8ab4f8', fontSize: 14 },
  input: { width: '100%', maxWidth: 320, backgroundColor: '#222', color: '#eee', borderWidth: 1, borderColor: '#444', borderRadius: 6, padding: 10, fontSize: 16 },
})
