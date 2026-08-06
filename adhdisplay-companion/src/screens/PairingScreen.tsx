import { useEffect, useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { sendPairingHeartbeat } from '../lib/pairing'
import type { ServerConnection } from '../lib/serverConnection'

const PAIRING_POLL_INTERVAL_MS = 5_000

interface PairingScreenProps {
  connection: ServerConnection
  machineID: string
  deviceLabel: string
  onApproved: () => void
}

/**
 * "Server known, not approved" — shows whatever PIN `pairing-heartbeat`
 * currently hands back, full-screen, polling every ~5s until the server
 * reports `status: 'approved'` (an admin typed this PIN into Display
 * Manager). The PIN itself is never generated here — this screen just
 * displays whatever the server's response says, including across a
 * rotation once `PIN_TTL_MS` lapses server-side (see DisplayManagerView.tsx's
 * own "PIN refreshed" indicator on the admin side for the other half of
 * this — an admin who reads a PIN, walks away, and comes back later needs
 * to know it's since changed, not think it's simply wrong).
 */
export function PairingScreen({ connection, machineID, deviceLabel, onApproved }: PairingScreenProps) {
  const [pin, setPin] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const poll = async () => {
      try {
        const result = await sendPairingHeartbeat(connection, machineID, deviceLabel)
        if (cancelled) return
        setError(null)
        if (result.status === 'approved') {
          onApproved()
          return
        }
        setPin(result.pin ?? null)
      } catch {
        if (!cancelled) setError('Could not reach the server — retrying…')
      }
    }
    void poll()
    const interval = setInterval(() => void poll(), PAIRING_POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [connection, machineID, deviceLabel, onApproved])

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{deviceLabel}</Text>
      <Text style={styles.instructions}>Enter this PIN in Display Manager to approve this display</Text>
      {pin ? <Text style={styles.pin}>{pin}</Text> : <ActivityIndicator size="large" color="#dfa93e" />}
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  label: { color: '#eee', fontSize: 18, fontWeight: '600' },
  instructions: { color: '#ccc', fontSize: 14, textAlign: 'center' },
  pin: { color: '#dfa93e', fontSize: 72, fontWeight: '700', letterSpacing: 8 },
  error: { color: '#e06a5f', fontSize: 13 },
})
