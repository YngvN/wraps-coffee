import { useState, type FormEvent } from 'react'
import { Button, Checkbox, Input, Textarea } from '../../../components'
import { useLanguage } from '../../../i18n'
import { ALLERGEN_OPTIONS, DIETARY_TAG_ORDER, type AllergenCode, type DietaryTag, type Price, type Product, type ProductCategory } from '../../../types/product'
import { CATEGORY_ORDER } from './categoryMeta'
import './ProductForm.scss'

type PriceMode = 'inherit' | 'flat' | 'dual'

/** Figures out which price editing mode a product's current price implies. */
function priceModeOf(price: Price | undefined): PriceMode {
  if (price === undefined) return 'inherit'
  return typeof price === 'number' ? 'flat' : 'dual'
}

interface ProductFormProps {
  /** The product being edited, or `null` when creating a new one. */
  product: Product | null
  /** Category to default to when creating a new product. */
  defaultCategory: ProductCategory
  onSave: (product: Product) => void
  onCancel: () => void
}

/** Create/edit form for a single menu product: bilingual name/description, category, price, allergen and dietary-tag checkboxes, and availability. */
export function ProductForm({ product, defaultCategory, onSave, onCancel }: ProductFormProps) {
  const { t } = useLanguage()
  const [category, setCategory] = useState<ProductCategory>(product?.category ?? defaultCategory)
  const [nameEn, setNameEn] = useState(product?.name.en ?? '')
  const [nameNo, setNameNo] = useState(product?.name.no ?? '')
  const [descriptionEn, setDescriptionEn] = useState(product?.description.en ?? '')
  const [descriptionNo, setDescriptionNo] = useState(product?.description.no ?? '')
  const [priceMode, setPriceMode] = useState<PriceMode>(priceModeOf(product?.price))
  const [flatPrice, setFlatPrice] = useState(typeof product?.price === 'number' ? product.price : 0)
  const [takeawayPrice, setTakeawayPrice] = useState(typeof product?.price === 'object' ? product.price.takeaway : 0)
  const [eatInPrice, setEatInPrice] = useState(typeof product?.price === 'object' ? product.price.eatIn : 0)
  const [allergens, setAllergens] = useState<AllergenCode[]>(product?.allergens ?? [])
  const [dietaryTags, setDietaryTags] = useState<DietaryTag[]>(product?.dietaryTags ?? [])
  const [available, setAvailable] = useState(product?.available ?? true)

  const toggleAllergen = (code: AllergenCode) => {
    setAllergens((current) => (current.includes(code) ? current.filter((c) => c !== code) : [...current, code]))
  }

  const toggleDietaryTag = (tag: DietaryTag) => {
    setDietaryTags((current) => (current.includes(tag) ? current.filter((existing) => existing !== tag) : [...current, tag]))
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const price: Price | undefined = priceMode === 'inherit' ? undefined : priceMode === 'flat' ? flatPrice : { takeaway: takeawayPrice, eatIn: eatInPrice }

    onSave({
      itemID: product?.itemID ?? `${category}-${Date.now()}`,
      category,
      name: { en: nameEn, no: nameNo },
      description: { en: descriptionEn, no: descriptionNo },
      price,
      allergens,
      dietaryTags,
      available,
    })
  }

  return (
    <form className="product-form" onSubmit={handleSubmit}>
      <label className="product-form__field">
        <span>{t('admin.products.categoryLabel')}</span>
        <select value={category} onChange={(event) => setCategory(event.target.value as ProductCategory)}>
          {CATEGORY_ORDER.map((key) => (
            <option key={key} value={key}>
              {t(`menu.categories.${key}.title`)}
            </option>
          ))}
        </select>
      </label>

      <div className="product-form__row">
        <Input id="product-name-en" label={t('admin.products.nameEnLabel')} value={nameEn} onChange={(event) => setNameEn(event.target.value)} required />
        <Input id="product-name-no" label={t('admin.products.nameNoLabel')} value={nameNo} onChange={(event) => setNameNo(event.target.value)} required />
      </div>

      <div className="product-form__row">
        <Textarea
          id="product-description-en"
          label={t('admin.products.descriptionEnLabel')}
          value={descriptionEn}
          onChange={(event) => setDescriptionEn(event.target.value)}
        />
        <Textarea
          id="product-description-no"
          label={t('admin.products.descriptionNoLabel')}
          value={descriptionNo}
          onChange={(event) => setDescriptionNo(event.target.value)}
        />
      </div>

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

      <div className="product-form__actions">
        <Button type="button" variant="secondary" onClick={onCancel}>
          {t('admin.common.cancel')}
        </Button>
        <Button type="submit">{t('admin.common.save')}</Button>
      </div>
    </form>
  )
}
