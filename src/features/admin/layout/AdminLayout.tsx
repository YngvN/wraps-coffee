import { Outlet } from 'react-router-dom'
import './AdminLayout.scss'

/** Bare chrome-free shell for the whole `/admin/*` section — no site header, nav, or footer. */
export function AdminLayout() {
  return (
    <div className="admin-layout">
      <Outlet />
    </div>
  )
}
