import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { sweepLanForServer, type ServerConnection } from '../lib/serverConnection'

interface ServerSetupScreenProps {
  onConnected: (connection: ServerConnection) => void
}

type Mode = 'sweeping' | 'found' | 'manual'

/**
 * "No server known" — the very first screen a fresh install/reset lands on.
 * The primary path is an automatic LAN sweep (see `sweepLanForServer`),
 * since typing a LAN IP on a bare Android TV stick's D-pad/on-screen
 * keyboard is the worst minute in the whole setup flow, and it's the
 * *first* minute. Manual host:port entry stays reachable as the fallback if
 * the sweep is blocked (e.g. client-isolated Wi-Fi) or finds nothing.
 * There is deliberately no camera/QR-scanning path here — most TV
 * boxes/sticks don't have a camera, and the ones that do make a poor
 * substitute for aiming a phone at a screen. Pairing itself (once a server
 * connection is known) instead has the TV *display* a QR code for the
 * admin's phone to scan — see `PairingScreen.tsx`.
 */
export function ServerSetupScreen({ onConnected }: ServerSetupScreenProps) {
  const [mode, setMode] = useState<Mode>('sweeping')
  const [foundConnection, setFoundConnection] = useState<ServerConnection | null>(null)
  const [manualHost, setManualHost] = useState('')
  const [manualWsPort, setManualWsPort] = useState('4000')
  const [manualContentPort, setManualContentPort] = useState('4173')

  useEffect(() => {
    if (mode !== 'sweeping') return
    let cancelled = false
    sweepLanForServer().then((result) => {
      if (cancelled) return
      if (result) {
        setFoundConnection(result)
        setMode('found')
      } else {
        setMode('manual')
      }
    })
    return () => {
      cancelled = true
    }
  }, [mode])

  const handleManualSubmit = () => {
    const wsPort = Number(manualWsPort)
    const contentPort = Number(manualContentPort)
    if (!manualHost.trim() || !Number.isFinite(wsPort) || !Number.isFinite(contentPort)) return
    onConnected({ host: manualHost.trim(), wsPort, contentPort })
  }

  if (mode === 'sweeping') {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#dfa93e" />
        <Text style={styles.text}>Looking for an ADHDisplay server on this network…</Text>
      </View>
    )
  }

  if (mode === 'found' && foundConnection) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>Found ADHDisplay at {foundConnection.host} — connect?</Text>
        <Pressable style={styles.button} onPress={() => onConnected(foundConnection)}>
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
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  text: { color: '#ccc', fontSize: 16, textAlign: 'center' },
  button: { backgroundColor: '#dfa93e', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 8 },
  buttonText: { color: '#111', fontWeight: '700', fontSize: 16 },
  linkButton: { paddingVertical: 8 },
  linkText: { color: '#8ab4f8', fontSize: 14 },
  input: { width: '100%', maxWidth: 320, backgroundColor: '#222', color: '#eee', borderWidth: 1, borderColor: '#444', borderRadius: 6, padding: 10, fontSize: 16 },
})
