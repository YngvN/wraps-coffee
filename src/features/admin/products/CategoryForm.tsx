import { useState, type FormEvent } from 'react'
import { Button, ImageUploadField, Input, LanguageTabs, Textarea } from '../../../components'
import { useDefaultPaneLanguage } from '../../../hooks/useDefaultPaneLanguage'
import { availableLanguages, useLanguage, type LanguageCode } from '../../../i18n'
import type { Category } from '../../../types/category'
import { initialActiveLanguages } from '../../../utils/bilingual'
import { CategoryPriceEditor } from './CategoryPriceEditor'
import './ProductForm.scss'

interface CategoryFormProps {
  /** The category being edited, or `null` when creating a new one. */
  category: Category | null
  onSave: (category: Category) => void
  onCancel: () => void
}

/** Create/edit form for a category: bilingual name (required) and description (optional) — one language shown at a time, via `LanguageTabs` — an optional image, and — once it already exists — its own default price editor (a brand-new category has no id to key a price by yet; that's set from here once it's been saved and reopened). */
export function CategoryForm({ category, onSave, onCancel }: CategoryFormProps) {
  const { t } = useLanguage()
  const [defaultPaneLanguage] = useDefaultPaneLanguage()
  const [name, setName] = useState(category?.name ?? { en: '', no: '' })
  const [description, setDescription] = useState(category?.description ?? { en: '', no: '' })
  const [image, setImage] = useState(category?.image ?? '')
  const [activeLanguages, setActiveLanguages] = useState<LanguageCode[]>(() =>
    initialActiveLanguages(defaultPaneLanguage, [category?.name, category?.description], availableLanguages.map((language) => language.code)),
  )
  const [selectedLanguage, setSelectedLanguage] = useState<LanguageCode>(defaultPaneLanguage)

  const addLanguage = (language: LanguageCode) => {
    setActiveLanguages([...activeLanguages, language])
    setSelectedLanguage(language)
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const hasDescription = description.en.trim() !== '' || description.no.trim() !== ''
    onSave({
      id: category?.id ?? `category-${Date.now()}`,
      name,
      description: hasDescription ? description : undefined,
      image: image || undefined,
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

      <div className="product-form__actions">
        <Button type="button" variant="secondary" onClick={onCancel}>
          {t('admin.common.cancel')}
        </Button>
        <Button type="submit">{t('admin.common.save')}</Button>
      </div>
    </form>
  )
}
