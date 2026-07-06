import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { TranslatedText } from '../components'
import { CATEGORY_META, CATEGORY_ORDER } from '../features/admin/products/categoryMeta'
import { useCategoryPrices } from '../hooks/useCategoryPrices'
import { useProducts } from '../hooks/useProducts'
import { useLanguage } from '../i18n'
import type { AllergenCode, ProductCategory } from '../types/product'
import { formatPrice } from '../utils/price'
import './Menu.scss'

/** Allergen entries shown in the legend at the end of the menu, in the order their codes are introduced. */
const allergenKeys = ['gluten', 'milk', 'fishShellfish', 'cashews'] as const

/** Maps each allergen legend entry to the short code shown under menu items. */
const allergenCodes: Record<(typeof allergenKeys)[number], AllergenCode> = {
  gluten: 'G',
  milk: 'M',
  fishShellfish: 'F',
  cashews: 'N',
}

/**
 * Full menu page for Wraps & Coffee, grouped into categories (salads, wraps,
 * baguettes, pizza, nachos, coffee & drinks, smoothies), followed by an
 * allergens note. Scrolls to the category in the URL hash (e.g. `/menu#pizza`)
 * when navigated to from the homepage.
 *
 * Products are read from `useProducts()`, which overlays admin edits (made in
 * the owner dashboard) on top of the `products.json` seed data.
 */
export function Menu() {
  const { t, language } = useLanguage()
  const { hash } = useLocation()
  const [products] = useProducts()
  const [categoryPrices] = useCategoryPrices()

  useEffect(() => {
    if (!hash) return
    const target = document.getElementById(hash.slice(1))
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [hash])

  return (
    <div className="menu">
      <TranslatedText as="h1" id="menu.title" />
      <TranslatedText as="p" id="menu.intro" />
      <TranslatedText as="p" className="menu__price-legend" id="menu.priceLegend" />
      {CATEGORY_ORDER.map((categoryKey: ProductCategory) => {
        const meta = CATEGORY_META[categoryKey]
        const defaultPrice = categoryPrices[categoryKey]
        const items = products.filter((product) => product.category === categoryKey && product.available)

        return (
          <section key={categoryKey} id={categoryKey} className="menu__category">
            <div className="menu__category-header">
              <img className="menu__category-image" src={meta.image} alt="" />
              <h2>{t(`menu.categories.${categoryKey}.title`)}</h2>
              <p>{t(`menu.categories.${categoryKey}.description`)}</p>
              {defaultPrice !== undefined && <span className="menu__category-price">{formatPrice(defaultPrice, t)}</span>}
            </div>
            <ul className="menu__items">
              {items.map((item) => (
                <li key={item.itemID} className="menu__item">
                  <div className="menu__item-line">
                    <h3>{item.name[language]}</h3>
                    {item.price !== undefined && (
                      <>
                        <span className="menu__item-leader" />
                        <span className="menu__item-price">{formatPrice(item.price, t)}</span>
                      </>
                    )}
                  </div>
                  <p>{item.description[language]}</p>
                  {item.allergens.length > 0 && (
                    <p className="menu__item-allergens">
                      {item.allergens.map((code) => (
                        <span key={code}>{code}</span>
                      ))}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )
      })}
      <section className="menu__allergens">
        <TranslatedText as="h2" id="menu.allergens.title" />
        <TranslatedText as="p" id="menu.allergens.intro" />
        <ul className="menu__allergens-list">
          {allergenKeys.map((key) => (
            <li key={key}>
              <strong>{allergenCodes[key]} — {t(`menu.allergens.items.${key}.title`)}:</strong> {t(`menu.allergens.items.${key}.description`)}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
