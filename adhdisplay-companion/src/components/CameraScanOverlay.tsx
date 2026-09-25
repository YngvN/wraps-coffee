import { useEffect, useRef, useState, type RefObject } from 'react'
import { AppState, DeviceEventEmitter, requireNativeComponent, StyleSheet, UIManager, View, type ViewProps } from 'react-native'
import type { WebView } from 'react-native-webview'
import { cameraScan, type CameraScanState } from '../lib/cameraScan'

/** The camera reports the same code many times a second while it's in view (and both cameras may see it); one report per code per window. */
const REPEAT_WINDOW_MS = 2000

const NATIVE_VIEW = 'DualCameraScanView'

/** The native scanner from `plugins/withDualCameraScan.js`; null on a build without it (web, Electron), where nothing is rendered. */
const DualCameraScanView = UIManager.getViewManagerConfig?.(NATIVE_VIEW) ? requireNativeComponent<ViewProps & { showPreview: boolean }>(NATIVE_VIEW) : null

/**
 * The Register's camera scanning, laid over the kiosk WebView: the back camera (its main 1× lens) and
 * the front camera scan at the same time, so a code can be held up to either side of the tablet.
 * Mounted only while `cameraScan` is active, so both cameras are released the moment the page switches
 * scanning off. With the preview off the view is a 1×1 transparent speck and nothing of the image is
 * drawn; with it on, both cameras show side by side in the corner to help staff aim. Every code read
 * is handed to the page as an `adhdisplay-camera-code` event (see the page's `onCameraScanCode`).
 * Leaving the foreground turns scanning off.
 */
export function CameraScanOverlay({ webViewRef }: { webViewRef: RefObject<WebView | null> }) {
  const [scan, setScan] = useState<CameraScanState>(cameraScan.get())
  const last = useRef({ code: '', at: 0 })

  useEffect(() => cameraScan.subscribe(setScan), [])

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (status) => {
      if (status !== 'active') cameraScan.stop()
    })
    return () => subscription.remove()
  }, [])

  useEffect(() => {
    const codes = DeviceEventEmitter.addListener('onDualCameraScan', ({ code }: { code: string; camera: string }) => {
      const now = Date.now()
      if (code === last.current.code && now - last.current.at < REPEAT_WINDOW_MS) return
      last.current = { code, at: now }
      // JSON.stringify output is a valid JS expression, so it's safe to inline as the event detail.
      webViewRef.current?.injectJavaScript(`window.dispatchEvent(new CustomEvent('adhdisplay-camera-code', { detail: ${JSON.stringify({ code })} })); true;`)
    })
    // One camera failing leaves the other scanning, so this is only logged.
    const errors = DeviceEventEmitter.addListener('onDualCameraScanError', ({ camera, message }: { camera: string; message: string }) =>
      console.warn(`Camera scan (${camera}): ${message}`),
    )
    return () => {
      codes.remove()
      errors.remove()
    }
  }, [webViewRef])

  if (!scan.active || !DualCameraScanView) return null

  return (
    <View style={scan.showPreview ? styles.preview : styles.hidden} pointerEvents="none">
      <DualCameraScanView style={StyleSheet.absoluteFill} showPreview={scan.showPreview} />
    </View>
  )
}

const styles = StyleSheet.create({
  // Bottom-left, over the register's product tiles, so it never hides the cart's Pay button. Two 4:3 images side by side.
  preview: { position: 'absolute', left: 24, bottom: 24, width: 480, height: 180, borderRadius: 12, overflow: 'hidden', borderWidth: 3, borderColor: '#c62f2f' },
  hidden: { position: 'absolute', right: 0, bottom: 0, width: 1, height: 1, opacity: 0 },
})
