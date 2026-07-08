/** A simple two-bar pause glyph, used for the kiosk display's own play/pause toolbar button while stage playback is running — `currentColor`-filled, so it follows whatever color the button itself is drawn in. */
export function PauseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">
      <rect x="6" y="5" width="4" height="14" />
      <rect x="14" y="5" width="4" height="14" />
    </svg>
  )
}
