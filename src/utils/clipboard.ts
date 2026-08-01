/**
 * Copies `text` to the clipboard, working even outside a secure context —
 * `navigator.clipboard` only exists when the page was loaded over HTTPS or
 * from `localhost`, but this app's normal way of being reached from a
 * second device (a kiosk display, another admin's phone) is plain HTTP over
 * the LAN, where that API is `undefined` and calling it throws. Falls back
 * to the older `document.execCommand('copy')` approach via a hidden,
 * off-screen textarea in that case. Resolves `true` on success, `false` if
 * both approaches failed (nothing left to fall back to, or the browser
 * blocked it) — callers should treat that as a silent no-op, not an error
 * worth surfacing.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // Fall through to the legacy approach below — some browsers still reject this outside a
      // secure context despite the API itself existing.
    }
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  // Off-screen rather than `display: none` — some browsers refuse to select/copy an element
  // that isn't actually rendered.
  textarea.style.position = 'fixed'
  textarea.style.top = '-1000px'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.focus()
  textarea.select()
  let succeeded = false
  try {
    succeeded = document.execCommand('copy')
  } catch {
    // Already `false` — nothing more to do.
  }
  document.body.removeChild(textarea)
  return succeeded
}
