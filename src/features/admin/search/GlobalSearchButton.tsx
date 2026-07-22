import { useLanguage } from '../../../i18n'
import { SearchIcon } from '../layout/AdminNavIcons'
import { AdminRightPanel } from '../layout/AdminRightPanel'
import { GlobalSearchPanel } from './GlobalSearchPanel'

interface GlobalSearchButtonProps {
  /** Whether this button's own `AdminRightPanel` is the one currently open — owned by `AdminTopNavbar` (see `activePanel` there), not this component, so opening this panel always closes Notifications/Messages. */
  open: boolean
  onToggle: () => void
  onClose: () => void
}

/**
 * Top navbar's global search trigger: a magnifying-glass icon opening
 * `GlobalSearchPanel` in an `AdminRightPanel` sliding in from the right edge
 * of the screen, widened (`width="wide"`) since result rows carry more text
 * than Notifications/Messages do — same trigger/panel shape as
 * `NotificationsDropdown`/`MessagesDropdown`.
 */
export function GlobalSearchButton({ open, onToggle, onClose }: GlobalSearchButtonProps) {
  const { t } = useLanguage()

  return (
    <div className="global-search-button">
      <button type="button" className="admin-top-navbar__icon-link" onClick={onToggle} aria-label={t('admin.search.title')} title={t('admin.search.title')}>
        <SearchIcon />
      </button>

      <AdminRightPanel open={open} onClose={onClose} title={t('admin.search.title')} width="wide">
        <GlobalSearchPanel onNavigate={onClose} />
      </AdminRightPanel>
    </div>
  )
}
