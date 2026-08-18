import { useEffect, useRef, useState } from 'react'
import { Animated, Image, StyleSheet } from 'react-native'
import type { RemoteNavHudState } from '../lib/remoteNav'

interface RemoteNavPreviewProps {
  hud: RemoteNavHudState
}

const FADE_DURATION_MS = 220

/**
 * Full-bleed still-image layer for TV-remote screen browsing (Remote Screen Navigation spec) — shown
 * only while `previewing`, sitting between the live `DisplayScreen` (below) and `RemoteNavHud`'s own
 * name/position overlay (above) in `App.tsx`. This is what makes stepping through screens with the
 * D-pad free: `remoteNav.ts`'s own `renderScreenId` deliberately never changes during a preview (see
 * its doc comment), so the WebView underneath stays parked on the last confirmed screen and this
 * layer alone swaps images — no navigation, no clocks/weather/video restarting, no black frame.
 *
 * Renders `hud.previewImage` (a local `file://` uri once `previewCache.ts` has resolved it, see
 * `NavigableScreen`'s own doc comment) or, absent that (a screen with no screenshot yet), a plain dark
 * backdrop — `RemoteNavHud`'s own name/position text is what identifies the screen in that case, same
 * fallback posture as `ScreenCard.tsx`'s own live-render fallback on the admin side, just without the
 * live render (a *device* has no business ever mounting a redundant WebView while just browsing).
 *
 * `lastHud`/`shouldRender` mirror `RemoteNavHud.tsx`'s own technique exactly, for the same reason:
 * `hud.mode` flips to `'idle'` (and `previewImage` to `null`) the instant browsing ends, and rendering
 * that directly would blank the image out instantly instead of letting it fade away together with the
 * HUD text above it.
 */
export function RemoteNavPreview({ hud }: RemoteNavPreviewProps) {
  const visible = hud.mode === 'previewing'
  const [lastHud, setLastHud] = useState(hud)
  const [shouldRender, setShouldRender] = useState(visible)
  const opacity = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (hud.mode === 'previewing') setLastHud(hud)
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
      {lastHud.previewImage && <Image source={{ uri: lastHud.previewImage }} style={styles.image} resizeMode="contain" />}
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#111',
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: { width: '100%', height: '100%' },
})
