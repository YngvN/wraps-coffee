import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'

/** Paired (this device is now a real `admin.displayMachines` entry), but no Screen has been assigned to its own synthetic `device` monitor yet — see Display Manager. `App.tsx`'s own heartbeat loop is what moves on from here the moment an admin picks one. */
export function WaitingForAssignmentScreen() {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#dfa93e" />
      <Text style={styles.text}>Paired. Waiting for a screen to be assigned in Display Manager…</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  text: { color: '#ccc', fontSize: 16, textAlign: 'center' },
})
