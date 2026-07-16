/** A single horizontal line near the bottom of the glyph — the conventional "minimize" symbol, matching `AdminNavIcons`' own `currentColor`-stroked conventions. */
export function MinimizeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <line x1="4" y1="19" x2="20" y2="19" />
    </svg>
  )
}

interface FullscreenIconProps {
  /** Whether the window is currently in kiosk/fullscreen mode — swaps between four corner brackets pointing outward (enter) and inward (exit), same idea as most browsers' own fullscreen toggle icon. */
  active: boolean
}

/** Four corner brackets, pointing outward to enter fullscreen or inward to exit it (see `active`) — `DashboardWindowControls`' toggle button. */
export function FullscreenIcon({ active }: FullscreenIconProps) {
  return active ? (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 4H5a1 1 0 0 0-1 1v4" />
      <path d="M15 4h4a1 1 0 0 1 1 1v4" />
      <path d="M9 20H5a1 1 0 0 1-1-1v-4" />
      <path d="M15 20h4a1 1 0 0 0 1-1v-4" />
    </svg>
  ) : (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 9V5a1 1 0 0 1 1-1h4" />
      <path d="M20 9V5a1 1 0 0 0-1-1h-4" />
      <path d="M4 15v4a1 1 0 0 0 1 1h4" />
      <path d="M20 15v4a1 1 0 0 1-1 1h-4" />
    </svg>
  )
}

/** A simple X — the conventional "close" symbol, matching `AdminNavIcons`' own `currentColor`-stroked conventions. */
export function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <line x1="5" y1="5" x2="19" y2="19" />
      <line x1="19" y1="5" x2="5" y2="19" />
    </svg>
  )
}
