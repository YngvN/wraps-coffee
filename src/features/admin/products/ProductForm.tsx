import { useState, type FormEvent } from 'react'
import { Button, Checkbox, ImageUploadField, Input, LanguageTabs, Textarea } from '../../../components'
import { useDefaultPaneLanguage } from '../../../hooks/useDefaultPaneLanguage'
import { availableLanguages, useLanguage, type LanguageCode } from '../../../i18n'
import type { Category } from '../../../types/category'
import { ALLERGEN_OPTIONS, DIETARY_TAG_ORDER, type AllergenCode, type DietaryTag, type Discount, type Price, type Product } from '../../../types/product'
import { initialActiveLanguages } from '../../../utils/bilingual'
import './ProductForm.scss'

type PriceMode = 'inherit' | 'flat' | 'dual'
type DiscountMode = 'none' | 'percentage' | 'amount'

/** Figures out which price editing mode a product's current price implies. */
function priceModeOf(price: Price | undefined): PriceMode {
  if (price === undefined) return 'inherit'
  return typeof price === 'number' ? 'flat' : 'dual'
}

interface ProductFormProps {
  /** The product being edited, or `null` when creating a new one. */
  product: Product | null
  /** Category to default to when creating a new product. */
  defaultCategoryId: string
  /** Every category in the same catalogue, for the recategorize `<select>`. */
  catalogueCategories: Category[]
  onSave: (product: Product) => void
  onCancel: () => void
}

/** Create/edit form for a single menu product: bilingual name/description, category, image, price, discount, allergen and dietary-tag checkboxes, availability, and out-of-stock (temporarily unorderable, but still shown, unlike unavailable). */
export function ProductForm({ product, defaultCategoryId, catalogueCategories, onSave, onCancel }: ProductFormProps) {
  const { t, language } = useLanguage()
  const [defaultPaneLanguage] = useDefaultPaneLanguage()
  const [category, setCategory] = useState(product?.category ?? defaultCategoryId)
  const [name, setName] = useState(product?.name ?? { en: '', no: '' })
  const [description, setDescription] = useState(product?.description ?? { en: '', no: '' })
  const [activeLanguages, setActiveLanguages] = useState<LanguageCode[]>(() =>
    initialActiveLanguages(defaultPaneLanguage, [product?.name, product?.description], availableLanguages.map((option) => option.code)),
  )
  const [selectedLanguage, setSelectedLanguage] = useState<LanguageCode>(defaultPaneLanguage)
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

    onSave({
      itemID: product?.itemID ?? `${category}-${Date.now()}`,
      category,
      name,
      description,
      image: image || undefined,
      price,
      discount,
      allergens,
      dietaryTags,
      available,
      outOfStock,
    })
  }

  return (
    <form className="product-form" onSubmit={handleSubmit}>
      <label className="product-form__field">
        <span>{t('admin.products.categoryLabel')}</span>
        <select value={category} onChange={(event) => setCategory(event.target.value)}>
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
          required={selectedLanguage === defaultPaneLanguage}
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

      <fieldset className="product-form__price">
        <legend>{t('admin.products.priceLabel')}</legend>
        <label>
          <input type="radio" name="priceMode" checked={priceMode === 'inherit'} onChange={() => setPriceMode('inherit')} />
          {t('admin.products.priceInheritLabel')}
        </label>
        <label>
          <input type="radio" name="priceMode" checked={priceMode === 'flat'} onChange={() => setPriceMode('flat')} />
          <input
            type="number"
            min={0}
            aria-label={t('admin.products.priceLabel')}
            value={flatPrice}
            disabled={priceMode !== 'flat'}
            onChange={(event) => setFlatPrice(Number(event.target.value))}
          />
        </label>
        <label>
          <input type="radio" name="priceMode" checked={priceMode === 'dual'} onChange={() => setPriceMode('dual')} />
          <input
            type="number"
            min={0}
            aria-label={t('admin.products.priceTakeawayLabel')}
            value={takeawayPrice}
            disabled={priceMode !== 'dual'}
            onChange={(event) => setTakeawayPrice(Number(event.target.value))}
          />
          {' / '}
          <input
            type="number"
            min={0}
            aria-label={t('admin.products.priceEatInLabel')}
            value={eatInPrice}
            disabled={priceMode !== 'dual'}
            onChange={(event) => setEatInPrice(Number(event.target.value))}
          />
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
          <input
            type="number"
            min={0}
            max={100}
            aria-label={t('admin.products.discountPercentageLabel')}
            value={discountPercentage}
            disabled={discountMode !== 'percentage'}
            onChange={(event) => setDiscountPercentage(Number(event.target.value))}
          />
          {t('admin.products.discountPercentageLabel')}
        </label>
        <label>
          <input type="radio" name="discountMode" checked={discountMode === 'amount'} onChange={() => setDiscountMode('amount')} />
          <input
            type="number"
            min={0}
            aria-label={t('admin.products.discountAmountLabel')}
            value={discountAmount}
            disabled={discountMode !== 'amount'}
            onChange={(event) => setDiscountAmount(Number(event.target.value))}
          />
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

      <Checkbox id="product-available" label={t('admin.products.availableLabel')} checked={available} onChange={(event) => setAvailable(event.target.checked)} />
      <Checkbox id="product-out-of-stock" label={t('admin.products.outOfStockLabel')} checked={outOfStock} onChange={(event) => setOutOfStock(event.target.checked)} />

      <div className="product-form__actions">
        <Button type="button" variant="secondary" onClick={onCancel}>
          {t('admin.common.cancel')}
        </Button>
        <Button type="submit">{t('admin.common.save')}</Button>
      </div>
    </form>
  )
}
