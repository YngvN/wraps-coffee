function charRange(start: number, end: number): string {
  let chars = ''
  for (let code = start; code <= end; code++) chars += String.fromCharCode(code)
  return chars
}

const CONTROL_CHARS = charRange(0x00, 0x1f) + String.fromCharCode(0x7f)
const BIDI_MARKS = charRange(0x202a, 0x202e) + charRange(0x2066, 0x2069)
const ZERO_WIDTH_CHARS = charRange(0x200b, 0x200d) + String.fromCharCode(0xfeff)

const STRIP_PATTERN = new RegExp(`[${CONTROL_CHARS}${BIDI_MARKS}${ZERO_WIDTH_CHARS}]`, 'g')

/**
 * Strips control characters (incl. newlines/tabs), bidi-override marks, and zero-width characters from a name
 * headed onto a new trust boundary (an mDNS TXT record, a heartbeat pushed to a different physical device), then
 * caps its length — closes off the cheapest ways a raw string could break a single-line display row or visually
 * impersonate a different name. Caps by Unicode code point (`Array.from`), not `String.slice`, so an astral
 * character's surrogate pair is never split in half.
 */
export function sanitizeDisplayName(raw: string, maxLength: number): string {
  const stripped = raw.replace(STRIP_PATTERN, '').trim()
  return Array.from(stripped).slice(0, maxLength).join('')
}
