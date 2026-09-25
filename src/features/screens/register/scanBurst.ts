/**
 * Tells a keyboard-wedge scanner apart from a person typing. A USB or Bluetooth scanner "types" the
 * whole code within a few milliseconds per character and ends with Enter; nobody types that fast. So
 * the register listens to every key press on the page (no text field to focus, so the tablet's
 * on-screen keyboard never opens) and only treats a fast burst ending in Enter as a scan.
 */

/** Longest gap between two characters of one scan. Scanners manage a few ms; Bluetooth ones on Android up to ~30 ms. */
export const MAX_CHAR_GAP_MS = 60
/** Longest gap before the final Enter. More forgiving, since some scanners (and `adb shell input`) send it separately. */
export const MAX_ENTER_GAP_MS = 800
/** Shortest scan accepted — shorter than any barcode (EAN-8), so stray key presses never count. */
export const MIN_SCAN_LENGTH = 6
/** Longest scan kept — a pickup QR is about 60 characters. */
export const MAX_SCAN_LENGTH = 200

/** Characters collected so far, and when the last one arrived. */
export interface BurstState {
  buffer: string
  lastAt: number
}

/** A fresh state with nothing collected. */
export const EMPTY_BURST: BurstState = { buffer: '', lastAt: 0 }

/**
 * Feeds one key press (`KeyboardEvent.key`) at time `at` (ms). Returns the next state, plus the scanned
 * text when this key completed a scan. Modifier keys (Shift, for upper-case letters in a QR payload)
 * are ignored without breaking the burst.
 */
export function feedKey(state: BurstState, key: string, at: number): { state: BurstState; scanned?: string } {
  if (key === 'Enter' || key === 'Tab') {
    const scanned = state.buffer.length >= MIN_SCAN_LENGTH && at - state.lastAt <= MAX_ENTER_GAP_MS ? state.buffer : undefined
    return { state: EMPTY_BURST, scanned }
  }
  if (key.length !== 1) return { state } // Shift, Alt, arrows, …
  // A slow key starts a new burst, so a person's typing never builds up into a scan.
  const continues = state.buffer.length > 0 && at - state.lastAt <= MAX_CHAR_GAP_MS
  const buffer = ((continues ? state.buffer : '') + key).slice(-MAX_SCAN_LENGTH)
  return { state: { buffer, lastAt: at } }
}
