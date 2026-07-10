import { NavLink, useNavigate } from 'react-router-dom'
import { ThemeToggle, TranslatedText } from '../../../components'
import { useAdminSession } from '../../../hooks/useAdminSession'
import { useSidebarSettings } from '../../../hooks/useSidebarSettings'
import { useLanguage } from '../../../i18n'
import type { ToggleableSidebarItem } from '../../../types/sidebarSettings'
import { ADMIN_NAV_ICONS, NAV_ITEMS } from './adminNavItems'
import './AdminSidebarNav.scss'

interface AdminSidebarNavProps {
  /** Called whenever a nav link is clicked, so the mobile overlay can close itself. */
  onNavigate?: () => void
}

/** List of links to every admin dashboard view, plus a logout action and the theme toggle. */
export function AdminSidebarNav({ onNavigate }: AdminSidebarNavProps) {
  const { t } = useLanguage()
  const { session, clearSession } = useAdminSession()
  const [sidebarSettings] = useSidebarSettings()
  const navigate = useNavigate()
  const visibleItems = NAV_ITEMS.filter(
    (item) =>
      (!item.adminOnly || session?.role !== 'limited') &&
      (!item.toggleable || !sidebarSettings.hiddenItems.includes(item.to as ToggleableSidebarItem)),
  )

  const handleLogout = () => {
    clearSession()
    onNavigate?.()
    navigate('/admin/login', { replace: true })
  }

  return (
    <nav className="admin-sidebar-nav">
      <ul className="admin-sidebar-nav__list">
        {visibleItems.map((item) => {
          const NavIcon = ADMIN_NAV_ICONS[item.to]
          return (
            <li key={item.to}>
              <NavLink
                to={item.to}
                onClick={onNavigate}
                className={({ isActive }) => `admin-sidebar-nav__link${isActive ? ' admin-sidebar-nav__link--active' : ''}`}
              >
                <NavIcon className="admin-sidebar-nav__icon" />
                <TranslatedText id={item.id} />
              </NavLink>
            </li>
          )
        })}
      </ul>
      <div className="admin-sidebar-nav__footer">
        <button type="button" className="admin-sidebar-nav__back" onClick={handleLogout}>
          {t('admin.nav.logout')}
        </button>
        <ThemeToggle />
      </div>
    </nav>
  )
}
