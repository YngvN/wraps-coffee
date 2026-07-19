/**
 * A random unique id, formatted like a UUID v4. `crypto.randomUUID()` is the
 * natural choice, but browsers only expose it in "secure contexts" (HTTPS,
 * or `localhost`) — this app is routinely opened from a LAN IP over plain
 * HTTP (a kiosk display, a second admin's phone), where it's simply
 * `undefined`, breaking anything that generates a fresh id (splitting a
 * pane, creating/duplicating a screen, adding a weather location, pairing a
 * display). `crypto.getRandomValues()`, unlike `randomUUID()`, has no such
 * restriction, so it's used as the real fallback; a `Math.random()`-based id
 * is a last resort only reached if `crypto` itself is somehow unavailable.
 */
export function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()

  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = crypto.getRandomValues(new Uint8Array(16))
    bytes[6] = (bytes[6] & 0x0f) | 0x40
    bytes[8] = (bytes[8] & 0x3f) | 0x80
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  }

  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`
}
