/**
 * Requests from the kiosk page to the ADHDisplay Companion app it runs inside — for the things a web
 * page can't do itself: talk to a printer plugged into the tablet by USB, scan barcodes with the
 * tablet's camera, and (later) take a card payment on a Zettle reader.
 *
 * Protocol (mirrored in `adhdisplay-companion/src/lib/webViewBridge.ts`):
 * - page → app: `window.ReactNativeWebView.postMessage(JSON.stringify({ type, requestId, ... }))`;
 * - app → page: a `adhdisplay-native` `CustomEvent` on `window` whose `detail` is
 *   `{ requestId, ok: true, result } | { requestId, ok: false, error }`.
 *
 * - app → page, unasked: a `adhdisplay-camera-code` `CustomEvent` whose `detail` is `{ code }`, for
 *   every code the camera reads while camera scanning is on.
 *
 * Outside the companion (a desktop browser, the admin preview) or on an app build without USB
 * support, `listUsbPrinters` resolves to an empty list rather than failing, so callers can treat "no
 * USB printers" and "no bridge" the same. Likewise `cameraScanAvailable` resolves `false`.
 */

/** A receipt printer plugged into this tablet, as the companion reports it. */
export interface UsbPrinter {
  /** Stable key for this printer across replugs (vendor/product id, plus serial when it has one). */
  key: string
  name: string
}

interface NativeReply {
  requestId: string
  ok: boolean
  result?: unknown
  error?: string
}

declare global {
  interface Window {
    ReactNativeWebView?: { postMessage: (message: string) => void }
  }
}

const REPLY_EVENT = 'adhdisplay-native'

/** Whether this page runs inside the companion app's WebView. */
export function isInsideCompanion(): boolean {
  return typeof window !== 'undefined' && typeof window.ReactNativeWebView?.postMessage === 'function'
}

let nextRequestId = 0

/** Sends one request and waits for its reply. Rejects on an error reply, or after `timeoutMs` with no reply at all (an app build that doesn't know this request type never answers). */
function request<T>(type: string, payload: Record<string, unknown>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    if (!isInsideCompanion()) {
      reject(new Error('Not running inside the companion app'))
      return
    }
    const requestId = `req-${Date.now()}-${nextRequestId++}`
    const onReply = (event: Event) => {
      const reply = (event as CustomEvent<NativeReply>).detail
      if (reply?.requestId !== requestId) return
      cleanup()
      if (reply.ok) resolve(reply.result as T)
      else reject(new Error(reply.error ?? 'The companion app reported an error'))
    }
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error('The companion app did not answer'))
    }, timeoutMs)
    const cleanup = () => {
      clearTimeout(timer)
      window.removeEventListener(REPLY_EVENT, onReply)
    }
    window.addEventListener(REPLY_EVENT, onReply)
    window.ReactNativeWebView?.postMessage(JSON.stringify({ type, requestId, ...payload }))
  })
}

/** Receipt printers plugged into this tablet by USB. Empty outside the companion, or when the app build can't do USB. */
export function listUsbPrinters(): Promise<UsbPrinter[]> {
  return request<UsbPrinter[]>('usb-printers:list', {}, 3000).catch(() => [])
}

/** Base64 without `btoa` on a binary string — `btoa` needs Latin-1 text, and ESC/POS bytes are neither. */
function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

/** Sends a finished ESC/POS job to a USB printer on this tablet. The first print may show Android's "allow access to this USB device" prompt, hence the long timeout. */
export function printOnUsbPrinter(key: string, bytes: Uint8Array): Promise<void> {
  return request<void>('usb-printer:print', { key, data: toBase64(bytes) }, 60000)
}

const CAMERA_CODE_EVENT = 'adhdisplay-camera-code'

/** Whether this app build can scan with the camera. Old builds never answer, so this resolves `false` for them after a short wait. */
export function cameraScanAvailable(): Promise<boolean> {
  return request<boolean>('camera-scan:probe', {}, 1500).then(
    (available) => available === true,
    () => false,
  )
}

/**
 * Turns camera scanning on, with the back and front cameras at once (a customer can hold a phone up to
 * the front, staff a product to the back). The app keeps reading codes until `stopCameraScan`, reporting each through
 * `onCameraScanCode`. With `showPreview` off nothing of the camera image is shown — it's there only when
 * staff need to aim a code that won't read. Rejects if the camera can't start (e.g. permission denied).
 */
export function startCameraScan(options: { showPreview: boolean }): Promise<void> {
  return request<void>('camera-scan:start', options, 10000)
}

/** Shows or hides the small camera preview while scanning stays on. */
export function setCameraPreview(show: boolean): Promise<void> {
  return request<void>('camera-scan:preview', { show }, 3000)
}

/** Turns camera scanning off, releasing the camera. Never rejects. */
export function stopCameraScan(): Promise<void> {
  return request<void>('camera-scan:stop', {}, 3000).catch(() => undefined)
}

/** Calls `listener` with every code the camera reads. Returns an unsubscribe function. */
export function onCameraScanCode(listener: (code: string) => void): () => void {
  const handler = (event: Event) => {
    const code = (event as CustomEvent<{ code?: unknown }>).detail?.code
    if (typeof code === 'string') listener(code)
  }
  window.addEventListener(CAMERA_CODE_EVENT, handler)
  return () => window.removeEventListener(CAMERA_CODE_EVENT, handler)
}

/**
 * Takes a card payment on the Zettle reader through Zettle's native Android SDK. Scaffolding only: the
 * app has no Zettle SDK yet (it needs a Zettle developer account and a GitHub Packages token to build,
 * see `server/payments/zettleAdapter.ts`), so this always rejects. TODO: send `zettle:charge` with the
 * amount and reference once the native module exists, and resolve with its outcome.
 */
export function chargeWithZettle(payment: { reference: string; amountMinor: number }): Promise<{ ok: boolean }> {
  return Promise.reject(new Error(`Card payments on the Zettle reader are not available in this app version yet (payment ${payment.reference})`))
}
