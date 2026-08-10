import { useEffect, useState } from 'react'
import { ActivityIndicator, StyleSheet, Text } from 'react-native'
import { FadeInView } from '../components/FadeInView'
import { FocusableButton } from '../components/FocusableButton'
import { StatusHeader } from '../components/StatusHeader'
import { useDpadNav } from '../hooks/useDpadNav'
import { sendPairingHeartbeat } from '../lib/pairing'
import type { ServerConnection } from '../lib/serverConnection'

const PAIRING_POLL_INTERVAL_MS = 5_000

interface PairingScreenProps {
  connection: ServerConnection
  machineID: string
  deviceLabel: string
  onApproved: () => void
  onDisconnect: () => void
}

/**
 * "Server known, not approved" — polls `pairing-heartbeat` every ~5s until
 * the server reports `status: 'approved'`. No PIN/QR to show or scan: this
 * device just shows up passively in Display Manager's own "Pending
 * approval" section for an admin to approve with one click (see
 * `DisplayManagerView.tsx`). The `#{machineID.slice(-4)}` suffix shown here
 * is the disambiguation fallback that replaces the old PIN's binding role —
 * an admin reads it off this physical screen and matches it against the
 * dashboard's own pending card before clicking Approve, so a mis-click
 * among several near-identical devices pairing at once is still caught.
 * `machineID` is passed in synchronously from `App.tsx`, so the suffix
 * renders immediately, no loading/empty-string window to handle. The
 * Disconnect button here is the same `handleDisconnect` the triple-Back-press
 * gesture and `WaitingForAssignmentScreen`'s own button both already call
 * (see `App.tsx`'s own doc comment) — this screen otherwise has no visible
 * way out of a wrong-server pairing besides that gesture, which isn't
 * discoverable from the screen alone.
 */
export function PairingScreen({ connection, machineID, deviceLabel, onApproved, onDisconnect }: PairingScreenProps) {
  const [error, setError] = useState<string | null>(null)
  // Single item, but still routed through useDpadNav so pressing OK on the remote actually
  // triggers Disconnect — see that hook's own doc comment for why native Android D-pad
  // focus/select can't drive this directly on plain react-native Android.
  const selectedIndex = useDpadNav(1, onDisconnect)

  useEffect(() => {
    let cancelled = false
    const poll = async () => {
      try {
        const result = await sendPairingHeartbeat(connection, machineID, deviceLabel)
        if (cancelled) return
        setError(null)
        if (result.status === 'approved') {
          onApproved()
        }
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

  const idSuffix = `#${machineID.slice(-4)}`

  return (
    <FadeInView style={styles.container}>
      <StatusHeader deviceLabel={deviceLabel} connectedTo={connection.storeName ?? connection.host} />
      <Text style={styles.label}>{deviceLabel}</Text>
      <Text style={styles.idSuffix}>{idSuffix}</Text>
      <ActivityIndicator size="large" color="#dfa93e" />
      <Text style={styles.instructions}>
        Open Display Manager on the ADHDisplay dashboard and approve &quot;{deviceLabel}&quot; ({idSuffix}) to continue.
      </Text>
      {error && <Text style={styles.error}>{error}</Text>}
      <FocusableButton focused={selectedIndex === 0} onPress={onDisconnect}>
        Disconnect
      </FocusableButton>
    </FadeInView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  label: { color: '#eee', fontSize: 18, fontWeight: '600' },
  idSuffix: { color: '#dfa93e', fontSize: 32, fontWeight: '700', letterSpacing: 4 },
  instructions: { color: '#ccc', fontSize: 14, textAlign: 'center' },
  error: { color: '#e06a5f', fontSize: 13 },
})
