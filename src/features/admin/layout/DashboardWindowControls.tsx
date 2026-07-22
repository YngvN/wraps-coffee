import { useEffect, useState } from 'react'
import { useElectronWindowControls, useIsElectron } from '../../../hooks/useElectronWindowControls'
import { useLanguage } from '../../../i18n'
import { CloseIcon, FullscreenIcon, MinimizeIcon } from './WindowControlIcons'
import './DashboardWindowControls.scss'

const browserFullscreenSupported = typeof document !== 'undefined' && typeof document.documentElement.requestFullscreen === 'function'

interface DashboardWindowControlsProps {
  /** `'fixed'` (the default) pins the buttons to the top-right corner of the viewport, for pages with nothing else already claiming that spot (the login screen, the screen editor). `'inline'` renders as a plain flex item instead, for embedding next to other content that already controls its own position (the admin dashboard's top navbar, right after the username). */
  variant?: 'fixed' | 'inline'
  /** Fades the buttons out (and disables pointer events) without unmounting them — for callers that auto-hide this after mouse/touch inactivity, e.g. the screen editor's own `useIdleVisibility`. */
  hidden?: boolean
}

/**
 * Window-chrome buttons (minimize/fullscreen/close) shared by the admin
 * dashboard (and login screen, since both share `AdminLayout`) and the
 * screen editor. Inside the Electron kiosk wrapper (see `useIsElectron`)
 * kiosk mode has no native title bar at all, so this is the only way to
 * minimize, toggle fullscreen, or close the window — all three show. In a
 * plain browser tab there's nothing to minimize/close (a script can't touch
 * either), so only a fullscreen button shows, using the standard Fullscreen
 * API instead of Electron's kiosk mode.
 */
export function DashboardWindowControls({ variant = 'fixed', hidden = false }: DashboardWindowControlsProps) {
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

  const wrapperClassName = [
    'dashboard-window-controls',
    variant === 'fixed' && 'dashboard-window-controls--fixed',
    hidden && 'dashboard-window-controls--hidden',
  ]
    .filter(Boolean)
    .join(' ')

  if (!isElectron) {
    if (!browserFullscreenSupported) return null
    return (
      <div className={wrapperClassName}>
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
    <div className={wrapperClassName}>
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
