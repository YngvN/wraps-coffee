import { StyleSheet } from 'react-native'
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
 */
export function DisplayScreen({ connection, screenId }: DisplayScreenProps) {
  const url = `${contentOrigin(connection)}/screens/${screenId}?unattended=1`

  return (
    <WebView
      source={{ uri: url }}
      style={styles.webview}
      domStorageEnabled
      javaScriptEnabled
      mediaPlaybackRequiresUserAction={false}
      allowsInlineMediaPlayback
      originWhitelist={['*']}
    />
  )
}

const styles = StyleSheet.create({
  webview: { flex: 1, backgroundColor: '#000' },
})
