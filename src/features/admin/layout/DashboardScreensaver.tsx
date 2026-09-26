import { ScreenSaver } from '../../../components'
import { useStoreSettings } from '../../../hooks/useStoreSettings'
import { useLanguage } from '../../../i18n'

/**
 * Idle-timeout screensaver for the admin dashboard and login screen only (see
 * `useDashboardScreensaverSettings`, `AdminLayout`): the shared `ScreenSaver` with the store's own name
 * drifting over black. Disappears the moment `AdminLayout`'s idle timer resets (any mouse move, touch,
 * or key press).
 */
export function DashboardScreensaver() {
  const { t } = useLanguage()
  const [storeSettings] = useStoreSettings()
  return <ScreenSaver text={storeSettings.name.trim() || t('admin.login.title')} />
}
