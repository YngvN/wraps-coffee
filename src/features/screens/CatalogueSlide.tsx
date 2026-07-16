import { DiscountedPrice } from '../../components'
import { useCatalogues } from '../../hooks/useCatalogues'
import { useCategoryPrices } from '../../hooks/useCategoryPrices'
import { useProducts } from '../../hooks/useProducts'
import { useLanguage } from '../../i18n'
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

/** Fullscreen, large-type rendering of an entire catalogue (or, via `categories`, a chosen subset of it) — every included category with at least one available item, in the same category/item layout as the public Menu page (title, description, optional image, and default price per category; each item's own name, price, and description) — for a screen display's "Catalogue" slot, tuned for TV viewing distance and made scrollable since it's usually taller than one screen. A category with no available items is skipped even if included; there's nothing useful to show for it on a display meant to be glanced at from across a room. An item's own price only shows when it has an individual override or a discount — one that's just inheriting the category/catalogue default already has that shown once, in the category's own header, so repeating it per item would be noise. */
export function CatalogueSlide({ catalogueId, categories }: CatalogueSlideProps) {
  const { t, language } = useLanguage()
  const [products] = useProducts()
  const [categoryPrices] = useCategoryPrices()
  const [catalogues] = useCatalogues()

  const catalogue = catalogues.find((existing) => existing.id === catalogueId) ?? catalogues[0]
  const categoriesToShow = catalogue ? catalogue.categories.filter((category) => (categories ?? catalogue.categories.map((existing) => existing.id)).includes(category.id)) : []
  const categoriesWithItems = categoriesToShow
    .map((category) => ({ category, items: products.filter((product) => product.category === category.id && product.available) }))
    .filter(({ items }) => items.length > 0)

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
              {items.map((item) => {
                const showPrice = item.discount !== undefined || item.price !== undefined
                const effective = showPrice ? getEffectivePrice(item.price ?? defaultPrice, item.discount) : undefined
                return (
                  <li
                    key={item.itemID}
                    className={`catalogue-slide__item${item.discount ? ' catalogue-slide__item--discounted' : ''}${isProductOutOfStock(item) ? ' catalogue-slide__item--out-of-stock' : ''}`}
                  >
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
                    {isProductOutOfStock(item) && <span className="catalogue-slide__sold-out-label">{t('admin.products.soldOutLabel')}</span>}
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
