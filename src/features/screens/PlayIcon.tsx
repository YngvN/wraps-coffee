/** A simple play triangle, used for the kiosk display's own play/pause toolbar button while stage playback is paused — `currentColor`-filled, so it follows whatever color the button itself is drawn in. */
export function PlayIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">
      <path d="M7 5v14l12-7z" />
    </svg>
  )
}
