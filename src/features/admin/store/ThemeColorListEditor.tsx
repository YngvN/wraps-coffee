import { AnimatePresence, motion } from 'framer-motion'
import { LockIcon, PlusIcon, TrashIcon } from '../../../components'
import { useLanguage } from '../../../i18n'
import type { AppearanceThemeColor } from '../../../types/appearanceTheme'
import './ThemeColorListEditor.scss'

interface ThemeColorListEditorProps {
  /** Always starts with the 3 locked colors (white/black/grey), followed by any custom ones — see `AppearanceTheme.colors`. */
  colors: AppearanceThemeColor[]
  onChange: (colors: AppearanceThemeColor[]) => void
}

/** A blank swatch to start a newly added custom color from. */
const NEW_CUSTOM_COLOR_HEX = '#dfa93e'

/**
 * A theme's color palette editor: the 3 standard colors (white/black/grey)
 * shown as locked, non-editable swatches, followed by an add/remove list of
 * custom colors — each identified by its own hex value (shown alongside the
 * swatch) rather than a user-typed name, same add/remove pattern as
 * `LogoListEditor`.
 */
export function ThemeColorListEditor({ colors, onChange }: ThemeColorListEditorProps) {
  const { t } = useLanguage()
  const lockedColors = colors.filter((color) => color.locked)
  const customColors = colors.filter((color) => !color.locked)

  const updateCustomColorHex = (id: string, hex: string) => {
    onChange(colors.map((color) => (color.id === id ? { ...color, hex } : color)))
  }

  const removeCustomColor = (id: string) => onChange(colors.filter((color) => color.id !== id))

  const addCustomColor = () => onChange([...colors, { id: crypto.randomUUID(), hex: NEW_CUSTOM_COLOR_HEX }])

  return (
    <div className="theme-color-list-editor">
      <span className="theme-color-list-editor__label">{t('admin.appearance.colorsLabel')}</span>
      <p className="theme-color-list-editor__hint">{t('admin.appearance.lockedColorsHint')}</p>

      <ul className="theme-color-list-editor__locked">
        {lockedColors.map((color) => (
          <li key={color.id} className="theme-color-list-editor__locked-item">
            <span className="theme-color-list-editor__swatch" style={{ backgroundColor: color.hex }} />
            <span className="theme-color-list-editor__locked-name">{t(`screenDisplay.textSizeEditor.colors.${color.id}`)}</span>
            <LockIcon locked />
          </li>
        ))}
      </ul>

      <ul className="theme-color-list-editor__custom">
        <AnimatePresence initial={false}>
          {customColors.map((color) => (
            <motion.li
              key={color.id}
              className="theme-color-list-editor__custom-item"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
            >
              <input
                type="color"
                className="theme-color-list-editor__color-input"
                value={color.hex}
                onChange={(event) => updateCustomColorHex(color.id, event.target.value)}
                aria-label={t('admin.appearance.colorHexLabel')}
              />
              <span className="theme-color-list-editor__hex">{color.hex}</span>
              <button
                type="button"
                className="theme-color-list-editor__remove"
                onClick={() => removeCustomColor(color.id)}
                aria-label={t('admin.common.delete')}
              >
                <TrashIcon />
              </button>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>

      <button type="button" className="theme-color-list-editor__add-row" onClick={addCustomColor}>
        <PlusIcon />
        {t('admin.appearance.addColor')}
      </button>
    </div>
  )
}
