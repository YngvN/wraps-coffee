import { AnimatePresence, motion } from 'framer-motion'
import { Input, PlusIcon, TrashIcon } from '../../../components'
import { useLanguage, type LanguageCode } from '../../../i18n'
import type { CustomFieldDefinition, CustomFieldType } from '../../../types/customFields'
import { generateId } from '../../../utils/id'
import './CustomFieldListEditor.scss'

interface CustomFieldListEditorProps {
  fields: CustomFieldDefinition[]
  /** Which side of each field's (and each select option's) bilingual label to show/edit — driven by the parent form's own `LanguageTabs` selection, not a separate per-row language switcher. */
  selectedLanguage: LanguageCode
  onChange: (fields: CustomFieldDefinition[]) => void
}

const FIELD_TYPES: CustomFieldType[] = ['text', 'number', 'boolean', 'select']

const BLANK_LABEL = { no: '', en: '' }

/**
 * A category's own custom-field schema editor (e.g. "Bedrooms", "Fuel type")
 * — same add/remove-only, no-reorder convention as `ThemeColorListEditor`.
 * A `'select'`-type field additionally gets its own nested add/remove list
 * of choices, one level down, using the identical pattern.
 */
export function CustomFieldListEditor({ fields, selectedLanguage, onChange }: CustomFieldListEditorProps) {
  const { t } = useLanguage()

  const updateField = (id: string, patch: Partial<CustomFieldDefinition>) => {
    onChange(fields.map((field) => (field.id === id ? { ...field, ...patch } : field)))
  }

  const removeField = (id: string) => onChange(fields.filter((field) => field.id !== id))

  const addField = () => onChange([...fields, { id: generateId(), label: { ...BLANK_LABEL }, type: 'text' }])

  const updateFieldLabel = (id: string, value: string) => {
    const field = fields.find((candidate) => candidate.id === id)
    if (field) updateField(id, { label: { ...field.label, [selectedLanguage]: value } })
  }

  const setFieldType = (id: string, type: CustomFieldType) => {
    const field = fields.find((candidate) => candidate.id === id)
    updateField(id, { type, options: type === 'select' ? (field?.options ?? []) : undefined })
  }

  const addOption = (fieldId: string) => {
    const field = fields.find((candidate) => candidate.id === fieldId)
    if (field) updateField(fieldId, { options: [...(field.options ?? []), { id: generateId(), label: { ...BLANK_LABEL } }] })
  }

  const removeOption = (fieldId: string, optionId: string) => {
    const field = fields.find((candidate) => candidate.id === fieldId)
    if (field) updateField(fieldId, { options: (field.options ?? []).filter((option) => option.id !== optionId) })
  }

  const updateOptionLabel = (fieldId: string, optionId: string, value: string) => {
    const field = fields.find((candidate) => candidate.id === fieldId)
    if (!field) return
    updateField(fieldId, {
      options: (field.options ?? []).map((option) => (option.id === optionId ? { ...option, label: { ...option.label, [selectedLanguage]: value } } : option)),
    })
  }

  return (
    <div className="custom-field-list-editor">
      <span className="custom-field-list-editor__label">{t('admin.products.customFieldsLabel')}</span>
      <p className="custom-field-list-editor__hint">{t('admin.products.customFieldsHint')}</p>

      <ul className="custom-field-list-editor__list">
        <AnimatePresence initial={false}>
          {fields.map((field) => (
            <motion.li
              key={field.id}
              className="custom-field-list-editor__item"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
            >
              <div className="custom-field-list-editor__row">
                <Input
                  id={`custom-field-label-${field.id}`}
                  aria-label={t('admin.products.customFieldLabelPlaceholder')}
                  placeholder={t('admin.products.customFieldLabelPlaceholder')}
                  value={field.label[selectedLanguage]}
                  onChange={(event) => updateFieldLabel(field.id, event.target.value)}
                />
                <select
                  aria-label={t('admin.products.customFieldTypeLabel')}
                  value={field.type}
                  onChange={(event) => setFieldType(field.id, event.target.value as CustomFieldType)}
                >
                  {FIELD_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {t(`admin.products.customFieldType.${type}`)}
                    </option>
                  ))}
                </select>
                <button type="button" className="custom-field-list-editor__remove" onClick={() => removeField(field.id)} aria-label={t('admin.common.delete')}>
                  <TrashIcon />
                </button>
              </div>

              {field.type === 'select' && (
                <div className="custom-field-list-editor__options">
                  <ul className="custom-field-list-editor__option-list">
                    <AnimatePresence initial={false}>
                      {(field.options ?? []).map((option) => (
                        <motion.li
                          key={option.id}
                          className="custom-field-list-editor__option-item"
                          initial={{ opacity: 0, y: -6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -6 }}
                          transition={{ duration: 0.15 }}
                        >
                          <Input
                            id={`custom-field-option-${option.id}`}
                            aria-label={t('admin.products.customFieldOptionPlaceholder')}
                            placeholder={t('admin.products.customFieldOptionPlaceholder')}
                            value={option.label[selectedLanguage]}
                            onChange={(event) => updateOptionLabel(field.id, option.id, event.target.value)}
                          />
                          <button
                            type="button"
                            className="custom-field-list-editor__remove"
                            onClick={() => removeOption(field.id, option.id)}
                            aria-label={t('admin.common.delete')}
                          >
                            <TrashIcon />
                          </button>
                        </motion.li>
                      ))}
                    </AnimatePresence>
                  </ul>
                  <button type="button" className="custom-field-list-editor__add-row custom-field-list-editor__add-row--nested" onClick={() => addOption(field.id)}>
                    <PlusIcon />
                    {t('admin.products.addCustomFieldOption')}
                  </button>
                </div>
              )}
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>

      <button type="button" className="custom-field-list-editor__add-row" onClick={addField}>
        <PlusIcon />
        {t('admin.products.addCustomField')}
      </button>
    </div>
  )
}
