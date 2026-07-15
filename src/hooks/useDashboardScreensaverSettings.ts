import { DEFAULT_DASHBOARD_SCREENSAVER_SETTINGS, type DashboardScreensaverSettings } from '../types/dashboardScreensaver'
import { useLocalStorage } from './useLocalStorage'

const STORAGE_KEY = 'admin.dashboardScreensaver'

/** Persists the admin dashboard/login screensaver's own on/off + idle-timeout-minutes settings — a synced (shared, cross-device) preference edited from Settings. Off by default; 10 minutes once turned on. */
export function useDashboardScreensaverSettings() {
  return useLocalStorage<DashboardScreensaverSettings>(STORAGE_KEY, DEFAULT_DASHBOARD_SCREENSAVER_SETTINGS)
}
