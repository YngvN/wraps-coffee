import { useCategoryPrices } from '../../hooks/useCategoryPrices'
import { useProducts } from '../../hooks/useProducts'
import { useLanguage } from '../../i18n'
import type { ProductCategory } from '../../types/product'
import { formatPrice } from '../../utils/price'
import { CATEGORY_ORDER } from '../admin/products/categoryMeta'
import './FullMenuSlide.scss'

interface FullMenuSlideProps {
  /** Which categories to include, in `CATEGORY_ORDER`'s own order — omit to include every one. Lets the full menu be split across more than one screen (e.g. Screen A gets Salads + Wraps, Screen B gets the rest), each a "Full menu" slide of its own with a different subset checked. */
  categories?: ProductCategory[]
}

/** Fullscreen, large-type rendering of the entire menu (or, via `categories`, a chosen subset of it) — every included category with at least one available item, in the same category/item layout as the public Menu page (title, description, and default price per category — no category image, unlike the public page; each item's own name, price, and description) — for a screen display's "Full menu" slot, tuned for TV viewing distance and made scrollable since it's usually taller than one screen. A category with no available items is skipped even if included; there's nothing useful to show for it on a display meant to be glanced at from across a room. */
export function FullMenuSlide({ categories }: FullMenuSlideProps) {
  const { t, language } = useLanguage()
  const [products] = useProducts()
  const [categoryPrices] = useCategoryPrices()

  const categoriesToShow = categories ?? CATEGORY_ORDER
  const categoriesWithItems = categoriesToShow.map((category: ProductCategory) => ({
    category,
    items: products.filter((product) => product.category === category && product.available),
  })).filter(({ items }) => items.length > 0)

  return (
    <div className="full-menu-slide">
      {categoriesWithItems.map(({ category, items }) => {
        const defaultPrice = categoryPrices[category]
        return (
          <section key={category} className="full-menu-slide__category">
            <div className="full-menu-slide__category-header">
              <div className="full-menu-slide__category-heading">
                <h1>{t(`menu.categories.${category}.title`)}</h1>
                <p className="full-menu-slide__category-description">{t(`menu.categories.${category}.description`)}</p>
              </div>
              {defaultPrice !== undefined && <span className="full-menu-slide__category-price">{formatPrice(defaultPrice, t)}</span>}
            </div>
            <ul className="full-menu-slide__items">
              {items.map((item) => (
                <li key={item.itemID} className="full-menu-slide__item">
                  <div className="full-menu-slide__item-line">
                    <h2>{item.name[language]}</h2>
                    {item.price !== undefined && <span className="full-menu-slide__item-price">{formatPrice(item.price, t)}</span>}
                  </div>
                  <p>{item.description[language]}</p>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
