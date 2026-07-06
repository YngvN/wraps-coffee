import { NavLink } from 'react-router-dom'
import { ThemeToggle, TranslatedText } from '../../../components'
import './AdminSidebarNav.scss'

/** One entry in the admin sidebar nav: a route segment and its translation key. */
const NAV_ITEMS = [
  { to: 'overview', id: 'admin.nav.overview' },
  { to: 'messages', id: 'admin.nav.messages' },
  { to: 'products', id: 'admin.nav.products' },
  { to: 'events', id: 'admin.nav.events' },
  { to: 'reviews', id: 'admin.nav.reviews' },
  { to: 'instagram', id: 'admin.nav.instagram' },
  { to: 'contact', id: 'admin.nav.contact' },
  { to: 'orders', id: 'admin.nav.orders' },
] as const

interface AdminSidebarNavProps {
  /** Called whenever a nav link is clicked, so the mobile overlay can close itself. */
  onNavigate?: () => void
}

/** List of links to every admin dashboard view, plus a link back to the public site and the theme toggle. */
export function AdminSidebarNav({ onNavigate }: AdminSidebarNavProps) {
  return (
    <nav className="admin-sidebar-nav">
      <ul className="admin-sidebar-nav__list">
        {NAV_ITEMS.map((item) => (
          <li key={item.to}>
            <NavLink to={item.to} onClick={onNavigate} className={({ isActive }) => `admin-sidebar-nav__link${isActive ? ' admin-sidebar-nav__link--active' : ''}`}>
              <TranslatedText id={item.id} />
            </NavLink>
          </li>
        ))}
      </ul>
      <div className="admin-sidebar-nav__footer">
        <NavLink to="/" className="admin-sidebar-nav__back" onClick={onNavigate}>
          ← <TranslatedText id="admin.nav.backToSite" />
        </NavLink>
        <ThemeToggle />
      </div>
    </nav>
  )
}
