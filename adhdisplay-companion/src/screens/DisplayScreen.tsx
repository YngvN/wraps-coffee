import { useEffect, useRef } from 'react'
import { Animated, StyleSheet } from 'react-native'
import { WebView } from 'react-native-webview'
import { contentOrigin, type ServerConnection } from '../lib/serverConnection'

interface DisplayScreenProps {
  connection: ServerConnection
  screenId: string
}

/**
 * Loads the existing, unmodified `/screens/:screenId?unattended=1` page in a
 * WebView — the same URL contract `DisplayConnect.tsx` already uses for a
 * plain browser tab, and a plain read-only route requiring no session —
 * rather than a native reimplementation of SplitLayout/LayoutTree/LayoutPane.
 * Once loaded, the WebView's own page runs its own real, unmodified
 * WebSocket sync inside a genuine browser engine, so this native layer never
 * needs its own live-push updates (see this app's own README, "Live
 * updates"). `showFullscreenButton` is deliberately omitted from the URL —
 * true fullscreen (hidden nav/status bar) is handled natively instead (see
 * `App.tsx`'s own `expo-navigation-bar` setup), not via the in-page
 * Fullscreen API, which has no equivalent to trigger unattended anyway.
 *
 * `applicationNameForUserAgent` appends a marker to the WebView's user
 * agent (rather than replacing it) — the loaded page's own bootstrap
 * script (index.html, main wraps-coffee app) checks for it to default
 * straight to dark instead of its usual localStorage/OS-preference lookup,
 * since a fresh WebView profile has neither and would otherwise briefly
 * flash a light background before the screen's own configured color loads.
 * `injectedJavaScriptBeforeContentLoaded` is a belt-and-braces second path
 * to the same result, running before the page's own scripts.
 *
 * `opacity` dips to 0 the instant `screenId` changes (a fresh `source.uri`
 * means the WebView is about to show a blank/loading state while it
 * navigates) and fades back to 1 from `onLoadEnd`, once the new screen's
 * own content is actually ready — covers both a Remote Screen Navigation
 * commit and the very first load (`opacity` starts at 0, so there's no
 * separate "is this the first render" branch needed).
 */
export function DisplayScreen({ connection, screenId }: DisplayScreenProps) {
  const url = `${contentOrigin(connection)}/screens/${screenId}?unattended=1`
  const opacity = useRef(new Animated.Value(0)).current

  useEffect(() => {
    opacity.setValue(0)
  }, [screenId, opacity])

  const handleLoadEnd = () => {
    Animated.timing(opacity, { toValue: 1, duration: 320, useNativeDriver: true }).start()
  }

  return (
    <Animated.View style={[styles.webview, { opacity }]}>
      <WebView
        source={{ uri: url }}
        style={styles.webview}
        domStorageEnabled
        javaScriptEnabled
        mediaPlaybackRequiresUserAction={false}
        allowsInlineMediaPlayback
        originWhitelist={['*']}
        applicationNameForUserAgent="ADHDisplayKiosk"
        injectedJavaScriptBeforeContentLoaded="window.localStorage.setItem('theme', 'dark'); true;"
        onLoadEnd={handleLoadEnd}
      />
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  webview: { flex: 1, backgroundColor: '#111' },
})
