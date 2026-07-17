import { AnimatePresence, motion } from 'framer-motion'
import { useState } from 'react'
import { Navigate, useLocation, useOutlet } from 'react-router-dom'
import { ErrorToast } from '../../../components'
import { useAdminSession } from '../../../hooks/useAdminSession'
import { useSidebarPinned } from '../../../hooks/useSidebarPinned'
import { AdminSidebarNav } from './AdminSidebarNav'
import { AdminTopNavbar } from './AdminTopNavbar'
import './AdminDashboard.scss'

/**
 * Shell for the whole `/admin/dashboard/*` section: a fixed top navbar
 * (`AdminTopNavbar`), a sidebar nav below it (persistent on desktop, a
 * hamburger-triggered slide-in overlay on mobile — the hamburger itself
 * lives in the navbar, sharing this component's own `isSidebarOpen` state),
 * and the matched child view, cross-fading between views on navigation.
 * Redirects to the login screen if there's no valid session.
 *
 * `useSidebarPinned` (the rail's own pin-toggle button, above its footer)
 * lives here rather than inside `AdminSidebarNav` itself, since pinning
 * also needs to widen `.admin-dashboard__sidebar--desktop`'s own reserved
 * layout width — otherwise the rail would only be able to *float* open
 * (as it already does on hover), covering the content instead of sliding
 * it over.
 */
export function AdminDashboard() {
  const { session } = useAdminSession()
  const location = useLocation()
  const outlet = useOutlet()
  const [isSidebarOpen, setSidebarOpen] = useState(false)
  const { isPinned, togglePinned } = useSidebarPinned()

  if (!session) return <Navigate to="/admin/login" replace />

  return (
    <div className="admin-dashboard">
      <ErrorToast />
      <AdminTopNavbar isSidebarOpen={isSidebarOpen} onToggleSidebar={() => setSidebarOpen((open) => !open)} />

      <div className="admin-dashboard__body">
        <aside
          className={`admin-dashboard__sidebar admin-dashboard__sidebar--desktop${isPinned ? ' admin-dashboard__sidebar--pinned' : ''}`}
        >
          <AdminSidebarNav variant="desktop" isPinned={isPinned} onTogglePinned={togglePinned} />
        </aside>

        <AnimatePresence>
          {isSidebarOpen && (
            <>
              <motion.div
                className="admin-dashboard__scrim"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                onClick={() => setSidebarOpen(false)}
              />
              <motion.aside
                className="admin-dashboard__sidebar admin-dashboard__sidebar--mobile"
                initial={{ x: '-100%' }}
                animate={{ x: 0 }}
                exit={{ x: '-100%' }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
              >
                <AdminSidebarNav variant="mobile" onNavigate={() => setSidebarOpen(false)} />
              </motion.aside>
            </>
          )}
        </AnimatePresence>

        <main className="admin-dashboard__content">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              {outlet}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  )
}
