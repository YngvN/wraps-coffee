import { useCallback, useEffect, useState } from 'react'

/** The API `electron/preload.cjs` exposes on the admin dashboard's own kiosk window — absent everywhere else (a plain browser tab, or a public `/screens/:id` kiosk window, which never gets this preload script). */
interface ElectronWindowAPI {
  minimizeWindow: () => void
  closeWindow: () => void
  toggleFullscreen: () => Promise<boolean>
  isFullscreen: () => Promise<boolean>
}

declare global {
  interface Window {
    electronAPI?: ElectronWindowAPI
  }
}

/** Whether this page is running inside the Electron kiosk wrapper (see `electron/preload.cjs`) rather than a plain browser tab — `window.electronAPI` only exists there. Lets the dashboard show its own minimize/fullscreen/close window controls (kiosk mode has no native title bar) only where they're actually backed by a real window to act on. */
export function useIsElectron(): boolean {
  return typeof window !== 'undefined' && Boolean(window.electronAPI)
}

/**
 * Minimize/fullscreen-toggle/close actions for the Electron kiosk window
 * hosting this page (see `useIsElectron`) — kiosk mode removes the native
 * title bar these would normally live on. `isFullscreen` mirrors the
 * window's own kiosk state (Electron's term for it), read once on mount and
 * updated from `toggleFullscreen`'s own return value afterward rather than a
 * separate change-event subscription, since this page is the only thing
 * that ever flips it. Calling these outside Electron is a silent no-op —
 * check `useIsElectron` first.
 */
export function useElectronWindowControls() {
  const [isFullscreen, setIsFullscreen] = useState(true)

  useEffect(() => {
    window.electronAPI?.isFullscreen().then(setIsFullscreen)
  }, [])

  const minimize = useCallback(() => window.electronAPI?.minimizeWindow(), [])
  const close = useCallback(() => window.electronAPI?.closeWindow(), [])
  const toggleFullscreen = useCallback(() => {
    window.electronAPI?.toggleFullscreen().then(setIsFullscreen)
  }, [])

  return { isFullscreen, minimize, close, toggleFullscreen }
}
