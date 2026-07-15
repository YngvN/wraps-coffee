import { Outlet } from 'react-router-dom'
import { useDashboardScreensaverSettings } from '../../../hooks/useDashboardScreensaverSettings'
import { useIdleTimer } from '../../../hooks/useIdleTimer'
import { DashboardScreensaver } from './DashboardScreensaver'
import './AdminLayout.scss'

/** Bare chrome-free shell for the whole `/admin/*` section — no site header, nav, or footer. Also hosts the idle-timeout screensaver (see `DashboardScreensaver`) shared by both the login screen and the dashboard, since both live under this same layout — independent of the kiosk `/screens` display's own scheduled screensaver. */
export function AdminLayout() {
  const [screensaverSettings] = useDashboardScreensaverSettings()
  const idle = useIdleTimer(screensaverSettings.idleMinutes * 60_000, screensaverSettings.enabled)

  return (
    <div className="admin-layout">
      <Outlet />
      {idle && <DashboardScreensaver />}
    </div>
  )
}
