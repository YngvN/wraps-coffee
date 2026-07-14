import { useState, type FormEvent } from 'react'
import { Button, Input, LanguageTabs } from '../../../components'
import { useDefaultPaneLanguage } from '../../../hooks/useDefaultPaneLanguage'
import { availableLanguages, useLanguage, type LanguageCode } from '../../../i18n'
import type { Catalogue } from '../../../types/category'
import type { Price } from '../../../types/product'
import { initialActiveLanguages } from '../../../utils/bilingual'
import { PriceEditor } from './PriceEditor'
import './ProductForm.scss'

interface CatalogueFormProps {
  /** The catalogue being edited, or `null` when creating a new one. */
  catalogue: Catalogue | null
  onSave: (catalogue: Catalogue) => void
  onCancel: () => void
}

/** Create/edit form for a catalogue: its own bilingual name (one language shown at a time, via `LanguageTabs` — starting on the cafe's own standard pane language, plus any other already-filled-in one), an optional default price (the fallback beneath a category's own default, in turn beneath a product's own override — useful for a catalogue like "Merch" that doesn't need per-category pricing) — categories are added afterwards, from inside it. */
export function CatalogueForm({ catalogue, onSave, onCancel }: CatalogueFormProps) {
  const { t } = useLanguage()
  const [defaultPaneLanguage] = useDefaultPaneLanguage()
  const [name, setName] = useState(catalogue?.name ?? { en: '', no: '' })
  const [activeLanguages, setActiveLanguages] = useState<LanguageCode[]>(() =>
    initialActiveLanguages(defaultPaneLanguage, [catalogue?.name], availableLanguages.map((language) => language.code)),
  )
  const [selectedLanguage, setSelectedLanguage] = useState<LanguageCode>(defaultPaneLanguage)
  const [price, setPrice] = useState<Price | undefined>(catalogue?.price)

  const addLanguage = (language: LanguageCode) => {
    setActiveLanguages([...activeLanguages, language])
    setSelectedLanguage(language)
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onSave({
      id: catalogue?.id ?? `catalogue-${Date.now()}`,
      name,
      categories: catalogue?.categories ?? [],
      price,
    })
  }

  return (
    <form className="product-form" onSubmit={handleSubmit}>
      <LanguageTabs activeLanguages={activeLanguages} selected={selectedLanguage} onSelect={setSelectedLanguage} onAddLanguage={addLanguage} addLabelKey="admin.common.addLanguage">
        <Input
          id="catalogue-name"
          label={t('admin.products.catalogueNameLabel')}
          value={name[selectedLanguage]}
          onChange={(event) => setName({ ...name, [selectedLanguage]: event.target.value })}
          required={selectedLanguage === defaultPaneLanguage}
        />
      </LanguageTabs>

      <PriceEditor price={price} onChange={setPrice} legendKey="admin.products.cataloguePriceLabel" fieldId={`catalogue-${catalogue?.id ?? 'new'}`} />

      <div className="product-form__actions">
        <Button type="button" variant="secondary" onClick={onCancel}>
          {t('admin.common.cancel')}
        </Button>
        <Button type="submit">{t('admin.common.save')}</Button>
      </div>
    </form>
  )
}
