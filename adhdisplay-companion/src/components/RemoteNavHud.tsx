import { useEffect, useRef, useState } from 'react'
import { Animated, StyleSheet, Text } from 'react-native'
import type { RemoteNavHudState } from '../lib/remoteNav'

interface RemoteNavHudProps {
  hud: RemoteNavHudState
}

const FADE_DURATION_MS = 220

/**
 * Overlay for TV-remote screen browsing (Remote Screen Navigation spec) —
 * an arming hint while `armed`, the currently-selected screen/position
 * while `previewing`. Fades in when entering either of those from `idle`,
 * fades back out when reverting. Only ever shown on top of the live
 * `DisplayScreen` (see `App.tsx`) — there's nothing to browse to from the
 * setup/pairing/waiting screens.
 *
 * `lastHud` (rather than rendering straight from the `hud` prop) keeps the
 * last non-`idle` content on screen for the duration of the fade-out —
 * `hud.mode` itself flips to `'idle'` immediately, and rendering that
 * directly would blank the hint/screen-name/position text out instantly
 * while the container was still visibly fading, instead of the whole thing
 * fading away together. `shouldRender` unmounts the overlay only once that
 * fade-out animation has actually finished, not the instant `hud` goes idle.
 */
export function RemoteNavHud({ hud }: RemoteNavHudProps) {
  const visible = hud.mode !== 'idle'
  const [lastHud, setLastHud] = useState(hud)
  const [shouldRender, setShouldRender] = useState(visible)
  const opacity = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (hud.mode !== 'idle') setLastHud(hud)
  }, [hud])

  useEffect(() => {
    if (visible) setShouldRender(true)
    Animated.timing(opacity, { toValue: visible ? 1 : 0, duration: FADE_DURATION_MS, useNativeDriver: true }).start(({ finished }) => {
      if (finished && !visible) setShouldRender(false)
    })
  }, [visible, opacity])

  if (!shouldRender) return null

  return (
    <Animated.View style={[styles.container, { opacity }]} pointerEvents="none">
      {lastHud.mode === 'armed' && <Text style={styles.hint}>Press ↑ / ↓ again to browse screens</Text>}
      {lastHud.mode === 'previewing' && (
        <>
          <Text style={styles.screenName} numberOfLines={1} ellipsizeMode="tail">
            {lastHud.currentScreenName ?? 'No screens available'}
          </Text>
          {lastHud.position && (
            <Text style={styles.position}>
              {lastHud.position.index} / {lastHud.position.total}
            </Text>
          )}
          <Text style={styles.hint}>Press OK to apply — reverts automatically in 20s</Text>
        </>
      )}
    </Animated.View>
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
