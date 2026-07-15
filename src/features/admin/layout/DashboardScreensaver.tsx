import { useEffect, useState } from 'react'
import { useStoreSettings } from '../../../hooks/useStoreSettings'
import { useLanguage } from '../../../i18n'
import './DashboardScreensaver.scss'

function randomPosition(): { top: number; left: number } {
  return { top: 10 + Math.random() * 80, left: 10 + Math.random() * 80 }
}

/**
 * Idle-timeout screensaver for the admin dashboard and login screen only
 * (see `useDashboardScreensaverSettings`, `AdminLayout`) — a solid black
 * overlay with the store's own name drifting to a new random spot every few
 * seconds, the same technique the kiosk `/screens` display's own "Test
 * screensaver" label uses (see `ScreenDisplay.tsx`). Disappears the moment
 * `AdminLayout`'s idle timer resets (any mouse move, touch, or key press).
 */
export function DashboardScreensaver() {
  const { t } = useLanguage()
  const [storeSettings] = useStoreSettings()
  const [position, setPosition] = useState(randomPosition)

  useEffect(() => {
    const interval = setInterval(() => setPosition(randomPosition()), 4000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="dashboard-screensaver">
      <span className="dashboard-screensaver__text" style={{ top: `${position.top}%`, left: `${position.left}%` }}>
        {storeSettings.name.trim() || t('admin.login.title')}
      </span>
    </div>
  )
}
