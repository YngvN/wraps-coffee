import { useState, type FormEvent } from 'react'
import { Button, FontPicker, Input } from '../../../components'
import { useLanguage } from '../../../i18n'
import { LOCKED_APPEARANCE_COLORS, type AppearanceTheme, type AppearanceThemeColor, type AppearanceThemeFonts } from '../../../types/appearanceTheme'
import { generateId } from '../../../utils/id'
import { pruneWebsiteRoles } from '../../../utils/websiteTheme'
import { ThemeColorListEditor } from './ThemeColorListEditor'
import { ThemeWebsiteRolesEditor } from './ThemeWebsiteRolesEditor'
import './ThemeEditorForm.scss'

interface ThemeEditorFormProps {
  /** The theme being edited, or `null` when creating a new one. */
  theme: AppearanceTheme | null
  onSave: (theme: AppearanceTheme) => void
  onCancel: () => void
}

const BLANK_FONTS: AppearanceThemeFonts = { body: '', heading: '', subheading: '' }

/** One font role's own input + live preview — same 3 roles for every theme, see `AppearanceThemeFonts`'s own doc comment for what each actually renders. */
const FONT_ROLES: { key: keyof AppearanceThemeFonts; labelKey: string; placeholderKey: string }[] = [
  { key: 'heading', labelKey: 'admin.appearance.headingFontLabel', placeholderKey: 'admin.appearance.headingFontPlaceholder' },
  { key: 'subheading', labelKey: 'admin.appearance.subheadingFontLabel', placeholderKey: 'admin.appearance.subheadingFontPlaceholder' },
  { key: 'body', labelKey: 'admin.appearance.bodyFontLabel', placeholderKey: 'admin.appearance.bodyFontPlaceholder' },
]

/** Create/edit form for a single screen-display appearance theme: name, its 3 font roles (each a free-text Google Font, with its own live preview), and its color palette (see `ThemeColorListEditor`). */
export function ThemeEditorForm({ theme, onSave, onCancel }: ThemeEditorFormProps) {
  const { t } = useLanguage()
  const [name, setName] = useState(theme?.name ?? '')
  const [fonts, setFonts] = useState(theme?.fonts ?? BLANK_FONTS)
  const [colors, setColors] = useState(theme?.colors ?? LOCKED_APPEARANCE_COLORS)
  const [websiteRoles, setWebsiteRoles] = useState(theme?.websiteRoles)

  /**
   * Keeps the website role assignments honest when the palette changes:
   * deleting a swatch a role points at drops that role rather than leaving a
   * dangling id behind. Resolution tolerates a dangling id anyway, so this is
   * hygiene — but it keeps the saved data readable.
   */
  const handleColorsChange = (nextColors: AppearanceThemeColor[]) => {
    setColors(nextColors)
    setWebsiteRoles((current) => pruneWebsiteRoles(current, nextColors.map((color) => color.id)))
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onSave({ id: theme?.id ?? generateId(), name, fonts, colors, websiteRoles })
  }

  return (
    <form className="theme-editor-form" onSubmit={handleSubmit}>
      <Input id="theme-name" label={t('admin.appearance.nameLabel')} value={name} onChange={(event) => setName(event.target.value)} required />

      <p className="theme-editor-form__hint">{t('admin.appearance.fontHint')}</p>
      {FONT_ROLES.map(({ key, labelKey, placeholderKey }) => (
        <div key={key} className="theme-editor-form__font-field">
          <FontPicker
            id={`theme-font-${key}`}
            label={t(labelKey)}
            value={fonts[key]}
            onChange={(value) => setFonts({ ...fonts, [key]: value })}
            placeholder={t(placeholderKey)}
            required
          />
          {fonts[key].trim() && (
            <p className="theme-editor-form__font-preview" style={{ fontFamily: `'${fonts[key]}', sans-serif` }}>
              {t('admin.appearance.fontPreviewText')}
            </p>
          )}
        </div>
      ))}

      <ThemeColorListEditor colors={colors} onChange={handleColorsChange} />

      <ThemeWebsiteRolesEditor colors={colors} roles={websiteRoles} onChange={setWebsiteRoles} />

      <div className="theme-editor-form__actions">
        <Button type="button" variant="secondary" onClick={onCancel}>
          {t('admin.common.cancel')}
        </Button>
        <Button type="submit">{t('admin.common.save')}</Button>
      </div>
    </form>
  )
}
