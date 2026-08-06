import { CameraView, useCameraPermissions } from 'expo-camera'
import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { parsePairingQrValue } from '../lib/qr'
import { sweepLanForServer, type ServerConnection } from '../lib/serverConnection'

interface ServerSetupScreenProps {
  onConnected: (connection: ServerConnection) => void
}

type Mode = 'sweeping' | 'found' | 'scanning' | 'manual'

/**
 * "No server known" — the very first screen a fresh install/reset lands on.
 * The actual primary path is an automatic LAN sweep (see
 * `sweepLanForServer`), since typing a LAN IP on a bare Android TV stick's
 * D-pad/on-screen keyboard is the worst minute in the whole setup flow, and
 * it's the *first* minute. QR scan and manual host:port entry both stay
 * reachable regardless of how the sweep goes — QR for a second server on
 * the same LAN, or if the sweep is blocked by client-isolated Wi-Fi; manual
 * entry as the last-resort fallback for camera-less TV sticks. On web
 * (Electron/Windows), the QR entry points are hidden entirely — `getUserMedia`
 * needs a secure context this shell won't have, and a kiosk PC has no useful
 * camera anyway — so manual entry is the only fallback there, and the LAN
 * sweep itself also silently degrades to it (`expo-network` can't read a
 * real LAN IP from a web page), same outcome either way.
 */
export function ServerSetupScreen({ onConnected }: ServerSetupScreenProps) {
  const [mode, setMode] = useState<Mode>('sweeping')
  const [foundConnection, setFoundConnection] = useState<ServerConnection | null>(null)
  const [permission, requestPermission] = useCameraPermissions()
  const [manualHost, setManualHost] = useState('')
  const [manualWsPort, setManualWsPort] = useState('4000')
  const [manualContentPort, setManualContentPort] = useState('4173')
  const [scanError, setScanError] = useState<string | null>(null)
  const hasScannedRef = useRef(false)

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

  const handleScan = (value: string) => {
    if (hasScannedRef.current) return
    const parsed = parsePairingQrValue(value)
    if (!parsed) {
      setScanError('Not an ADHDisplay pairing code — try again, or enter the server manually below.')
      return
    }
    hasScannedRef.current = true
    onConnected(parsed)
  }

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
        {Platform.OS !== 'web' && (
          <Pressable style={styles.linkButton} onPress={() => setMode('scanning')}>
            <Text style={styles.linkText}>Scan a QR code instead</Text>
          </Pressable>
        )}
        <Pressable style={styles.linkButton} onPress={() => setMode('manual')}>
          <Text style={styles.linkText}>Enter a server manually</Text>
        </Pressable>
      </View>
    )
  }

  if (mode === 'scanning') {
    if (!permission) return <View style={styles.container} />
    if (!permission.granted) {
      return (
        <View style={styles.container}>
          <Text style={styles.text}>Camera access is needed to scan the pairing QR code shown in Display Manager.</Text>
          <Pressable style={styles.button} onPress={() => void requestPermission()}>
            <Text style={styles.buttonText}>Grant camera access</Text>
          </Pressable>
          <Pressable style={styles.linkButton} onPress={() => setMode('manual')}>
            <Text style={styles.linkText}>Enter a server manually instead</Text>
          </Pressable>
        </View>
      )
    }
    return (
      <View style={styles.container}>
        <CameraView
          style={StyleSheet.absoluteFill}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={(result) => handleScan(result.data)}
        />
        {scanError && (
          <View style={styles.scanErrorBanner}>
            <Text style={styles.text}>{scanError}</Text>
          </View>
        )}
        <Pressable style={[styles.linkButton, styles.overlayLink]} onPress={() => setMode('manual')}>
          <Text style={styles.linkText}>Enter a server manually instead</Text>
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
      {Platform.OS !== 'web' && (
        <Pressable style={styles.linkButton} onPress={() => setMode('scanning')}>
          <Text style={styles.linkText}>Scan a QR code instead</Text>
        </Pressable>
      )}
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
  scanErrorBanner: { position: 'absolute', bottom: 96, left: 24, right: 24, backgroundColor: 'rgba(0,0,0,0.8)', padding: 12, borderRadius: 8 },
  overlayLink: { position: 'absolute', bottom: 40 },
})
