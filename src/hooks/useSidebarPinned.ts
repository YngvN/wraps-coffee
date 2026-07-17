import { useCallback, useState } from 'react'

const STORAGE_KEY = 'admin.sidebarPinned'

function readStored(): boolean {
  return window.localStorage.getItem(STORAGE_KEY) === 'true'
}

/**
 * Whether the admin has pinned the desktop sidebar rail permanently open
 * (see `AdminSidebarNav`'s own pin-toggle button, above the footer) —
 * pinning also widens `AdminDashboard`'s own reserved layout space for it,
 * so the main content shifts over instead of the rail floating on top of
 * it. A per-device preference (plain `localStorage`, same posture as the
 * light/dark theme choice — see `useTheme`), not synced to other admins/
 * displays.
 */
export function useSidebarPinned() {
  const [isPinned, setIsPinnedState] = useState<boolean>(readStored)

  const setIsPinned = useCallback((next: boolean) => {
    window.localStorage.setItem(STORAGE_KEY, String(next))
    setIsPinnedState(next)
  }, [])

  const togglePinned = useCallback(() => {
    setIsPinned(!isPinned)
  }, [isPinned, setIsPinned])

  return { isPinned, setIsPinned, togglePinned }
}
