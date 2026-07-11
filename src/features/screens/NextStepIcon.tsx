/** A play triangle followed by a bar, used for the kiosk display's own "next stage" toolbar button — `currentColor`-filled, same style as `PlayIcon`/`PauseIcon`/`FastForwardIcon`, so it follows whatever color the button itself is drawn in. */
export function NextStepIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">
      <path d="M5 5v14l10-7z" />
      <rect x="17" y="5" width="2.5" height="14" />
    </svg>
  )
}
