import { StyleSheet, Text, View } from 'react-native'
import type { RemoteNavHudState } from '../lib/remoteNav'

interface RemoteNavHudProps {
  hud: RemoteNavHudState
}

/**
 * Overlay for TV-remote screen browsing (Remote Screen Navigation spec) —
 * an arming hint while `armed`, the currently-selected screen/position
 * while `previewing`. Renders nothing while `idle`, which is the normal
 * state the vast majority of the time. Only ever shown on top of the live
 * `DisplayScreen` (see `App.tsx`) — there's nothing to browse to from the
 * setup/pairing/waiting screens.
 */
export function RemoteNavHud({ hud }: RemoteNavHudProps) {
  if (hud.mode === 'idle') return null

  return (
    <View style={styles.container} pointerEvents="none">
      {hud.mode === 'armed' && <Text style={styles.hint}>Press ↑ / ↓ again to browse screens</Text>}
      {hud.mode === 'previewing' && (
        <>
          <Text style={styles.screenName} numberOfLines={1} ellipsizeMode="tail">
            {hud.currentScreenName ?? 'No screens available'}
          </Text>
          {hud.position && (
            <Text style={styles.position}>
              {hud.position.index} / {hud.position.total}
            </Text>
          )}
          <Text style={styles.hint}>Press OK to apply — reverts automatically in 20s</Text>
        </>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 32,
    left: 32,
    right: 32,
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
  screenName: { color: '#fff', fontSize: 22, fontWeight: '700' },
  position: { color: '#ccc', fontSize: 14, fontVariant: ['tabular-nums'] },
  hint: { color: '#aaa', fontSize: 13 },
})
