import { useMemo } from 'react'
import { DiscountedPrice } from '../../components'
import { useCatalogues } from '../../hooks/useCatalogues'
import { useCategoryPrices } from '../../hooks/useCategoryPrices'
import { useProducts } from '../../hooks/useProducts'
import { useLanguage } from '../../i18n'
import type { CustomFieldDefinition } from '../../types/customFields'
import type { Price, Product } from '../../types/product'
import { formatPrice, getEffectivePrice } from '../../utils/price'
import { allergenNames, dietaryTagNames } from '../../utils/productLabels'
import { isProductOutOfStock } from '../../utils/productStock'
import { getSmallUrl } from '../../utils/responsiveImage'
import './CatalogueSlide.scss'

interface CatalogueSlideProps {
  /** Which catalogue to show — omit to fall back to the first one. */
  catalogueId?: string
  /** Which of that catalogue's categories to include, in its own order — omit to include every one. Lets a big catalogue be split across more than one screen (e.g. Screen A gets Salads + Wraps, Screen B gets the rest), each a "Catalogue" slide of its own with a different subset checked. */
  categories?: string[]
}

/** Fullscreen, large-type rendering of an entire catalogue (or, via `categories`, a chosen subset of it) — every included category with at least one available item, in the same category/item layout as the public Menu page (title, description, optional image, and default price per category; each item's own name, price, and description) — for a screen display's "Catalogue" slot, tuned for TV viewing distance and made scrollable since it's usually taller than one screen. A category with no available items is skipped even if included; there's nothing useful to show for it on a display meant to be glanced at from across a room. An item's own price only shows when it has an individual override or a discount — one that's just inheriting the category/catalogue default already has that shown once, in the category's own header, so repeating it per item would be noise. Any of the category's own custom fields (see `Category.customFields`) with a set value on the item render as one more label:value line, same style as the allergens/dietary-tags lines above them. */
export function CatalogueSlide({ catalogueId, categories }: CatalogueSlideProps) {
  const { t, language } = useLanguage()
  const [products] = useProducts()
  const [categoryPrices] = useCategoryPrices()
  const [catalogues] = useCatalogues()

  const catalogue = useMemo(() => catalogues.find((existing) => existing.id === catalogueId) ?? catalogues[0], [catalogues, catalogueId])

  // Re-filters/re-groups only when what it actually depends on changes,
  // instead of on every render of this slide (a crossfade tick, a sibling
  // pane edit, a stage rotation) — `categories`' own stable serialization is
  // used as the dependency instead of the array prop itself, since a caller
  // re-rendering with a fresh-but-equal array literal shouldn't defeat this.
  const categoriesKey = categories?.join('|')
  const categoriesWithItems = useMemo(() => {
    if (!catalogue) return []
    const allowedCategoryIds = new Set(categories ?? catalogue.categories.map((existing) => existing.id))
    return catalogue.categories
      .filter((category) => allowedCategoryIds.has(category.id))
      .map((category) => ({ category, items: products.filter((product) => product.category === category.id && product.available) }))
      .filter(({ items }) => items.length > 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `categoriesKey` stands in for `categories` (see above); `catalogue`/`products` are the real object identities this should react to.
  }, [catalogue, products, categoriesKey])

  // A catalogue's own products with no category at all (see `Product.catalogueId`) — rendered as one more trailing section, same item layout as a real category's, just with a generic heading and no category-level image/description/custom fields (those live on `Category`, which these products don't have).
  const noCategoryItems = useMemo(
    () => (catalogue ? products.filter((product) => !product.category && product.catalogueId === catalogue.id && product.available) : []),
    [catalogue, products],
  )

  return (
    <div className="catalogue-slide">
      {categoriesWithItems.map(({ category, items }) => {
        const defaultPrice = categoryPrices[category.id] ?? catalogue?.price
        return (
          <section key={category.id} className="catalogue-slide__category">
            <div className="catalogue-slide__category-header">
              {category.image && <img className="catalogue-slide__category-image" src={getSmallUrl(category.image)} alt="" />}
              <div className="catalogue-slide__category-heading">
                <h1>{category.name[language]}</h1>
                {category.description && <p className="catalogue-slide__category-description">{category.description[language]}</p>}
              </div>
              {defaultPrice !== undefined && <span className="catalogue-slide__category-price">{formatPrice(defaultPrice, t)}</span>}
            </div>
            <ul className="catalogue-slide__items">
              {items.map((item) => (
                <CatalogueSlideItem key={item.itemID} item={item} defaultPrice={defaultPrice} customFields={category.customFields ?? []} />
              ))}
            </ul>
          </section>
        )
      })}

      {noCategoryItems.length > 0 && (
        <section className="catalogue-slide__category">
          <div className="catalogue-slide__category-header">
            <div className="catalogue-slide__category-heading">
              <h1>{t('menu.otherItemsHeading')}</h1>
            </div>
            {catalogue?.price !== undefined && <span className="catalogue-slide__category-price">{formatPrice(catalogue.price, t)}</span>}
          </div>
          <ul className="catalogue-slide__items">
            {noCategoryItems.map((item) => (
              <CatalogueSlideItem key={item.itemID} item={item} defaultPrice={catalogue?.price} customFields={[]} />
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

interface CatalogueSlideItemProps {
  item: Product
  defaultPrice: Price | undefined
  /** The owning category's own custom fields — empty for a no-category item, since those live on `Category` only. */
  customFields: CustomFieldDefinition[]
}

/** One product's own line within a `CatalogueSlide` section — name, price (only when it has its own override or a discount), description, allergens/dietary tags, any set custom field values, and an out-of-stock stamp. Extracted since both a real category's own section and the trailing "no category" one render this identically. */
function CatalogueSlideItem({ item, defaultPrice, customFields }: CatalogueSlideItemProps) {
  const { t, language } = useLanguage()
  const showPrice = item.discount !== undefined || item.price !== undefined
  const effective = showPrice ? getEffectivePrice(item.price ?? defaultPrice, item.discount) : undefined

  return (
    <li className={`catalogue-slide__item${item.discount ? ' catalogue-slide__item--discounted' : ''}${isProductOutOfStock(item) ? ' catalogue-slide__item--out-of-stock' : ''}`}>
      <div className="catalogue-slide__item-line">
        {item.image && <img className="catalogue-slide__item-image" src={getSmallUrl(item.image)} alt="" />}
        <h2>{item.name[language]}</h2>
        {effective && (
          <span className="catalogue-slide__item-price">
            <DiscountedPrice price={effective.original} discount={item.discount} t={t} />
          </span>
        )}
      </div>
      <p>{item.description[language]}</p>
      {item.allergens.length > 0 && (
        <p className="catalogue-slide__item-allergens">
          {t('menu.allergens.title')}: {allergenNames(item.allergens, t)}
        </p>
      )}
      {item.dietaryTags.length > 0 && (
        <p className="catalogue-slide__item-allergens">
          {t('menu.dietaryTags.title')}: {dietaryTagNames(item.dietaryTags, t)}
        </p>
      )}
      {customFields.map((field) => {
        const value = item.customFieldValues?.[field.id]
        if (value === undefined) return null
        const displayValue =
          field.type === 'boolean'
            ? t(value ? 'admin.common.yes' : 'admin.common.no')
            : field.type === 'select'
              ? (field.options ?? []).find((option) => option.id === value)?.label[language]
              : String(value)
        if (displayValue === undefined) return null
        return (
          <p key={field.id} className="catalogue-slide__item-allergens">
            {field.label[language]}: {displayValue}
          </p>
        )
      })}
      {isProductOutOfStock(item) && <span className="catalogue-slide__sold-out-label">{t('admin.products.soldOutLabel')}</span>}
    </li>
  )
}
