import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useAdminSession } from '../../../hooks/useAdminSession'
import { useLanguage } from '../../../i18n'
import { GlobalSearchButton } from '../search/GlobalSearchButton'
import { OverviewIcon, SettingsIcon } from './AdminNavIcons'
import { DashboardWindowControls } from './DashboardWindowControls'
import { MessagesDropdown } from './MessagesDropdown'
import { NotificationsDropdown } from './NotificationsDropdown'
import { StoreBrandHeader } from './StoreBrandHeader'
import { UploadsIndicator } from './UploadsIndicator'
import './AdminTopNavbar.scss'

/** Which of the navbar's own right-side panels (see `AdminRightPanel`) is open, if any — kept here rather than inside `NotificationsDropdown`/`MessagesDropdown`/`GlobalSearchButton` themselves so opening one always closes the others instead of stacking on top of each other. */
type ActivePanel = 'notifications' | 'messages' | 'search' | null

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
 * closer), `GlobalSearchButton` (magnifying glass — every product,
 * integration, screen, event, and more, see `useGlobalSearchIndex`),
 * `NotificationsDropdown` (bell — new orders + out-of-stock
 * tracked products) and `MessagesDropdown` (envelope — unread messages),
 * each of which opens its content in an `AdminRightPanel` sliding in from
 * the right edge of the screen (see `activePanel` below — owned here, not
 * inside any of the three, so opening one always closes the others), and
 * `UploadsIndicator` (upload arrow — any image/video upload the global
 * `uploadManager` is still transferring or transcoding, hidden entirely
 * once nothing is in flight), plus the logged-in username and, right after
 * it, the window-chrome buttons (minimize/fullscreen/close — see
 * `DashboardWindowControls`, rendered here `inline` rather than its own
 * default fixed overlay, which would sit right underneath this sticky
 * navbar). No avatar picture (none exists) and no
 * profile dropdown — the user wants the existing sidebar-footer logout
 * button left exactly where it is, not duplicated/moved here.
 */
export function AdminTopNavbar({ isSidebarOpen, onToggleSidebar }: AdminTopNavbarProps) {
  const { t } = useLanguage()
  const { session } = useAdminSession()
  const [activePanel, setActivePanel] = useState<ActivePanel>(null)

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
        <GlobalSearchButton
          open={activePanel === 'search'}
          onToggle={() => setActivePanel((current) => (current === 'search' ? null : 'search'))}
          onClose={() => setActivePanel(null)}
        />
        <NotificationsDropdown
          open={activePanel === 'notifications'}
          onToggle={() => setActivePanel((current) => (current === 'notifications' ? null : 'notifications'))}
          onClose={() => setActivePanel(null)}
        />
        <MessagesDropdown
          open={activePanel === 'messages'}
          onToggle={() => setActivePanel((current) => (current === 'messages' ? null : 'messages'))}
          onClose={() => setActivePanel(null)}
        />
        <UploadsIndicator />
      </nav>

      {session && <span className="admin-top-navbar__username">{session.username}</span>}
      <div className="admin-top-navbar__window-controls">
        <DashboardWindowControls variant="inline" />
      </div>
    </header>
  )
}
