import { useCategoryPrices } from '../../hooks/useCategoryPrices'
import { useProducts } from '../../hooks/useProducts'
import { useLanguage } from '../../i18n'
import type { ProductCategory } from '../../types/product'
import { formatPrice } from '../../utils/price'
import { CATEGORY_META } from '../admin/products/categoryMeta'
import './CategorySlide.scss'

interface CategorySlideProps {
  category: ProductCategory
}

/** Fullscreen, large-type rendering of one menu category's available products, for TV-distance viewing on a screen display. */
export function CategorySlide({ category }: CategorySlideProps) {
  const { t, language } = useLanguage()
  const [products] = useProducts()
  const [categoryPrices] = useCategoryPrices()
  const meta = CATEGORY_META[category]
  const defaultPrice = categoryPrices[category]
  const items = products.filter((product) => product.category === category && product.available)

  return (
    <div className="category-slide">
      <div className="category-slide__header">
        <img className="category-slide__image" src={meta.image} alt="" />
        <h1>{t(`menu.categories.${category}.title`)}</h1>
        {defaultPrice !== undefined && <span className="category-slide__price">{formatPrice(defaultPrice, t)}</span>}
      </div>
      <ul className="category-slide__items">
        {items.map((item) => (
          <li key={item.itemID} className="category-slide__item">
            <div className="category-slide__item-line">
              <h2>{item.name[language]}</h2>
              {item.price !== undefined && <span className="category-slide__item-price">{formatPrice(item.price, t)}</span>}
            </div>
            <p>{item.description[language]}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}
