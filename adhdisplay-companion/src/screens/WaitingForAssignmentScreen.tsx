import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'

interface WaitingForAssignmentScreenProps {
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
export function WaitingForAssignmentScreen({ onDisconnect }: WaitingForAssignmentScreenProps) {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#dfa93e" />
      <Text style={styles.text}>Paired. Waiting for a screen to be assigned in Display Manager…</Text>
      <Pressable style={styles.button} onPress={onDisconnect}>
        <Text style={styles.buttonText}>Disconnect</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  text: { color: '#ccc', fontSize: 16, textAlign: 'center' },
  button: { backgroundColor: '#dfa93e', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 8 },
  buttonText: { color: '#111', fontWeight: '700', fontSize: 16 },
})
