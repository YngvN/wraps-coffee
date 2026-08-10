import { ActivityIndicator, StyleSheet, Text } from 'react-native'
import { FadeInView } from '../components/FadeInView'
import { FocusableButton } from '../components/FocusableButton'
import { StatusHeader } from '../components/StatusHeader'
import { useDpadNav } from '../hooks/useDpadNav'
import type { ServerConnection } from '../lib/serverConnection'

interface WaitingForAssignmentScreenProps {
  deviceLabel: string
  connection: ServerConnection
  onDisconnect: () => void
}

/**
 * Paired (this device is now a real `admin.displayMachines` entry), but no
 * Screen has been assigned to its own synthetic `device` monitor yet — see
 * Display Manager. `App.tsx`'s own heartbeat loop is what moves on from
 * here the moment an admin picks one. The Disconnect button forgets this
 * device's own server connection (see `clearServerConnection`'s own doc
 * comment for the exact scope — local to this device only, no server call,
 * no revoke) — a plain, always-visible button, no confirmation, since this
 * screen already has chrome and nothing to accidentally trigger it.
 */
export function WaitingForAssignmentScreen({ deviceLabel, connection, onDisconnect }: WaitingForAssignmentScreenProps) {
  // Single item, but still routed through useDpadNav (rather than a plain FocusableButton
  // with no `focused` prop) so pressing OK on the remote actually triggers Disconnect — see
  // that hook's own doc comment for why native Android D-pad focus/select can't drive this
  // directly on plain react-native Android.
  const selectedIndex = useDpadNav(1, onDisconnect)
  return (
    <FadeInView style={styles.container}>
      <StatusHeader deviceLabel={deviceLabel} connectedTo={connection.storeName ?? connection.host} />
      <ActivityIndicator size="large" color="#dfa93e" />
      <Text style={styles.text}>Paired. Waiting for a screen to be assigned in Display Manager…</Text>
      <FocusableButton focused={selectedIndex === 0} onPress={onDisconnect}>
        Disconnect
      </FocusableButton>
    </FadeInView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  text: { color: '#ccc', fontSize: 16, textAlign: 'center' },
})
