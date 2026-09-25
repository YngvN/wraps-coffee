import { Camera } from 'expo-camera'

/** What the camera overlay should be doing right now. `active: false` means both cameras are released. */
export interface CameraScanState {
  active: boolean
  showPreview: boolean
}

type Listener = (state: CameraScanState) => void

let state: CameraScanState = { active: false, showPreview: false }
const listeners = new Set<Listener>()

function set(next: CameraScanState) {
  state = next
  for (const listener of listeners) listener(state)
}

/**
 * Camera scanning for the kiosk page's Register pane, as one small app-wide store: the page turns it
 * on and off over the WebView bridge (`webViewBridge.ts`), and `CameraScanOverlay` (rendered beside
 * the WebView) runs the back and front cameras together only while `active`. Off by default; the page's privacy switch is the
 * only thing that turns it on, and a screen change or the app leaving the foreground turns it off.
 */
export const cameraScan = {
  get: () => state,
  subscribe(listener: Listener): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
  /** Asks for camera permission (Android's prompt the first time), then turns scanning on. Rejects when permission is refused. */
  async start(showPreview: boolean): Promise<void> {
    const permission = await Camera.requestCameraPermissionsAsync()
    if (!permission.granted) throw new Error('Camera permission was not granted')
    set({ active: true, showPreview })
  },
  setPreview(showPreview: boolean): void {
    set({ ...state, showPreview })
  },
  stop(): void {
    if (state.active) set({ ...state, active: false, showPreview: false })
  },
}
