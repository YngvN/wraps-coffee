/** Idle-timeout screensaver settings for the admin dashboard and login screen only (see `useDashboardScreensaverSettings`, `AdminLayout`) — independent of the kiosk `/screens` display's own scheduled black-out screensaver (`useScreensaverSchedule`). */
export interface DashboardScreensaverSettings {
  enabled: boolean
  /** Minutes of no mouse movement, touch, or key press before it appears. */
  idleMinutes: number
}

export const DEFAULT_DASHBOARD_SCREENSAVER_SETTINGS: DashboardScreensaverSettings = {
  enabled: false,
  idleMinutes: 10,
}
