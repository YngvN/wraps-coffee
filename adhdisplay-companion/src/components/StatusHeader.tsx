import { StyleSheet, Text } from 'react-native'
import { FadeInView } from './FadeInView'

interface StatusHeaderProps {
  /** This device's own name — its dashboard rename if one's been pushed down and persisted (see `pairing.ts`'s `getStoredDeviceLabel`), else the generic `ADHDisplay Companion (${Platform.OS})` fallback. */
  deviceLabel: string
  /** The server this device is currently talking to, identified by whichever of its store name or host is available — see `ServerConnection.storeName`'s own doc comment for why this can be a stale, point-in-time snapshot from whenever this connection was originally discovered/entered, not a live value. */
  connectedTo: string
}

/**
 * A small corner overlay shown on the setup/waiting screens only (`PairingScreen`, `WaitingForAssignmentScreen`)
 * — never on the live kiosk display (`DisplayScreen`), which renders the actual menu/signage content a customer
 * sees and shouldn't carry a permanent debug overlay. Lets whoever is standing in front of the physical TV
 * confirm at a glance which device this is and which server it's paired with, without needing to read through
 * whatever screen-specific copy is showing below it.
 */
export function StatusHeader({ deviceLabel, connectedTo }: StatusHeaderProps) {
  return (
    <FadeInView style={styles.container} pointerEvents="none" slideDistance={0}>
      <Text style={styles.deviceLabel} numberOfLines={1} ellipsizeMode="tail">
        {deviceLabel}
      </Text>
      <Text style={styles.connectedTo} numberOfLines={1} ellipsizeMode="tail">
        Connected to: {connectedTo}
      </Text>
    </FadeInView>
  )
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 16,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 16,
  },
  deviceLabel: { flexShrink: 1, color: '#888', fontSize: 13, fontWeight: '600' },
  connectedTo: { flexShrink: 1, color: '#888', fontSize: 13, textAlign: 'right' },
})
