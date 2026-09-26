import { useState, type FormEvent } from 'react'
import { Button, Checkbox, HelpTip, ImageUploadField, Input, LanguageTabs, NumberInput, Textarea } from '../../../components'
import { useDefaultPaneLanguage } from '../../../hooks/useDefaultPaneLanguage'
import { availableLanguages, useLanguage, type LanguageCode } from '../../../i18n'
import type { Category } from '../../../types/category'
import type { CustomFieldDefinition } from '../../../types/customFields'
import { ALLERGEN_OPTIONS, DIETARY_TAG_ORDER, type AllergenCode, type DietaryTag, type Discount, type Price, type Product, type VatCategory } from '../../../types/product'
import { VAT_CATEGORIES } from '../../../lib/vat'
import { initialActiveLanguages } from '../../../utils/bilingual'
import { ProductBarcodeField } from './ProductBarcodeField'
import './ProductForm.scss'

type PriceMode = 'inherit' | 'flat' | 'dual'
type DiscountMode = 'none' | 'percentage' | 'amount'

/** Figures out which price editing mode a product's current price implies. */
function priceModeOf(price: Price | undefined): PriceMode {
  if (price === undefined) return 'inherit'
  return typeof price === 'number' ? 'flat' : 'dual'
}

/** Drops any value for a field the *current* category doesn't define — switching category (which can change what fields even apply) shouldn't leave a previous category's values lingering in what gets saved. */
function relevantCustomFieldValues(values: Record<string, string | number | boolean>, defs: CustomFieldDefinition[]): Record<string, string | number | boolean> | undefined {
  const filtered = Object.fromEntries(Object.entries(values).filter(([fieldId]) => defs.some((field) => field.id === fieldId)))
  return Object.keys(filtered).length > 0 ? filtered : undefined
}

interface CustomFieldControlProps {
  field: CustomFieldDefinition
  value: string | number | boolean | undefined
  language: LanguageCode
  onChange: (value: string | number | boolean) => void
}

/** One input for a single product-level custom field value, shaped per the field's own declared type (see `Category.customFields`). */
function CustomFieldControl({ field, value, language, onChange }: CustomFieldControlProps) {
  if (field.type === 'boolean') {
    return <Checkbox id={`product-custom-field-${field.id}`} label={field.label[language]} checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} />
  }
  if (field.type === 'select') {
    return (
      <label className="product-form__field">
        <span>{field.label[language]}</span>
        <select value={typeof value === 'string' ? value : ''} onChange={(event) => onChange(event.target.value)}>
          <option value="" />
          {(field.options ?? []).map((option) => (
            <option key={option.id} value={option.id}>
              {option.label[language]}
            </option>
          ))}
        </select>
      </label>
    )
  }
  if (field.type === 'number') {
    return (
      <Input
        id={`product-custom-field-${field.id}`}
        type="number"
        label={field.label[language]}
        value={typeof value === 'number' ? value : ''}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    )
  }
  return (
    <Input id={`product-custom-field-${field.id}`} label={field.label[language]} value={typeof value === 'string' ? value : ''} onChange={(event) => onChange(event.target.value)} />
  )
}

interface ProductFormProps {
  /** The product being edited, or `null` when creating a new one. */
  product: Product | null
  /** The catalogue this form is scoped to — every category offered belongs to it, and it's what a new product's `catalogueId` is set to when "No category" is picked. This form only ever moves a product within this one catalogue's own categories (or out to no-category within it); moving to a genuinely different catalogue is the dedicated "Move to another catalogue…" action instead (see `ProductRow.tsx`). */
  catalogueId: string
  /** Category to default to when creating a new product — omit for "no category" (e.g. creating directly from the catalogue's own "No category" section). */
  defaultCategoryId?: string
  /** Every category in the same catalogue, for the recategorize `<select>`. */
  catalogueCategories: Category[]
  /** Shows only this one language tab initially, instead of the usual cafe-default-plus-whatever-already-has-content set — used when this form is mounted for an AI assistant review (`AssistantPanel.tsx`), so the review only ever shows the language the admin was just chatting in, not every language the product happens to already have content in. The admin can still add another tab manually either way. */
  forceLanguage?: LanguageCode
  onSave: (product: Product) => void
  onCancel: () => void
}

/** Create/edit form for a single menu product: bilingual name/description, category (or none — a product can live directly in the catalogue instead), image, the selected category's own custom fields (if it defines any — see `Category.customFields`; changes as `category` changes), price, discount, allergen and dietary-tag checkboxes, availability, and out-of-stock (temporarily unorderable, but still shown, unlike unavailable) — either set manually, or, once "Track stock" is on, derived automatically from a live quantity instead (see `isProductOutOfStock` in `src/utils/productStock.ts`; the manual checkbox is hidden while stock tracking owns the answer). */
export function ProductForm({ product, catalogueId, defaultCategoryId, catalogueCategories, forceLanguage, onSave, onCancel }: ProductFormProps) {
  const { t, language } = useLanguage()
  const [defaultPaneLanguage] = useDefaultPaneLanguage()
  const [category, setCategory] = useState(product?.category ?? defaultCategoryId ?? '')
  const [name, setName] = useState(product?.name ?? { en: '', no: '' })
  const [description, setDescription] = useState(product?.description ?? { en: '', no: '' })
  const [activeLanguages, setActiveLanguages] = useState<LanguageCode[]>(() =>
    forceLanguage ? [forceLanguage] : initialActiveLanguages(defaultPaneLanguage, [product?.name, product?.description], availableLanguages.map((option) => option.code)),
  )
  const [selectedLanguage, setSelectedLanguage] = useState<LanguageCode>(forceLanguage ?? defaultPaneLanguage)
  const [image, setImage] = useState(product?.image ?? '')
  const [priceMode, setPriceMode] = useState<PriceMode>(priceModeOf(product?.price))
  const [flatPrice, setFlatPrice] = useState(typeof product?.price === 'number' ? product.price : 0)
  const [takeawayPrice, setTakeawayPrice] = useState(typeof product?.price === 'object' ? product.price.takeaway : 0)
  const [eatInPrice, setEatInPrice] = useState(typeof product?.price === 'object' ? product.price.eatIn : 0)
  const [discountMode, setDiscountMode] = useState<DiscountMode>(product?.discount?.type ?? 'none')
  const [discountPercentage, setDiscountPercentage] = useState(product?.discount?.type === 'percentage' ? product.discount.percentage : 0)
  const [discountAmount, setDiscountAmount] = useState(product?.discount?.type === 'amount' ? product.discount.amount : 0)
  const [allergens, setAllergens] = useState<AllergenCode[]>(product?.allergens ?? [])
  const [dietaryTags, setDietaryTags] = useState<DietaryTag[]>(product?.dietaryTags ?? [])
  const [available, setAvailable] = useState(product?.available ?? true)
  const [outOfStock, setOutOfStock] = useState(product?.outOfStock ?? false)
  const [trackStock, setTrackStock] = useState(product?.trackStock ?? false)
  const [stockQuantity, setStockQuantity] = useState(product?.stockQuantity ?? 0)
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string | number | boolean>>(product?.customFieldValues ?? {})
  const [barcode, setBarcode] = useState(product?.barcode ?? '')
  const [readyToServe, setReadyToServe] = useState(product?.readyToServe ?? false)
  const [vatCategory, setVatCategory] = useState<VatCategory>(product?.vatCategory ?? 'food')

  /** The selected category's own custom-field schema (e.g. "Bedrooms" for a "Houses" category) — changes as `category` changes, since a different category can define entirely different fields. */
  const customFieldDefs: CustomFieldDefinition[] = catalogueCategories.find((option) => option.id === category)?.customFields ?? []

  const setCustomFieldValue = (fieldId: string, value: string | number | boolean) => {
    setCustomFieldValues((current) => ({ ...current, [fieldId]: value }))
  }

  const addLanguage = (nextLanguage: LanguageCode) => {
    setActiveLanguages([...activeLanguages, nextLanguage])
    setSelectedLanguage(nextLanguage)
  }

  const toggleAllergen = (code: AllergenCode) => {
    setAllergens((current) => (current.includes(code) ? current.filter((c) => c !== code) : [...current, code]))
  }

  const toggleDietaryTag = (tag: DietaryTag) => {
    setDietaryTags((current) => (current.includes(tag) ? current.filter((existing) => existing !== tag) : [...current, tag]))
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const price: Price | undefined = priceMode === 'inherit' ? undefined : priceMode === 'flat' ? flatPrice : { takeaway: takeawayPrice, eatIn: eatInPrice }
    const discount: Discount | undefined =
      discountMode === 'none' ? undefined : discountMode === 'percentage' ? { type: 'percentage', percentage: discountPercentage } : { type: 'amount', amount: discountAmount }
    // This runs only inside `handleSubmit` (a form submit handler), never during render — `react-hooks/purity` appears to mis-flag it as an in-render impure call once this file's custom-field controls (further below) are also present, an apparent false positive of this still-experimental lint rule.
    // eslint-disable-next-line react-hooks/purity
    const itemID = product?.itemID ?? `${category || catalogueId}-${Date.now()}`

    onSave({
      itemID,
      category: category || undefined,
      catalogueId: category ? undefined : catalogueId,
      name,
      description,
      image: image || undefined,
      price,
      discount,
      allergens,
      dietaryTags,
      available,
      outOfStock,
      trackStock,
      stockQuantity,
      customFieldValues: relevantCustomFieldValues(customFieldValues, customFieldDefs),
      barcode: barcode.trim() || undefined,
      readyToServe: readyToServe || undefined,
      // `food` is the default, so it isn't stored.
      vatCategory: vatCategory === 'food' ? undefined : vatCategory,
    })
  }

  return (
    <form className="product-form" onSubmit={handleSubmit}>
      <label className="product-form__field">
        <span>{t('admin.products.categoryLabel')}</span>
        <select value={category} onChange={(event) => setCategory(event.target.value)}>
          <option value="">{t('admin.products.noCategoryOption')}</option>
          {catalogueCategories.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name[language]}
            </option>
          ))}
        </select>
      </label>

      <LanguageTabs activeLanguages={activeLanguages} selected={selectedLanguage} onSelect={setSelectedLanguage} onAddLanguage={addLanguage} addLabelKey="admin.common.addLanguage">
        <Input
          id="product-name"
          label={t('admin.products.nameLabel')}
          value={name[selectedLanguage]}
          onChange={(event) => setName({ ...name, [selectedLanguage]: event.target.value })}
          required={selectedLanguage === (forceLanguage ?? defaultPaneLanguage)}
        />

        <Textarea
          id="product-description"
          label={t('admin.products.descriptionLabel')}
          value={description[selectedLanguage]}
          onChange={(event) => setDescription({ ...description, [selectedLanguage]: event.target.value })}
        />
      </LanguageTabs>

      <label className="product-form__field">
        <span>{t('admin.products.productImageLabel')}</span>
        <ImageUploadField id="product-image" value={image} onChange={setImage} />
      </label>

      {customFieldDefs.length > 0 && (
        <fieldset className="product-form__custom-fields">
          <legend>{t('admin.products.customFieldsLabel')}</legend>
          {customFieldDefs.map((field) => (
            <CustomFieldControl key={field.id} field={field} value={customFieldValues[field.id]} language={language} onChange={(value) => setCustomFieldValue(field.id, value)} />
          ))}
        </fieldset>
      )}

      <fieldset className="product-form__price">
        <legend>{t('admin.products.priceLabel')}</legend>
        <label>
          <input type="radio" name="priceMode" checked={priceMode === 'inherit'} onChange={() => setPriceMode('inherit')} />
          {t('admin.products.priceInheritLabel')}
        </label>
        <label>
          <input type="radio" name="priceMode" checked={priceMode === 'flat'} onChange={() => setPriceMode('flat')} />
          <NumberInput min={0} aria-label={t('admin.products.priceLabel')} value={flatPrice} disabled={priceMode !== 'flat'} onChange={setFlatPrice} />
        </label>
        <label>
          <input type="radio" name="priceMode" checked={priceMode === 'dual'} onChange={() => setPriceMode('dual')} />
          <NumberInput min={0} aria-label={t('admin.products.priceTakeawayLabel')} value={takeawayPrice} disabled={priceMode !== 'dual'} onChange={setTakeawayPrice} />
          {' / '}
          <NumberInput min={0} aria-label={t('admin.products.priceEatInLabel')} value={eatInPrice} disabled={priceMode !== 'dual'} onChange={setEatInPrice} />
        </label>
      </fieldset>

      <fieldset className="product-form__price">
        <legend>{t('admin.products.discountLabel')}</legend>
        <label>
          <input type="radio" name="discountMode" checked={discountMode === 'none'} onChange={() => setDiscountMode('none')} />
          {t('admin.products.discountNoneLabel')}
        </label>
        <label>
          <input type="radio" name="discountMode" checked={discountMode === 'percentage'} onChange={() => setDiscountMode('percentage')} />
          <NumberInput
            min={0}
            max={100}
            aria-label={t('admin.products.discountPercentageLabel')}
            value={discountPercentage}
            disabled={discountMode !== 'percentage'}
            onChange={setDiscountPercentage}
          />
          {t('admin.products.discountPercentageLabel')}
        </label>
        <label>
          <input type="radio" name="discountMode" checked={discountMode === 'amount'} onChange={() => setDiscountMode('amount')} />
          <NumberInput min={0} aria-label={t('admin.products.discountAmountLabel')} value={discountAmount} disabled={discountMode !== 'amount'} onChange={setDiscountAmount} />
          {t('admin.products.discountAmountLabel')}
        </label>
      </fieldset>

      <fieldset className="product-form__allergens">
        <legend>{t('admin.products.allergensLabel')}</legend>
        {ALLERGEN_OPTIONS.map(({ code, i18nKey }) => (
          <Checkbox key={code} id={`allergen-${code}`} label={t(`menu.allergens.items.${i18nKey}.title`)} checked={allergens.includes(code)} onChange={() => toggleAllergen(code)} />
        ))}
      </fieldset>

      <fieldset className="product-form__allergens">
        <legend>{t('admin.products.dietaryTagsLabel')}</legend>
        {DIETARY_TAG_ORDER.map((tag) => (
          <Checkbox
            key={tag}
            id={`dietary-tag-${tag}`}
            label={t(`menu.dietaryTags.items.${tag}.title`)}
            checked={dietaryTags.includes(tag)}
            onChange={() => toggleDietaryTag(tag)}
          />
        ))}
      </fieldset>

      <ProductBarcodeField
        itemID={product?.itemID}
        value={barcode}
        onChange={setBarcode}
        onFound={(entry) => {
          // Suggestions only fill what's still empty, so a lookup never overwrites the admin's own text.
          if (!name.no && !name.en) setName({ no: entry.name.no, en: entry.name.en })
          if (!image && entry.image) setImage(entry.image)
          if (allergens.length === 0) setAllergens(entry.allergens)
          setReadyToServe(true)
        }}
      />
      <Checkbox
        id="product-ready-to-serve"
        label={
          <>
            {t('admin.products.readyToServeLabel')} <HelpTip text={t('admin.products.readyToServeHint')} />
          </>
        }
        checked={readyToServe}
        onChange={(event) => setReadyToServe(event.target.checked)}
      />
      <label className="product-form__field">
        <span>
          {t('admin.products.vatCategoryLabel')} <HelpTip text={t('admin.products.vatCategoryHint')} />
        </span>
        <select value={vatCategory} onChange={(event) => setVatCategory(event.target.value as VatCategory)}>
          {VAT_CATEGORIES.map((option) => (
            <option key={option} value={option}>
              {t(`admin.products.vatCategory.${option}`)}
            </option>
          ))}
        </select>
      </label>

      <Checkbox id="product-available" label={t('admin.products.availableLabel')} checked={available} onChange={(event) => setAvailable(event.target.checked)} />

      <Checkbox id="product-track-stock" label={t('admin.products.trackStockLabel')} checked={trackStock} onChange={(event) => setTrackStock(event.target.checked)} />
      {trackStock ? (
        <NumberInput
          id="product-stock-quantity"
          min={0}
          label={t('admin.products.stockQuantityLabel')}
          value={stockQuantity}
          onChange={(value) => setStockQuantity(Math.max(0, Math.round(value) || 0))}
        />
      ) : (
        <Checkbox id="product-out-of-stock" label={t('admin.products.outOfStockLabel')} checked={outOfStock} onChange={(event) => setOutOfStock(event.target.checked)} />
      )}

      <div className="product-form__actions">
        <Button type="button" variant="secondary" onClick={onCancel}>
          {t('admin.common.cancel')}
        </Button>
        <Button type="submit">{t('admin.common.save')}</Button>
      </div>
    </form>
  )
}
