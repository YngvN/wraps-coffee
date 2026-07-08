/** A simple double-play-triangle "fast forward" glyph, used for the kiosk display's own toolbar button that speeds stage advancement up to every 2 seconds — `currentColor`-filled, so it follows whatever color the button itself is drawn in. */
export function FastForwardIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">
      <path d="M2 5v14l10-7z" />
      <path d="M12 5v14l10-7z" />
    </svg>
  )
}
