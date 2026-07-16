import { Outlet } from 'react-router-dom'
import { useDashboardScreensaverSettings } from '../../../hooks/useDashboardScreensaverSettings'
import { useIdleTimer } from '../../../hooks/useIdleTimer'
import { DashboardScreensaver } from './DashboardScreensaver'
import { DashboardWindowControls } from './DashboardWindowControls'
import './AdminLayout.scss'

/** Bare chrome-free shell for the whole `/admin/*` section — no site header, nav, or footer. Also hosts the idle-timeout screensaver (see `DashboardScreensaver`) shared by both the login screen and the dashboard, since both live under this same layout — independent of the kiosk `/screens` display's own scheduled screensaver. Also hosts `DashboardWindowControls` (minimize/fullscreen/close), for the same reason — the Electron kiosk window wrapping either page has no native title bar of its own. */
export function AdminLayout() {
  const [screensaverSettings] = useDashboardScreensaverSettings()
  const idle = useIdleTimer(screensaverSettings.idleMinutes * 60_000, screensaverSettings.enabled)

  return (
    <div className="admin-layout">
      <DashboardWindowControls />
      <Outlet />
      {idle && <DashboardScreensaver />}
    </div>
  )
}
