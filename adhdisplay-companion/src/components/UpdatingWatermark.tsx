import * as Updates from 'expo-updates'
import { StyleSheet, Text, View } from 'react-native'

interface UpdatingWatermarkProps {
  /** `true` from the moment a Tier 2/3 `install-update` message arrives (see `App.tsx`'s own `startUpdateListener` wiring) — there's no further granular signal once the native download+install begins, since the process may be killed at any point, so "install-update received" is the only real trigger available. Never needs to be cleared explicitly for a *successful* install: the whole app (this component included) restarts. */
  installingApk: boolean
}

/**
 * A small, non-blocking on-screen indicator shown while an update is in
 * progress, so whoever's standing in front of the kiosk doesn't mistake it
 * for the screen being frozen/broken. Covers both mechanisms:
 * - Tier 1 (OTA): driven directly by `expo-updates`' own `useUpdates()` hook
 *   (`isChecking`/`isDownloading`) — clears itself automatically once that
 *   resolves, including on a failed check.
 * - Tier 2/3 (APK): driven by `installingApk`, threaded down from `App.tsx`.
 */
export function UpdatingWatermark({ installingApk }: UpdatingWatermarkProps) {
  const { isChecking, isDownloading } = Updates.useUpdates()
  if (!isChecking && !isDownloading && !installingApk) return null

  return (
    <View style={styles.container} pointerEvents="none">
      <Text style={styles.text}>Updating…</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
  },
  text: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
})
