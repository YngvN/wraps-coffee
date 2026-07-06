import { AnimatePresence, motion } from 'framer-motion'
import { useState } from 'react'
import { useLocation, useOutlet } from 'react-router-dom'
import { AdminSidebarNav } from './AdminSidebarNav'
import './AdminDashboard.scss'

/**
 * Shell for the whole `/admin/dashboard/*` section: a sidebar nav (persistent
 * on desktop, a hamburger-triggered slide-in overlay on mobile) and the
 * matched child view, cross-fading between views on navigation.
 */
export function AdminDashboard() {
  const location = useLocation()
  const outlet = useOutlet()
  const [isSidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="admin-dashboard">
      <button
        type="button"
        className={`admin-dashboard__toggle${isSidebarOpen ? ' admin-dashboard__toggle--open' : ''}`}
        aria-label={isSidebarOpen ? 'Close menu' : 'Open menu'}
        aria-expanded={isSidebarOpen}
        onClick={() => setSidebarOpen((open) => !open)}
      >
        <span />
        <span />
        <span />
      </button>

      <aside className="admin-dashboard__sidebar admin-dashboard__sidebar--desktop">
        <AdminSidebarNav />
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
              <AdminSidebarNav onNavigate={() => setSidebarOpen(false)} />
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
  )
}
