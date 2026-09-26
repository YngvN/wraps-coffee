import { useState, type FormEvent } from 'react'
import { Button, ImageUploadField, Input, LanguageTabs, Textarea } from '../../../components'
import { useDefaultPaneLanguage } from '../../../hooks/useDefaultPaneLanguage'
import { availableLanguages, useLanguage, type LanguageCode } from '../../../i18n'
import type { Category } from '../../../types/category'
import type { CustomFieldDefinition } from '../../../types/customFields'
import { initialActiveLanguages } from '../../../utils/bilingual'
import { CategoryPriceEditor } from './CategoryPriceEditor'
import { CustomFieldListEditor } from './CustomFieldListEditor'
import './ProductForm.scss'

interface CategoryFormProps {
  /** The category being edited, or `null` when creating a new one. */
  category: Category | null
  /** Shows only this one language tab initially, instead of the usual cafe-default-plus-whatever-already-has-content set — used when this form is mounted for an AI assistant review (`AssistantPanel.tsx`), so the review only ever shows the language the admin was just chatting in. The admin can still add another tab manually either way. */
  forceLanguage?: LanguageCode
  onSave: (category: Category) => void
  onCancel: () => void
}

/** Create/edit form for a category: bilingual name (required) and description (optional) — one language shown at a time, via `LanguageTabs` — an optional image, its own custom-field schema (`CustomFieldListEditor`, e.g. "Bedrooms" for a "Houses" category — see `Category.customFields`), and — once it already exists — its own default price editor (a brand-new category has no id to key a price by yet; that's set from here once it's been saved and reopened). */
export function CategoryForm({ category, forceLanguage, onSave, onCancel }: CategoryFormProps) {
  const { t } = useLanguage()
  const [defaultPaneLanguage] = useDefaultPaneLanguage()
  const requiredLanguage = forceLanguage ?? defaultPaneLanguage
  const [name, setName] = useState(category?.name ?? { en: '', no: '' })
  const [description, setDescription] = useState(category?.description ?? { en: '', no: '' })
  const [image, setImage] = useState(category?.image ?? '')
  const [customFields, setCustomFields] = useState<CustomFieldDefinition[]>(category?.customFields ?? [])
  const [activeLanguages, setActiveLanguages] = useState<LanguageCode[]>(() =>
    forceLanguage ? [forceLanguage] : initialActiveLanguages(defaultPaneLanguage, [category?.name, category?.description], availableLanguages.map((language) => language.code)),
  )
  const [selectedLanguage, setSelectedLanguage] = useState<LanguageCode>(requiredLanguage)

  const addLanguage = (language: LanguageCode) => {
    setActiveLanguages([...activeLanguages, language])
    setSelectedLanguage(language)
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const hasDescription = description.en.trim() !== '' || description.no.trim() !== ''
    onSave({
      // Fields this form doesn't edit (e.g. `saftArticleGroup`, set in Settings → Register) carry over.
      ...category,
      id: category?.id ?? `category-${Date.now()}`,
      name,
      description: hasDescription ? description : undefined,
      image: image || undefined,
      customFields: customFields.length > 0 ? customFields : undefined,
    })
  }

  return (
    <form className="product-form" onSubmit={handleSubmit}>
      <LanguageTabs activeLanguages={activeLanguages} selected={selectedLanguage} onSelect={setSelectedLanguage} onAddLanguage={addLanguage} addLabelKey="admin.common.addLanguage">
        <Input
          id="category-name"
          label={t('admin.products.categoryNameLabel')}
          value={name[selectedLanguage]}
          onChange={(event) => setName({ ...name, [selectedLanguage]: event.target.value })}
          required={selectedLanguage === defaultPaneLanguage}
        />

        <Textarea
          id="category-description"
          label={t('admin.products.categoryDescriptionLabel')}
          value={description[selectedLanguage]}
          onChange={(event) => setDescription({ ...description, [selectedLanguage]: event.target.value })}
        />
      </LanguageTabs>

      <label className="product-form__field">
        <span>{t('admin.products.categoryImageLabel')}</span>
        <ImageUploadField id="category-image" value={image} onChange={setImage} />
      </label>

      {category && <CategoryPriceEditor categoryId={category.id} />}

      <CustomFieldListEditor fields={customFields} selectedLanguage={selectedLanguage} onChange={setCustomFields} />

      <div className="product-form__actions">
        <Button type="button" variant="secondary" onClick={onCancel}>
          {t('admin.common.cancel')}
        </Button>
        <Button type="submit">{t('admin.common.save')}</Button>
      </div>
    </form>
  )
}
