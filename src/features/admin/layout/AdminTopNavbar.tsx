import { NavLink } from 'react-router-dom'
import { useAdminSession } from '../../../hooks/useAdminSession'
import { useLanguage } from '../../../i18n'
import { OverviewIcon, SettingsIcon } from './AdminNavIcons'
import { MessagesDropdown } from './MessagesDropdown'
import { NotificationsDropdown } from './NotificationsDropdown'
import { StoreBrandHeader } from './StoreBrandHeader'
import { UploadsIndicator } from './UploadsIndicator'
import './AdminTopNavbar.scss'

interface AdminTopNavbarProps {
  /** Whether the mobile sidebar overlay is currently open — mirrors `AdminDashboard`'s own state, since the hamburger toggle now lives here instead of as its own standalone fixed button. */
  isSidebarOpen: boolean
  onToggleSidebar: () => void
}

/**
 * Fixed top bar for the whole admin dashboard (and login screen, via
 * `AdminLayout`): the mobile sidebar toggle, store brand, and quick-access
 * shortcuts to Overview ("home"), Settings ("wrench" — the same
 * destination as the sidebar rail's own Settings item, just one click
 * closer), `NotificationsDropdown` (bell — new orders + out-of-stock
 * tracked products), `MessagesDropdown` (envelope — unread messages), and
 * `UploadsIndicator` (upload arrow — any image/video upload the global
 * `uploadManager` is still transferring or transcoding, hidden entirely
 * once nothing is in flight), plus the logged-in username. No avatar picture (none exists) and no
 * profile dropdown — the user wants the existing sidebar-footer logout
 * button left exactly where it is, not duplicated/moved here.
 */
export function AdminTopNavbar({ isSidebarOpen, onToggleSidebar }: AdminTopNavbarProps) {
  const { t } = useLanguage()
  const { session } = useAdminSession()

  return (
    <header className="admin-top-navbar">
      <button
        type="button"
        className={`admin-top-navbar__toggle${isSidebarOpen ? ' admin-top-navbar__toggle--open' : ''}`}
        aria-label={isSidebarOpen ? t('admin.common.closeMenu') : t('admin.common.openMenu')}
        aria-expanded={isSidebarOpen}
        onClick={onToggleSidebar}
      >
        <span />
        <span />
        <span />
      </button>

      <StoreBrandHeader />

      <nav className="admin-top-navbar__shortcuts">
        <NavLink
          to="overview"
          className={({ isActive }) => `admin-top-navbar__icon-link${isActive ? ' admin-top-navbar__icon-link--active' : ''}`}
          aria-label={t('admin.nav.overview')}
          title={t('admin.nav.overview')}
        >
          <OverviewIcon />
        </NavLink>
        <NavLink
          to="settings"
          className={({ isActive }) => `admin-top-navbar__icon-link${isActive ? ' admin-top-navbar__icon-link--active' : ''}`}
          aria-label={t('admin.nav.settings')}
          title={t('admin.nav.settings')}
        >
          <SettingsIcon />
        </NavLink>
        <NotificationsDropdown />
        <MessagesDropdown />
        <UploadsIndicator />
      </nav>

      {session && <span className="admin-top-navbar__username">{session.username}</span>}
    </header>
  )
}
