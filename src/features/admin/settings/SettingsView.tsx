import { Card, Checkbox, TranslatedText } from '../../../components'
import { availableLanguages, useLanguage } from '../../../i18n'
import { useSidebarSettings } from '../../../hooks/useSidebarSettings'
import type { ToggleableSidebarItem } from '../../../types/sidebarSettings'
import { ADMIN_NAV_ICONS, NAV_ITEMS } from '../layout/adminNavItems'
import './SettingsView.scss'

/** Admin-wide settings: the interface language, and which sidebar items this cafe's dashboard shows (different cafes use different features — a cafe with no online ordering or no digital signage can hide those tabs entirely). More device/account-level preferences land here over time. */
export function SettingsView() {
  const { t, language, setLanguage } = useLanguage()
  const [sidebarSettings, setSidebarSettings] = useSidebarSettings()
  const toggleableItems = NAV_ITEMS.filter((item) => item.toggleable)

  const toggleSidebarItem = (item: ToggleableSidebarItem, visible: boolean) => {
    const hiddenItems = visible ? sidebarSettings.hiddenItems.filter((hidden) => hidden !== item) : [...sidebarSettings.hiddenItems, item]
    setSidebarSettings({ ...sidebarSettings, hiddenItems })
  }

  return (
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
    </div>
  )
}
