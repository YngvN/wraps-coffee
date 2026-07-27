import { NavLink } from 'react-router-dom'
import { AssistantPanel } from '../assistant/AssistantPanel'
import { useAssistantAllowedEntities } from '../assistant/useAssistantFlow'
import { useAdminSession } from '../../../hooks/useAdminSession'
import { useLanguage } from '../../../i18n'
import { GlobalSearchButton } from '../search/GlobalSearchButton'
import { AssistantSparkleIcon, OverviewIcon } from './AdminNavIcons'
import { DashboardWindowControls } from './DashboardWindowControls'
import { MessagesDropdown } from './MessagesDropdown'
import { NotificationsDropdown } from './NotificationsDropdown'
import { StoreBrandHeader } from './StoreBrandHeader'
import { UploadsIndicator } from './UploadsIndicator'
import './AdminTopNavbar.scss'

/** Which of the navbar's own right-side panels (see `AdminRightPanel`) is open, if any — owned by `AdminDashboard` (not this component, or `NotificationsDropdown`/`MessagesDropdown`/`GlobalSearchButton`/`AssistantPanel` themselves), since the sidebar nav's own "AI Assistant"/"Search" entries (see `AdminSidebarNav`) toggle the very same panels and need to share this one value with the navbar's own buttons — opening one always closes any other, from either trigger. */
export type ActivePanel = 'notifications' | 'messages' | 'search' | 'assistant' | null

interface AdminTopNavbarProps {
  /** Whether the mobile sidebar overlay is currently open — mirrors `AdminDashboard`'s own state, since the hamburger toggle now lives here instead of as its own standalone fixed button. */
  isSidebarOpen: boolean
  onToggleSidebar: () => void
  /** Owned by `AdminDashboard` — see `ActivePanel`'s own doc comment for why. */
  activePanel: ActivePanel
  onTogglePanel: (panel: NonNullable<ActivePanel>) => void
  onClosePanel: () => void
}

/**
 * Fixed top bar for the whole admin dashboard (and login screen, via
 * `AdminLayout`): the mobile sidebar toggle, store brand, and quick-access
 * shortcuts — the AI assistant (sparkle icon, kept leftmost and given its
 * own contrast styling via `--assistant` so it stands out from the plainer
 * icon buttons next to it), `GlobalSearchButton` (magnifying glass — every
 * product, integration, screen, event, and more, see `useGlobalSearchIndex`),
 * Overview ("home"), `NotificationsDropdown` (bell — new orders + out-of-
 * stock tracked products), `MessagesDropdown` (envelope — unread messages),
 * each of which opens its content in an `AdminRightPanel` sliding in from
 * the right edge of the screen (see `ActivePanel`'s own doc comment — owned
 * by `AdminDashboard`, not this component, since the sidebar nav's own "AI
 * Assistant"/"Search" entries toggle these same two panels too, so opening
 * one from either place always closes any other), and `UploadsIndicator`
 * (upload arrow — any image/video upload the global `uploadManager` is
 * still transferring or transcoding, hidden entirely once nothing is in
 * flight), plus the logged-in username and, right after it, the
 * window-chrome buttons (minimize/fullscreen/close — see
 * `DashboardWindowControls`, rendered here `inline` rather than its own
 * default fixed overlay, which would sit right underneath this sticky
 * navbar). No avatar picture (none exists) and no
 * profile dropdown — the user wants the existing sidebar-footer logout
 * button left exactly where it is, not duplicated/moved here. Settings has
 * no shortcut of its own here any more — reachable via the sidebar rail's
 * own Settings item only.
 */
export function AdminTopNavbar({ isSidebarOpen, onToggleSidebar, activePanel, onTogglePanel, onClosePanel }: AdminTopNavbarProps) {
  const { t } = useLanguage()
  const { session } = useAdminSession()
  const assistantAllowedEntities = useAssistantAllowedEntities()

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
        {assistantAllowedEntities.length > 0 && (
          <button
            type="button"
            className="admin-top-navbar__icon-link admin-top-navbar__icon-link--assistant"
            aria-label={t('admin.assistant.title')}
            title={t('admin.assistant.title')}
            onClick={() => onTogglePanel('assistant')}
          >
            <AssistantSparkleIcon />
          </button>
        )}
        <GlobalSearchButton open={activePanel === 'search'} onToggle={() => onTogglePanel('search')} onClose={onClosePanel} />
        <NavLink
          to="overview"
          className={({ isActive }) => `admin-top-navbar__icon-link${isActive ? ' admin-top-navbar__icon-link--active' : ''}`}
          aria-label={t('admin.nav.overview')}
          title={t('admin.nav.overview')}
        >
          <OverviewIcon />
        </NavLink>
        <NotificationsDropdown open={activePanel === 'notifications'} onToggle={() => onTogglePanel('notifications')} onClose={onClosePanel} />
        <MessagesDropdown open={activePanel === 'messages'} onToggle={() => onTogglePanel('messages')} onClose={onClosePanel} />
        <UploadsIndicator />
      </nav>

      {session && <span className="admin-top-navbar__username">{session.username}</span>}
      <div className="admin-top-navbar__window-controls">
        <DashboardWindowControls variant="inline" />
      </div>

      <AssistantPanel open={activePanel === 'assistant'} onClose={onClosePanel} />
    </header>
  )
}
