import type { RefObject } from 'react'
import type { WebView, WebViewMessageEvent } from 'react-native-webview'
import { cameraScan } from './cameraScan'
import { listUsbPrinters, printOnUsbPrinter } from './usbPrinter'

/**
 * The native side of the kiosk page's requests to this app (the page side is the main app's
 * `src/lib/companionBridge.ts`, which documents the protocol): USB receipt printers, and the
 * Register's camera scanning (`cameraScan.ts`, drawn by `CameraScanOverlay`). Each request carries a
 * `requestId`; the reply is dispatched back into the page as an `adhdisplay-native` event with the
 * same id. Unknown request types are ignored, which the page's own timeout turns into a clean failure.
 */
export function handleWebViewMessage(event: WebViewMessageEvent, webView: RefObject<WebView | null>) {
  let request: { type?: unknown; requestId?: unknown; key?: unknown; data?: unknown; showPreview?: unknown; show?: unknown }
  try {
    request = JSON.parse(event.nativeEvent.data)
  } catch {
    return
  }
  if (typeof request.requestId !== 'string') return
  const requestId = request.requestId

  const reply = (body: { ok: true; result?: unknown } | { ok: false; error: string }) => {
    // JSON.stringify output is a valid JS expression, so it's safe to inline as the event detail.
    webView.current?.injectJavaScript(`window.dispatchEvent(new CustomEvent('adhdisplay-native', { detail: ${JSON.stringify({ requestId, ...body })} })); true;`)
  }
  const fail = (error: unknown) => reply({ ok: false, error: error instanceof Error ? error.message : String(error) })

  if (request.type === 'usb-printers:list') {
    listUsbPrinters()
      .then((result) => reply({ ok: true, result }))
      .catch(fail)
  } else if (request.type === 'usb-printer:print' && typeof request.key === 'string' && typeof request.data === 'string') {
    printOnUsbPrinter(request.key, request.data)
      .then(() => reply({ ok: true }))
      .catch(fail)
  } else if (request.type === 'camera-scan:probe') {
    // Answering at all is the capability: an older app build ignores this and the page times out.
    reply({ ok: true, result: true })
  } else if (request.type === 'camera-scan:start') {
    // An older page also sends `facing`; it's ignored now that both cameras scan at once.
    cameraScan
      .start(request.showPreview === true)
      .then(() => reply({ ok: true }))
      .catch(fail)
  } else if (request.type === 'camera-scan:preview') {
    cameraScan.setPreview(request.show === true)
    reply({ ok: true })
  } else if (request.type === 'camera-scan:stop') {
    cameraScan.stop()
    reply({ ok: true })
  }
}
