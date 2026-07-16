import { useState } from 'react'
import { BackButton, Button, Card, Checkbox, Input, SlideTransition, TranslatedText } from '../../../components'
import { availableLanguages, useLanguage } from '../../../i18n'
import { useAdminSession } from '../../../hooks/useAdminSession'
import { useClockFormatPreference, type ClockFormat } from '../../../hooks/useClockFormatPreference'
import { useDashboardScreensaverSettings } from '../../../hooks/useDashboardScreensaverSettings'
import { useDateFormatPreference, type DateFormat } from '../../../hooks/useDateFormatPreference'
import { useDefaultPaneLanguage } from '../../../hooks/useDefaultPaneLanguage'
import { useSidebarSettings } from '../../../hooks/useSidebarSettings'
import type { ToggleableSidebarItem } from '../../../types/sidebarSettings'
import { ADMIN_NAV_ICONS, NAV_ITEMS } from '../layout/adminNavItems'
import { StoreSettingsView } from '../store/StoreSettingsView'
import { AdvancedSettingsView } from './AdvancedSettingsView'
import { BackupSettingsView } from './BackupSettingsView'
import { DeveloperDocsView } from './DeveloperDocsView'
import './SettingsView.scss'

const CLOCK_FORMATS: ClockFormat[] = ['24h', '12h']
const DATE_FORMATS: DateFormat[] = ['dmy', 'mdy']

type SubView = 'main' | 'developers' | 'advanced' | 'backup' | 'store'

/** Admin-wide settings: the interface language, the cafe's own Standard pane language (the default kiosk panes render their content in, independent of the interface language above — see `useDefaultPaneLanguage`, overridable per pane from its own "Language" sub-menu), the shared clock format (24-hour or 12-hour AM/PM) and date format (day-month-year or month-day-year — used everywhere a wall-clock time/plain date is shown: the weather forecast, admin timestamps, uploaded-image/message-board-post dates, the screensaver schedule's own time pickers, and a "time" pane's own shorthand date), which sidebar items this cafe's dashboard shows (different cafes use different features — a cafe with no online ordering or no digital signage can hide those tabs entirely), a "For developers" sub-view documenting the local server's own API, and (admin/subadmin only) an "Advanced" sub-view for how a screen's own link should be addressed (see `AdvancedSettingsView`). More device/account-level preferences land here over time. */
export function SettingsView() {
  const { t, language, setLanguage } = useLanguage()
  const { session } = useAdminSession()
  const [defaultPaneLanguage, setDefaultPaneLanguage] = useDefaultPaneLanguage()
  const [clockFormat, setClockFormat] = useClockFormatPreference()
  const [dateFormat, setDateFormat] = useDateFormatPreference()
  const [sidebarSettings, setSidebarSettings] = useSidebarSettings()
  const [screensaverSettings, setScreensaverSettings] = useDashboardScreensaverSettings()
  const toggleableItems = NAV_ITEMS.filter((item) => item.toggleable)
  /** Which sub-view (replacing the whole settings list until its own Back button is pressed) is open, if any. */
  const [subView, setSubView] = useState<SubView>('main')
  /** `1` while opening a sub-view (slides in from the right, see `SlideTransition`), `-1` while going back. */
  const [direction, setDirection] = useState<1 | -1>(1)

  const toggleSidebarItem = (item: ToggleableSidebarItem, visible: boolean) => {
    const hiddenItems = visible ? sidebarSettings.hiddenItems.filter((hidden) => hidden !== item) : [...sidebarSettings.hiddenItems, item]
    setSidebarSettings({ ...sidebarSettings, hiddenItems })
  }

  const handleScreensaverIdleMinutesChange = (value: string) => {
    const parsed = Math.round(Number(value))
    setScreensaverSettings({ ...screensaverSettings, idleMinutes: Number.isFinite(parsed) && parsed > 0 ? parsed : 1 })
  }

  const openSubView = (view: SubView) => {
    setDirection(1)
    setSubView(view)
  }

  const closeSubView = () => {
    setDirection(-1)
    setSubView('main')
  }

  return (
    <SlideTransition viewKey={subView} direction={direction}>
      {subView === 'store' ? (
        <StoreSettingsView onBack={closeSubView} />
      ) : subView === 'developers' ? (
        <div className="settings-view">
          <div className="settings-view__docs-header">
            <BackButton onClick={closeSubView}>{t('admin.common.back')}</BackButton>
            <TranslatedText as="h1" id="admin.settings.developersTitle" />
          </div>
          <TranslatedText as="p" id="admin.settings.developersDescription" className="admin-page-description" />
          <DeveloperDocsView />
        </div>
      ) : subView === 'advanced' ? (
        <div className="settings-view">
          <div className="settings-view__docs-header">
            <BackButton onClick={closeSubView}>{t('admin.common.back')}</BackButton>
            <TranslatedText as="h1" id="admin.settings.advanced.title" />
          </div>
          <TranslatedText as="p" id="admin.settings.advanced.description" className="admin-page-description" />
          <AdvancedSettingsView />
        </div>
      ) : subView === 'backup' ? (
        <div className="settings-view">
          <div className="settings-view__docs-header">
            <BackButton onClick={closeSubView}>{t('admin.common.back')}</BackButton>
            <TranslatedText as="h1" id="admin.settings.backup.title" />
          </div>
          <TranslatedText as="p" id="admin.settings.backup.description" className="admin-page-description" />
          <BackupSettingsView />
        </div>
      ) : (
        <div className="settings-view">
          <TranslatedText as="h1" id="admin.settings.title" />
          <TranslatedText as="p" id="admin.settings.description" className="admin-page-description" />
          <Card title={t('admin.store.title')}>
            <p className="settings-view__developers-hint">{t('admin.settings.storeHint')}</p>
            <Button type="button" variant="secondary" onClick={() => openSubView('store')}>
              {t('admin.settings.storeButton')}
            </Button>
          </Card>
          <Card title={t('admin.settings.languageLabel')}>
            <div className="settings-view__language-options">
              {availableLanguages.map((option) => (
                <button
                  key={option.code}
                  type="button"
                  className={`settings-view__language-option${option.code === language ? ' settings-view__language-option--active' : ''}`}
                  onClick={() => setLanguage(option.code)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </Card>
          <Card title={t('admin.settings.paneLanguageLabel')}>
            <p className="settings-view__pane-language-hint">{t('admin.settings.paneLanguageHint')}</p>
            <div className="settings-view__pane-language-options">
              {availableLanguages.map((option) => (
                <button
                  key={option.code}
                  type="button"
                  className={`settings-view__pane-language-option${option.code === defaultPaneLanguage ? ' settings-view__pane-language-option--active' : ''}`}
                  onClick={() => setDefaultPaneLanguage(option.code)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </Card>
          <Card title={t('admin.settings.clockFormatLabel')}>
            <div className="settings-view__clock-format-options">
              {CLOCK_FORMATS.map((format) => (
                <button
                  key={format}
                  type="button"
                  className={`settings-view__clock-format-option${format === clockFormat ? ' settings-view__clock-format-option--active' : ''}`}
                  onClick={() => setClockFormat(format)}
                >
                  {t(format === '24h' ? 'admin.settings.clockFormat24hLabel' : 'admin.settings.clockFormat12hLabel')}
                </button>
              ))}
            </div>
          </Card>
          <Card title={t('admin.settings.dateFormatLabel')}>
            <div className="settings-view__date-format-options">
              {DATE_FORMATS.map((format) => (
                <button
                  key={format}
                  type="button"
                  className={`settings-view__date-format-option${format === dateFormat ? ' settings-view__date-format-option--active' : ''}`}
                  onClick={() => setDateFormat(format)}
                >
                  {t(format === 'dmy' ? 'admin.settings.dateFormatDmyLabel' : 'admin.settings.dateFormatMdyLabel')}
                </button>
              ))}
            </div>
          </Card>
          <Card title={t('admin.settings.sidebarItemsTitle')}>
            <p className="settings-view__sidebar-items-hint">{t('admin.settings.sidebarItemsHint')}</p>
            <ul className="settings-view__sidebar-items">
              {toggleableItems.map((item) => {
                const NavIcon = ADMIN_NAV_ICONS[item.to]
                const itemKey = item.to as ToggleableSidebarItem
                return (
                  <li key={item.to} className="settings-view__sidebar-item">
                    <NavIcon className="settings-view__sidebar-item-icon" />
                    <Checkbox
                      id={`sidebar-item-${item.to}`}
                      label={t(item.id)}
                      checked={!sidebarSettings.hiddenItems.includes(itemKey)}
                      onChange={(event) => toggleSidebarItem(itemKey, event.target.checked)}
                    />
                  </li>
                )
              })}
            </ul>
          </Card>
          <Card title={t('admin.settings.dashboardScreensaver.title')}>
            <p className="settings-view__developers-hint">{t('admin.settings.dashboardScreensaver.hint')}</p>
            <Checkbox
              id="dashboard-screensaver-enabled"
              label={t('admin.settings.dashboardScreensaver.enableLabel')}
              checked={screensaverSettings.enabled}
              onChange={(event) => setScreensaverSettings({ ...screensaverSettings, enabled: event.target.checked })}
            />
            {screensaverSettings.enabled && (
              <Input
                id="dashboard-screensaver-idle-minutes"
                type="number"
                min={1}
                label={t('admin.settings.dashboardScreensaver.idleMinutesLabel')}
                value={screensaverSettings.idleMinutes}
                onChange={(event) => handleScreensaverIdleMinutesChange(event.target.value)}
              />
            )}
          </Card>
          <Card title={t('admin.settings.developersTitle')}>
            <p className="settings-view__developers-hint">{t('admin.settings.developersHint')}</p>
            <Button type="button" variant="secondary" onClick={() => openSubView('developers')}>
              {t('admin.settings.developersButton')}
            </Button>
          </Card>
          {session?.role !== 'limited' && (
            <Card title={t('admin.settings.advanced.title')}>
              <p className="settings-view__developers-hint">{t('admin.settings.advanced.hint')}</p>
              <Button type="button" variant="secondary" onClick={() => openSubView('advanced')}>
                {t('admin.settings.advanced.button')}
              </Button>
            </Card>
          )}
          {session?.role !== 'limited' && (
            <Card title={t('admin.settings.backup.title')}>
              <p className="settings-view__developers-hint">{t('admin.settings.backup.hint')}</p>
              <Button type="button" variant="secondary" onClick={() => openSubView('backup')}>
                {t('admin.settings.backup.button')}
              </Button>
            </Card>
          )}
        </div>
      )}
    </SlideTransition>
  )
}
