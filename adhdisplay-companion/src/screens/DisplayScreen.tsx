import { useEffect, useRef } from 'react'
import { Animated, Platform, StyleSheet } from 'react-native'
import { WebView } from 'react-native-webview'
import { contentOrigin, type ServerConnection } from '../lib/serverConnection'

interface DisplayScreenProps {
  connection: ServerConnection
  screenId: string
  /**
   * This device's own machine id, forwarded into the page URL as `deviceId` so a touch order board on
   * the loaded screen can identify which approved device is changing an order (the kiosk page itself
   * has no session — see `POST /display-orders/status` in the main app's `server/index.ts`).
   * Deliberately *not* named `displayMachineId`: the kiosk page treats that param as a cue to follow
   * the machine's own assignment itself, which would fight this app's remote-nav overrides.
   */
  machineID: string
  /**
   * This unit's own admin-set image-resolution ceiling, from the heartbeat response
   * (`HeartbeatResult.maxImagePx`). Forwarded into the page URL because the kiosk page cannot read it
   * for itself — it is unauthenticated, and `admin.displayMachines` is a permissioned synced key. See
   * `useDisplayImageCap` on the web side for how it is read back and validated.
   */
  maxImagePx?: 'auto' | number
  /**
   * This unit's own admin-set CSS layout width, from the heartbeat response
   * (`HeartbeatResult.renderWidthPx`). Forwarded into the page URL for the same reason `maxImagePx`
   * above is — and it specifically has to arrive as a *URL param* rather than be applied later, since
   * the kiosk rewrites its viewport meta from this before its bundle ever runs (a post-boot change
   * would cost a full re-layout). See `useDisplayRenderWidth` on the web side.
   */
  renderWidthPx?: 'auto' | number
}

/**
 * How long after a new screen has finished loading its predecessor's retained page state is dropped.
 * Long enough that the release never overlaps the incoming screen's own first paints (the fade-in
 * alone is 320ms, and a stage-heavy screen keeps decoding well past that), short enough that a kiosk
 * rotating between screens isn't holding two pages' worth of bitmaps for any meaningful fraction of
 * its uptime.
 */
const HISTORY_RELEASE_DELAY_MS = 10_000

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
export function DisplayScreen({ connection, screenId, machineID, maxImagePx = 'auto', renderWidthPx = 'auto' }: DisplayScreenProps) {
  // Both params are included even when `'auto'` so the URL is stable for a given configuration — a
  // param that appears and disappears would make the WebView re-navigate (and re-load the whole kiosk
  // page) on the first heartbeat after launch, since `source.uri` changing is what triggers a
  // navigation.
  const url = `${contentOrigin(connection)}/screens/${screenId}?unattended=1&maxImagePx=${maxImagePx}&renderWidthPx=${renderWidthPx}&deviceId=${encodeURIComponent(machineID)}`
  const opacity = useRef(new Animated.Value(0)).current
  const webViewRef = useRef<WebView>(null)
  const releaseTimer = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    opacity.setValue(0)
  }, [screenId, opacity])

  // A screen change swaps `source.uri` in place rather than remounting, so the WebView keeps the
  // previous page in its back-forward list and that page's bitmaps stay resident behind the live one.
  // Cancel any release still pending from the outgoing screen (a fast remote-nav browse session can
  // change `screenId` several times inside one delay window, and each would otherwise leave its own
  // timer armed), and cancel on unmount so a released component can't fire into a dead ref.
  useEffect(() => {
    return () => clearTimeout(releaseTimer.current)
  }, [screenId])

  const handleLoadEnd = () => {
    Animated.timing(opacity, { toValue: 1, duration: 320, useNativeDriver: true }).start()

    // Deliberately `clearHistory` and NOT `clearCache`: the goal is to drop the *previous page's*
    // retained state, while keeping the HTTP cache that makes the kiosk's own repeat image/font
    // fetches free. `clearCache` would force every asset to re-download on the next rotation — the
    // opposite of the intent. Android-only: it is an `AndroidWebViewCommands` member in
    // react-native-webview, and the web/Electron build renders an iframe instead (DisplayScreen.web.tsx).
    if (Platform.OS !== 'android') return
    clearTimeout(releaseTimer.current)
    releaseTimer.current = setTimeout(() => webViewRef.current?.clearHistory?.(), HISTORY_RELEASE_DELAY_MS)
  }

  return (
    <Animated.View style={[styles.webview, { opacity }]}>
      <WebView
        ref={webViewRef}
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
        // Exposes this WebView over `webview_devtools_remote` so the diagnostics harness can attach a
        // CDP tracer (diagnostics/pane-resize-stutter/scripts/07-tv-cdp-trace.ts). react-native-webview
        // already enables debugging when React Native's own BuildConfig.DEBUG is set, but that is an
        // indirection through which artifact Gradle resolved rather than anything this app controls —
        // setting it explicitly from `__DEV__` makes a debug build's traceability a property of this
        // file. Stays false in release builds, which is what keeps a shipped kiosk non-inspectable.
        webviewDebuggingEnabled={__DEV__}
      />
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  webview: { flex: 1, backgroundColor: '#111' },
})
