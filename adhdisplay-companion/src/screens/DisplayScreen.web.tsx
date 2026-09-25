import type { CSSProperties } from 'react'
import { StyleSheet, View } from 'react-native'
import { contentOrigin, type ServerConnection } from '../lib/serverConnection'

interface DisplayScreenProps {
  connection: ServerConnection
  screenId: string
  /** Forwarded as `deviceId` for a touch order board — see `DisplayScreen.tsx`'s prop of the same name. */
  machineID: string
}

/**
 * Web/Electron counterpart to `DisplayScreen.tsx` — Metro picks this file
 * over the `.tsx` one automatically for web builds, since `react-native-webview`
 * has no web implementation and would otherwise fail to bundle. Renders the
 * same `/screens/:screenId?unattended=1` URL in a plain `<iframe>` instead of
 * a native WebView; the native file's props (`domStorageEnabled`,
 * `javaScriptEnabled`, `originWhitelist`) have no iframe equivalent because
 * they're already implicitly true/unrestricted for a same-process iframe.
 * `allow="autoplay"` is required, not optional: a cross-origin iframe (the
 * LAN server is a different host:port from this shell's own `app://` origin)
 * does not inherit autoplay permission from the shell's own
 * `autoplay-policy` command-line switch (see `electron/main.cjs`) without it.
 *
 * Relies on the Electron shell's `app://` scheme being registered WITHOUT
 * `secure: true` (see `electron/main.cjs`'s own comment) — the LAN server is
 * always plain `http://`, and a "secure" top-level origin would block this
 * iframe outright as mixed content instead of just loading it.
 */
export function DisplayScreen({ connection, screenId, machineID }: DisplayScreenProps) {
  const url = `${contentOrigin(connection)}/screens/${screenId}?unattended=1&deviceId=${encodeURIComponent(machineID)}`

  return (
    <View style={styles.container}>
      <iframe src={url} title="ADHDisplay" allow="autoplay; fullscreen" style={frameStyle} />
    </View>
  )
}

const frameStyle: CSSProperties = { flex: 1, width: '100%', height: '100%', border: 'none' }

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
})
