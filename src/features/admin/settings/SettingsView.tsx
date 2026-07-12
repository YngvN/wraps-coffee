import { useState } from 'react'
import { BackButton, Button, Card, Checkbox, SlideTransition, TranslatedText } from '../../../components'
import { availableLanguages, useLanguage } from '../../../i18n'
import { useClockFormatPreference, type ClockFormat } from '../../../hooks/useClockFormatPreference'
import { useDefaultPaneLanguage } from '../../../hooks/useDefaultPaneLanguage'
import { useSidebarSettings } from '../../../hooks/useSidebarSettings'
import type { ToggleableSidebarItem } from '../../../types/sidebarSettings'
import { ADMIN_NAV_ICONS, NAV_ITEMS } from '../layout/adminNavItems'
import { DeveloperDocsView } from './DeveloperDocsView'
import './SettingsView.scss'

const CLOCK_FORMATS: ClockFormat[] = ['24h', '12h']

/** Admin-wide settings: the interface language, the cafe's own Standard pane language (the default kiosk panes render their content in, independent of the interface language above — see `useDefaultPaneLanguage`, overridable per pane from its own "Language" sub-menu), the shared clock format (24-hour or 12-hour AM/PM — used everywhere a wall-clock time is shown: the weather forecast, admin timestamps, and the screensaver schedule's own time pickers), which sidebar items this cafe's dashboard shows (different cafes use different features — a cafe with no online ordering or no digital signage can hide those tabs entirely), and a "For developers" sub-view documenting the local server's own API. More device/account-level preferences land here over time. */
export function SettingsView() {
  const { t, language, setLanguage } = useLanguage()
  const [defaultPaneLanguage, setDefaultPaneLanguage] = useDefaultPaneLanguage()
  const [clockFormat, setClockFormat] = useClockFormatPreference()
  const [sidebarSettings, setSidebarSettings] = useSidebarSettings()
  const toggleableItems = NAV_ITEMS.filter((item) => item.toggleable)
  /** Whether the "For developers" sub-view (replacing the whole settings list until its own Back button is pressed) is open. */
  const [showDeveloperDocs, setShowDeveloperDocs] = useState(false)
  /** `1` while opening the sub-view (slides in from the right, see `SlideTransition`), `-1` while going back. */
  const [direction, setDirection] = useState<1 | -1>(1)

  const toggleSidebarItem = (item: ToggleableSidebarItem, visible: boolean) => {
    const hiddenItems = visible ? sidebarSettings.hiddenItems.filter((hidden) => hidden !== item) : [...sidebarSettings.hiddenItems, item]
    setSidebarSettings({ ...sidebarSettings, hiddenItems })
  }

  const openDeveloperDocs = () => {
    setDirection(1)
    setShowDeveloperDocs(true)
  }

  const closeDeveloperDocs = () => {
    setDirection(-1)
    setShowDeveloperDocs(false)
  }

  return (
    <SlideTransition viewKey={showDeveloperDocs ? 'developers' : 'main'} direction={direction}>
      {showDeveloperDocs ? (
        <div className="settings-view">
          <div className="settings-view__docs-header">
            <BackButton onClick={closeDeveloperDocs}>{t('admin.common.back')}</BackButton>
            <TranslatedText as="h1" id="admin.settings.developersTitle" />
          </div>
          <DeveloperDocsView />
        </div>
      ) : (
        <div className="settings-view">
          <TranslatedText as="h1" id="admin.settings.title" />
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
          <Card title={t('admin.settings.developersTitle')}>
            <p className="settings-view__developers-hint">{t('admin.settings.developersHint')}</p>
            <Button type="button" variant="secondary" onClick={openDeveloperDocs}>
              {t('admin.settings.developersButton')}
            </Button>
          </Card>
        </div>
      )}
    </SlideTransition>
  )
}
