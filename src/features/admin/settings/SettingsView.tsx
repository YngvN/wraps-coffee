import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { BackButton, Card, Checkbox, HelpTip, type NavRowItem, NavRowList, NumberInput, SlideTransition, TranslatedText } from '../../../components'
import { availableLanguages, useLanguage } from '../../../i18n'
import { useAdminSession } from '../../../hooks/useAdminSession'
import { useClockFormatPreference, type ClockFormat } from '../../../hooks/useClockFormatPreference'
import { useDashboardScreensaverSettings } from '../../../hooks/useDashboardScreensaverSettings'
import { useDateFormatPreference, type DateFormat } from '../../../hooks/useDateFormatPreference'
import { useDefaultPaneLanguage } from '../../../hooks/useDefaultPaneLanguage'
import { useSidebarSettings } from '../../../hooks/useSidebarSettings'
import { getAppVersion } from '../../../lib/localServer'
import type { ToggleableSidebarItem } from '../../../types/sidebarSettings'
import { IntegrationsView } from '../integrations/IntegrationsView'
import { ADMIN_NAV_ICONS, NAV_ITEMS } from '../layout/adminNavItems'
import { StoreSettingsView } from '../store/StoreSettingsView'
import { AdvancedSettingsView } from './AdvancedSettingsView'
import { BackupSettingsView } from './BackupSettingsView'
import { ConnectWebsiteView } from './website/ConnectWebsiteView'
import { AppUpdateSettingsView } from './AppUpdateSettingsView'
import { DeveloperDocsView } from './DeveloperDocsView'
import { PrintersSettingsView } from './printers/PrintersSettingsView'
import { RegisterSettingsView } from './register/RegisterSettingsView'
import { TestingSettingsView } from './TestingSettingsView'
import './SettingsView.scss'

const CLOCK_FORMATS: ClockFormat[] = ['24h', '12h']
const DATE_FORMATS: DateFormat[] = ['dmy', 'mdy']

type SubView = 'main' | 'developers' | 'advanced' | 'backup' | 'store' | 'testing' | 'integrations' | 'website' | 'appupdate' | 'printers' | 'register'
/** Every `SubView` that has a real URL segment of its own under `/admin/dashboard/settings/`. */
const ROUTED_SUB_VIEWS: SubView[] = ['developers', 'advanced', 'backup', 'store', 'testing', 'integrations', 'website', 'appupdate', 'printers', 'register']

/** Admin-wide settings: the interface language, the cafe's own Standard pane language (the default kiosk panes render their content in, independent of the interface language above — see `useDefaultPaneLanguage`, overridable per pane from its own "Language" sub-menu), the shared clock format (24-hour or 12-hour AM/PM) and date format (day-month-year or month-day-year — used everywhere a wall-clock time/plain date is shown: the weather forecast, admin timestamps, uploaded-image/message-board-post dates, the screensaver schedule's own time pickers, and a "time" pane's own shorthand date), which sidebar items this cafe's dashboard shows (different cafes use different features — a cafe with no online ordering or no digital signage can hide those tabs entirely), "Integrations" (transit/weather/news/delivery-platform setup — see `IntegrationsView`, reached as a submenu here rather than its own sidebar item, same as Store), a "For developers" sub-view documenting the local server's own API, and (admin/subadmin only) an "Advanced" sub-view for how a screen's own link should be addressed (see `AdvancedSettingsView`). More device/account-level preferences land here over time. */
export function SettingsView() {
  const { t, language, setLanguage } = useLanguage()
  const { session } = useAdminSession()
  const [defaultPaneLanguage, setDefaultPaneLanguage] = useDefaultPaneLanguage()
  const [clockFormat, setClockFormat] = useClockFormatPreference()
  const [dateFormat, setDateFormat] = useDateFormatPreference()
  const [sidebarSettings, setSidebarSettings] = useSidebarSettings()
  const [screensaverSettings, setScreensaverSettings] = useDashboardScreensaverSettings()
  const toggleableItems = NAV_ITEMS.filter((item) => item.toggleable)
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { section } = useParams<{ section?: string }>()
  const [appVersion, setAppVersion] = useState<string | null>(null)
  /**
   * Which sub-view is open, read straight off the URL (`/admin/dashboard/settings/<section>`)
   * rather than held in local state. That's what makes each one bookmarkable, shareable and
   * refreshable, and it lets the browser's own Back button work natively instead of through
   * a hand-rolled history shim.
   */
  const subView: SubView = section && ROUTED_SUB_VIEWS.includes(section as SubView) ? (section as SubView) : 'main'
  /** `1` while opening a sub-view (slides in from the right, see `SlideTransition`), `-1` while going back. */
  const [direction, setDirection] = useState<1 | -1>(1)

  /**
   * Back-compat for the old `?view=` deep links (older bookmarks, and anything still
   * generating that shape) — redirected once to the equivalent real route rather than
   * being consumed and stripped in place.
   */
  useEffect(() => {
    const legacyView = searchParams.get('view')
    if (!legacyView || !ROUTED_SUB_VIEWS.includes(legacyView as SubView)) return
    const rest = new URLSearchParams(searchParams)
    rest.delete('view')
    const query = rest.toString()
    navigate(`/admin/dashboard/settings/${legacyView}${query ? `?${query}` : ''}`, { replace: true })
  }, [searchParams, navigate])

  /** For the About card at the bottom of the main list, below. */
  useEffect(() => {
    getAppVersion()
      .then(setAppVersion)
      .catch(() => setAppVersion(null))
  }, [])

  const toggleSidebarItem = (item: ToggleableSidebarItem, visible: boolean) => {
    const hiddenItems = visible ? sidebarSettings.hiddenItems.filter((hidden) => hidden !== item) : [...sidebarSettings.hiddenItems, item]
    setSidebarSettings({ ...sidebarSettings, hiddenItems })
  }

  const handleScreensaverIdleMinutesChange = (value: number) => {
    const parsed = Math.round(value)
    setScreensaverSettings({ ...screensaverSettings, idleMinutes: Number.isFinite(parsed) && parsed > 0 ? parsed : 1 })
  }

  /**
   * Opening a sub-view is a real navigation now, so it lands in browser history on its own —
   * the mouse's back button, Alt+←, and a swipe-back all close it for free, which is why the
   * `useBackLevel` shim this view used to need is gone.
   */
  const openSubView = (view: SubView) => {
    setDirection(1)
    navigate(`/admin/dashboard/settings/${view}`)
  }

  const closeSubView = () => {
    setDirection(-1)
    navigate('/admin/dashboard/settings')
  }

  /**
   * Every sub-view this page can open, as one grouped menu (see `NavRowList`)
   * instead of six separate cards each holding a lone button. Labels reuse
   * each sub-view's own existing title key, so no new strings were needed.
   *
   * The `limited`-role restriction is a conditional spread over data rather
   * than three JSX conditionals around individual rows — the row group has no
   * per-row gating of its own, and this keeps "which rows exist" answerable
   * in one place.
   */
  const subViewRows: NavRowItem[] = [
    { id: 'store', label: t('admin.store.title'), onClick: () => openSubView('store') },
    { id: 'integrations', label: t('admin.settings.integrations.title'), onClick: () => openSubView('integrations') },
    { id: 'printers', label: t('admin.settings.printers.title'), onClick: () => openSubView('printers') },
    { id: 'register', label: t('admin.settings.register.title'), onClick: () => openSubView('register') },
    { id: 'developers', label: t('admin.settings.developersTitle'), onClick: () => openSubView('developers') },
    ...(session?.role === 'limited'
      ? []
      : [
          // Admin/subadmin only: this edits a real database credential, same
          // gate as the `/neon-url` routes it saves through.
          { id: 'website', label: t('admin.settings.website.title'), onClick: () => openSubView('website') },
          { id: 'advanced', label: t('admin.settings.advanced.title'), onClick: () => openSubView('advanced') },
          { id: 'backup', label: t('admin.settings.backup.title'), onClick: () => openSubView('backup') },
          { id: 'testing', label: t('admin.settings.testing.title'), onClick: () => openSubView('testing') },
        ]),
    // Admin only, a stricter gate than the block above: this sub-view pulls
    // code from GitHub and runs `npm install`/`npm run build` on the kiosk,
    // which is a higher bar than editing a credential. `server/index.ts`
    // enforces the same gate on every `/app-update/*` route.
    ...(session?.role === 'admin'
      ? [{ id: 'appupdate', label: t('admin.settings.appUpdate.title'), onClick: () => openSubView('appupdate') }]
      : []),
  ]

  return (
    <SlideTransition viewKey={subView} direction={direction}>
      {subView === 'store' ? (
        <StoreSettingsView />
      ) : subView === 'integrations' ? (
        <IntegrationsView />
      ) : subView === 'website' ? (
        <div className="settings-view">
          <div className="settings-view__docs-header">
            <BackButton onClick={closeSubView}>{t('admin.common.backTo', { destination: t('admin.settings.title') })}</BackButton>
            <TranslatedText as="h1" id="admin.settings.website.title" />
          </div>
          <TranslatedText as="p" id="admin.settings.website.description" className="admin-page-description" />
          <ConnectWebsiteView />
        </div>
      ) : subView === 'appupdate' ? (
        <div className="settings-view">
          <div className="settings-view__docs-header">
            <BackButton onClick={closeSubView}>{t('admin.common.backTo', { destination: t('admin.settings.title') })}</BackButton>
            <TranslatedText as="h1" id="admin.settings.appUpdate.title" />
          </div>
          <TranslatedText as="p" id="admin.settings.appUpdate.description" className="admin-page-description" />
          <AppUpdateSettingsView />
        </div>
      ) : subView === 'developers' ? (
        <div className="settings-view">
          <div className="settings-view__docs-header">
            <BackButton onClick={closeSubView}>{t('admin.common.backTo', { destination: t('admin.settings.title') })}</BackButton>
            <TranslatedText as="h1" id="admin.settings.developersTitle" />
          </div>
          <TranslatedText as="p" id="admin.settings.developersDescription" className="admin-page-description" />
          <DeveloperDocsView />
        </div>
      ) : subView === 'advanced' ? (
        <div className="settings-view">
          <div className="settings-view__docs-header">
            <BackButton onClick={closeSubView}>{t('admin.common.backTo', { destination: t('admin.settings.title') })}</BackButton>
            <TranslatedText as="h1" id="admin.settings.advanced.title" />
          </div>
          <TranslatedText as="p" id="admin.settings.advanced.description" className="admin-page-description" />
          <AdvancedSettingsView />
        </div>
      ) : subView === 'backup' ? (
        <div className="settings-view">
          <div className="settings-view__docs-header">
            <BackButton onClick={closeSubView}>{t('admin.common.backTo', { destination: t('admin.settings.title') })}</BackButton>
            <TranslatedText as="h1" id="admin.settings.backup.title" />
          </div>
          <TranslatedText as="p" id="admin.settings.backup.description" className="admin-page-description" />
          <BackupSettingsView />
        </div>
      ) : subView === 'printers' ? (
        <div className="settings-view">
          <div className="settings-view__docs-header">
            <BackButton onClick={closeSubView}>{t('admin.common.backTo', { destination: t('admin.settings.title') })}</BackButton>
            <TranslatedText as="h1" id="admin.settings.printers.title" />
          </div>
          <TranslatedText as="p" id="admin.settings.printers.description" className="admin-page-description" />
          <PrintersSettingsView />
        </div>
      ) : subView === 'register' ? (
        <div className="settings-view">
          <div className="settings-view__docs-header">
            <BackButton onClick={closeSubView}>{t('admin.common.backTo', { destination: t('admin.settings.title') })}</BackButton>
            <TranslatedText as="h1" id="admin.settings.register.title" />
          </div>
          <TranslatedText as="p" id="admin.settings.register.description" className="admin-page-description" />
          <RegisterSettingsView />
        </div>
      ) : subView === 'testing' ? (
        <div className="settings-view">
          <div className="settings-view__docs-header">
            <BackButton onClick={closeSubView}>{t('admin.common.backTo', { destination: t('admin.settings.title') })}</BackButton>
            <TranslatedText as="h1" id="admin.settings.testing.title" />
          </div>
          <TranslatedText as="p" id="admin.settings.testing.description" className="admin-page-description" />
          <TestingSettingsView />
        </div>
      ) : (
        <div className="settings-view">
          <TranslatedText as="h1" id="admin.settings.title" />
          <TranslatedText as="p" id="admin.settings.description" className="admin-page-description" />
          <NavRowList items={subViewRows} />
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
          <Card
            title={
              <>
                {t('admin.settings.paneLanguageLabel')} <HelpTip text={t('admin.settings.paneLanguageHint')} />
              </>
            }
          >
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
          <Card
            title={
              <>
                {t('admin.settings.sidebarItemsTitle')} <HelpTip text={t('admin.settings.sidebarItemsHint')} />
              </>
            }
          >
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
          <Card
            title={
              <>
                {t('admin.settings.dashboardScreensaver.title')} <HelpTip text={t('admin.settings.dashboardScreensaver.hint')} />
              </>
            }
          >
            <Checkbox
              id="dashboard-screensaver-enabled"
              label={t('admin.settings.dashboardScreensaver.enableLabel')}
              checked={screensaverSettings.enabled}
              onChange={(event) => setScreensaverSettings({ ...screensaverSettings, enabled: event.target.checked })}
            />
            {screensaverSettings.enabled && (
              <NumberInput
                id="dashboard-screensaver-idle-minutes"
                min={1}
                label={t('admin.settings.dashboardScreensaver.idleMinutesLabel')}
                value={screensaverSettings.idleMinutes}
                onChange={handleScreensaverIdleMinutesChange}
              />
            )}
          </Card>
          <Card title={t('admin.settings.about.title')}>
            <p className="settings-view__developers-hint">
              {appVersion ? t('admin.settings.about.versionLabel', { version: appVersion }) : t('admin.settings.about.loading')}
            </p>
          </Card>
        </div>
      )}
    </SlideTransition>
  )
}
