import { HelpTip } from '../../../components'
import { useLanguage } from '../../../i18n'
import { WEBSITE_ROLE_KEYS, type AppearanceThemeColor, type AppearanceThemeWebsiteRoles } from '../../../types/appearanceTheme'
import './ThemeWebsiteRolesEditor.scss'

interface ThemeWebsiteRolesEditorProps {
  /** The theme's own palette — the only colors a role may point at. */
  colors: AppearanceThemeColor[]
  roles: AppearanceThemeWebsiteRoles | undefined
  onChange: (roles: AppearanceThemeWebsiteRoles | undefined) => void
}

/**
 * Assigns each of the public website's color tokens to a swatch from this
 * theme's own palette.
 *
 * Exists because the palette is deliberately unstructured — a bag of swatches
 * with no meaning attached — while a website needs to know which one is the
 * background and which one is the text. Screens don't need that mapping (each
 * pane picks its own colors), so this section only affects the website.
 *
 * Leaving a role unset is normal and safe: the website falls back to its own
 * built-in value for anything not mapped here.
 */
export function ThemeWebsiteRolesEditor({ colors, roles, onChange }: ThemeWebsiteRolesEditorProps) {
  const { t } = useLanguage()

  const setRole = (role: keyof AppearanceThemeWebsiteRoles, colorId: string) => {
    const next = { ...(roles ?? ({} as AppearanceThemeWebsiteRoles)), [role]: colorId }

    // An all-empty map is stored as `undefined` rather than a husk of blank
    // strings, matching "themes saved before this existed have none".
    if (!colorId) delete next[role]
    onChange(Object.values(next).some(Boolean) ? next : undefined)
  }

  return (
    <section className="theme-website-roles">
      <h3 className="theme-website-roles__title">
        {t('admin.appearance.websiteRolesTitle')} <HelpTip text={t('admin.appearance.websiteRolesHint')} />
      </h3>

      <ul className="theme-website-roles__list">
        {WEBSITE_ROLE_KEYS.map((role) => {
          const selectedId = roles?.[role] ?? ''
          const selected = colors.find((color) => color.id === selectedId)

          return (
            <li key={role} className="theme-website-roles__item">
              <label className="theme-website-roles__field">
                <span className="theme-website-roles__label">{t(`admin.appearance.websiteRoles.${role}`)}</span>
                <div className="theme-website-roles__control">
                  <span
                    className="theme-website-roles__swatch"
                    style={{ background: selected?.hex ?? 'transparent' }}
                    aria-hidden="true"
                    data-empty={selected ? undefined : 'true'}
                  />
                  <select value={selectedId} onChange={(event) => setRole(role, event.target.value)}>
                    <option value="">{t('admin.appearance.websiteRolesUnset')}</option>
                    {colors.map((color) => (
                      <option key={color.id} value={color.id}>
                        {color.locked ? t(`screenDisplay.textSizeEditor.colors.${color.id}`) : color.hex}
                      </option>
                    ))}
                  </select>
                </div>
              </label>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
