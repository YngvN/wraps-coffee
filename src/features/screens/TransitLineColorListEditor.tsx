import { AnimatePresence, motion } from 'framer-motion'
import { Input, PlusIcon, TrashIcon } from '../../components'
import { useLanguage } from '../../i18n'
import { generateId } from '../../utils/id'
import './TransitLineColorListEditor.scss'

interface TransitLineColor {
  id: string
  authority: string
  hex: string
}

interface TransitLineColorListEditorProps {
  colors: TransitLineColor[]
  onChange: (colors: TransitLineColor[]) => void
}

/** A newly added row's starting swatch — distinct from `ThemeColorListEditor`'s own default so the two don't look identical if a form ever shows both. */
const NEW_LINE_COLOR_HEX = '#3e7bdf'

/**
 * A transit pane's per-operator line-badge color list — an add/remove list
 * where each row pairs a free-text operator name (matched against
 * `DepartureInfo['authorityName']` at render time, since Entur's own
 * authority ids aren't something an admin would know) with a color, same
 * add/remove-only convention as `ThemeColorListEditor`/`CustomFieldListEditor`.
 */
export function TransitLineColorListEditor({ colors, onChange }: TransitLineColorListEditorProps) {
  const { t } = useLanguage()

  const updateColor = (id: string, patch: Partial<TransitLineColor>) => {
    onChange(colors.map((color) => (color.id === id ? { ...color, ...patch } : color)))
  }

  const removeColor = (id: string) => onChange(colors.filter((color) => color.id !== id))

  const addColor = () => onChange([...colors, { id: generateId(), authority: '', hex: NEW_LINE_COLOR_HEX }])

  return (
    <div className="transit-line-color-list-editor">
      <span className="transit-line-color-list-editor__label">{t('admin.screens.transitLineColorsLabel')}</span>
      <p className="transit-line-color-list-editor__hint">{t('admin.screens.transitLineColorsHint')}</p>

      <ul className="transit-line-color-list-editor__list">
        <AnimatePresence initial={false}>
          {colors.map((color) => (
            <motion.li
              key={color.id}
              className="transit-line-color-list-editor__item"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
            >
              <Input
                id={`transit-line-color-authority-${color.id}`}
                aria-label={t('admin.screens.transitLineColorAuthorityPlaceholder')}
                placeholder={t('admin.screens.transitLineColorAuthorityPlaceholder')}
                value={color.authority}
                onChange={(event) => updateColor(color.id, { authority: event.target.value })}
              />
              <input
                type="color"
                className="transit-line-color-list-editor__color-input"
                value={color.hex}
                onChange={(event) => updateColor(color.id, { hex: event.target.value })}
                aria-label={t('admin.screens.transitLineColorHexLabel')}
              />
              <button
                type="button"
                className="transit-line-color-list-editor__remove"
                onClick={() => removeColor(color.id)}
                aria-label={t('admin.common.delete')}
              >
                <TrashIcon />
              </button>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>

      <button type="button" className="transit-line-color-list-editor__add-row" onClick={addColor}>
        <PlusIcon />
        {t('admin.screens.transitAddLineColorLabel')}
      </button>
    </div>
  )
}
