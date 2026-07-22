import { Outlet, useLocation } from 'react-router-dom'
import { useDashboardScreensaverSettings } from '../../../hooks/useDashboardScreensaverSettings'
import { useIdleTimer } from '../../../hooks/useIdleTimer'
import { DashboardScreensaver } from './DashboardScreensaver'
import { DashboardWindowControls } from './DashboardWindowControls'
import './AdminLayout.scss'

/**
 * Bare chrome-free shell for the whole `/admin/*` section — no site header,
 * nav, or footer. Also hosts the idle-timeout screensaver (see
 * `DashboardScreensaver`) shared by both the login screen and the
 * dashboard, since both live under this same layout — independent of the
 * kiosk `/screens` display's own scheduled screensaver.
 *
 * Also hosts the fixed top-right `DashboardWindowControls` (minimize/
 * fullscreen/close) — but only on the login screen. Once inside the
 * dashboard, `AdminTopNavbar` renders its own inline copy right next to the
 * username instead (a fixed overlay there would sit right underneath the
 * dashboard's own sticky top navbar, invisible behind it).
 */
export function AdminLayout() {
  const [screensaverSettings] = useDashboardScreensaverSettings()
  const idle = useIdleTimer(screensaverSettings.idleMinutes * 60_000, screensaverSettings.enabled)
  const location = useLocation()
  const isDashboard = location.pathname.startsWith('/admin/dashboard')

  return (
    <div className="admin-layout">
      {!isDashboard && <DashboardWindowControls />}
      <Outlet />
      {idle && <DashboardScreensaver />}
    </div>
  )
}
