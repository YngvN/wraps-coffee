/** A bar followed by a play triangle pointing left, used for the kiosk display's own "previous stage" toolbar button — `currentColor`-filled, same style as `PlayIcon`/`PauseIcon`/`FastForwardIcon`, so it follows whatever color the button itself is drawn in. */
export function PreviousStepIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">
      <rect x="4.5" y="5" width="2.5" height="14" />
      <path d="M19 5v14l-10-7z" />
    </svg>
  )
}
