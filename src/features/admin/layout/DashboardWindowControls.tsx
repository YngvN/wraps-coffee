import { useEffect, useState } from 'react'
import { useElectronWindowControls, useIsElectron } from '../../../hooks/useElectronWindowControls'
import { useLanguage } from '../../../i18n'
import { CloseIcon, FullscreenIcon, MinimizeIcon } from './WindowControlIcons'
import './DashboardWindowControls.scss'

const browserFullscreenSupported = typeof document !== 'undefined' && typeof document.documentElement.requestFullscreen === 'function'

/**
 * Top-right window-chrome buttons for the admin dashboard (and login screen,
 * since both share `AdminLayout`). Inside the Electron kiosk wrapper (see
 * `useIsElectron`) kiosk mode has no native title bar at all, so this is the
 * only way to minimize, toggle fullscreen, or close the window — all three
 * show. In a plain browser tab there's nothing to minimize/close (a script
 * can't touch either), so only a fullscreen button shows, using the
 * standard Fullscreen API instead of Electron's kiosk mode.
 */
export function DashboardWindowControls() {
  const { t } = useLanguage()
  const isElectron = useIsElectron()
  const electronControls = useElectronWindowControls()
  const [browserFullscreen, setBrowserFullscreen] = useState(false)

  useEffect(() => {
    if (isElectron) return
    const handleChange = () => setBrowserFullscreen(document.fullscreenElement !== null)
    document.addEventListener('fullscreenchange', handleChange)
    return () => document.removeEventListener('fullscreenchange', handleChange)
  }, [isElectron])

  const toggleBrowserFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen()
    else document.documentElement.requestFullscreen()
  }

  if (!isElectron) {
    if (!browserFullscreenSupported) return null
    return (
      <div className="dashboard-window-controls">
        <button
          type="button"
          className="dashboard-window-controls__button"
          onClick={toggleBrowserFullscreen}
          aria-label={t(browserFullscreen ? 'admin.windowControls.exitFullscreenLabel' : 'admin.windowControls.enterFullscreenLabel')}
          title={t(browserFullscreen ? 'admin.windowControls.exitFullscreenLabel' : 'admin.windowControls.enterFullscreenLabel')}
        >
          <FullscreenIcon active={!browserFullscreen} />
        </button>
      </div>
    )
  }

  return (
    <div className="dashboard-window-controls">
      <button
        type="button"
        className="dashboard-window-controls__button"
        onClick={electronControls.minimize}
        aria-label={t('admin.windowControls.minimizeLabel')}
        title={t('admin.windowControls.minimizeLabel')}
      >
        <MinimizeIcon />
      </button>
      <button
        type="button"
        className="dashboard-window-controls__button"
        onClick={electronControls.toggleFullscreen}
        aria-label={t(electronControls.isFullscreen ? 'admin.windowControls.exitFullscreenLabel' : 'admin.windowControls.enterFullscreenLabel')}
        title={t(electronControls.isFullscreen ? 'admin.windowControls.exitFullscreenLabel' : 'admin.windowControls.enterFullscreenLabel')}
      >
        <FullscreenIcon active={!electronControls.isFullscreen} />
      </button>
      <button
        type="button"
        className="dashboard-window-controls__button dashboard-window-controls__button--close"
        onClick={electronControls.close}
        aria-label={t('admin.windowControls.closeLabel')}
        title={t('admin.windowControls.closeLabel')}
      >
        <CloseIcon />
      </button>
    </div>
  )
}
