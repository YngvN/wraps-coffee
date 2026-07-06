import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import drinksImage from '../assets/images/menu/drinks.svg'
import nachosImage from '../assets/images/menu/nachos.svg'
import pizzaImage from '../assets/images/menu/pizza.svg'
import saladsImage from '../assets/images/menu/salads.svg'
import smoothieImage from '../assets/images/menu/smoothie.svg'
import wrapsBaguettesImage from '../assets/images/menu/wraps-baguettes.svg'
import { TranslatedText } from '../components'
import { useLanguage } from '../i18n'
import './Menu.scss'

/** A price in NOK: either a single amount, or separate takeaway / eat-in amounts. */
type Price = number | { takeaway: number; eatIn: number }

/** Abbreviated allergen code shown under a menu item, expanded in the legend at the end of the page. */
type AllergenCode = 'G' | 'M' | 'F' | 'N'

/** A single menu item, identified by its translation key with an optional price override. */
interface MenuItem {
  key: string
  /** Price for this item. Falls back to the parent category's `price` when omitted. */
  price?: Price
  /** Allergen codes present in this item, shown under its description. */
  allergens?: AllergenCode[]
}

/** A menu category: its translation key, illustration, default price, and items. */
interface MenuCategory {
  key: string
  image: string
  /** Default price applied to the whole category, shown once in the header. */
  price?: Price
  items: MenuItem[]
}

/** Allergen entries shown in the legend at the end of the menu, in the order their codes are introduced. */
const allergenKeys = ['gluten', 'milk', 'fishShellfish', 'cashews'] as const

/** Maps each allergen legend entry to the short code shown under menu items. */
const allergenCodes: Record<(typeof allergenKeys)[number], AllergenCode> = {
  gluten: 'G',
  milk: 'M',
  fishShellfish: 'F',
  cashews: 'N',
}

/** Full menu content, grouped by category, in the order shown on the page. */
const categories: MenuCategory[] = [
  {
    key: 'salads',
    image: saladsImage,
    price: 189,
    items: [
      { key: 'shrimpSalad', allergens: ['F'] },
      { key: 'tunaSalad', allergens: ['M', 'F'] },
      { key: 'caesarSalad', allergens: ['G', 'M'] },
      { key: 'fetaSalad', allergens: ['M'] },
    ],
  },
  {
    key: 'wraps',
    image: wrapsBaguettesImage,
    price: { takeaway: 149, eatIn: 159 },
    items: [
      { key: 'chickenWrap', allergens: ['G', 'M'] },
      { key: 'tunaWrap', allergens: ['G', 'M', 'F'] },
      { key: 'vegetarianWrap', allergens: ['G', 'M'] },
      { key: 'chickenFajitasWrap', allergens: ['G', 'M'] },
      { key: 'chickenFetaWrap', allergens: ['G', 'M'] },
      { key: 'chickenTzatzikiWrap', allergens: ['G', 'M'] },
      { key: 'chickenTandooriWrap', allergens: ['G', 'M', 'N'] },
      { key: 'chickenCurryWrap', allergens: ['G', 'M'] },
      { key: 'chickenAioliWrap', allergens: ['G', 'M'] },
      { key: 'pulledPorkWrap', allergens: ['G', 'M'] },
      { key: 'chipotleBeefWrap', allergens: ['G', 'M'] },
      { key: 'mexicanTacoWrap', allergens: ['G', 'M'] },
      { key: 'hamCheeseWrap', allergens: ['G', 'M'] },
    ],
  },
  {
    key: 'baguettes',
    image: wrapsBaguettesImage,
    price: 119,
    items: [
      { key: 'shrimpBaguette', allergens: ['G', 'F'] },
      { key: 'tunaBaguette', allergens: ['G', 'M', 'F'] },
      { key: 'hamBaguette', allergens: ['G'] },
      { key: 'tandooriChickenBaguette', allergens: ['G', 'N'] },
      { key: 'fetaBaguette', allergens: ['G', 'M'] },
      { key: 'chickenBaguette', allergens: ['G'] },
      { key: 'chimichurriBaguette', allergens: ['G'] },
      { key: 'eggTomatoBaguette', allergens: ['G'] },
      { key: 'mozzarellaBaguette', allergens: ['G', 'M'] },
    ],
  },
  {
    key: 'pizza',
    image: pizzaImage,
    price: { takeaway: 179, eatIn: 192 },
    items: [
      { key: 'margherita', allergens: ['G', 'M'] },
      { key: 'chickenPizza', allergens: ['G', 'M'] },
      { key: 'parma', allergens: ['G', 'M'] },
    ],
  },
  {
    key: 'nachos',
    image: nachosImage,
    price: { takeaway: 189, eatIn: 199 },
    items: [
      { key: 'chickenNachos', allergens: ['M'] },
      { key: 'chickenFajitasNachos', allergens: ['M'] },
      { key: 'chickenTandooriNachos', allergens: ['M', 'N'] },
      { key: 'chickenTzatzikiNachos', allergens: ['M'] },
      { key: 'chickenCurryNachos', allergens: ['M'] },
      { key: 'chickenAioliNachos', allergens: ['M'] },
      { key: 'chickenFetaNachos', allergens: ['M'] },
      { key: 'vegetarianNachos', allergens: ['M'] },
      { key: 'mexicanNachos', allergens: ['M'] },
    ],
  },
  {
    key: 'drinks',
    image: drinksImage,
    items: [
      { key: 'espresso', price: { takeaway: 40, eatIn: 45 } },
      { key: 'longBlack', price: { takeaway: 45, eatIn: 50 } },
      { key: 'redEye', price: { takeaway: 45, eatIn: 50 } },
      { key: 'americano', price: { takeaway: 40, eatIn: 45 } },
      { key: 'macchiato', price: { takeaway: 47, eatIn: 52 }, allergens: ['M'] },
      { key: 'cortado', price: { takeaway: 47, eatIn: 52 }, allergens: ['M'] },
      { key: 'cappuccino', price: { takeaway: 50, eatIn: 55 }, allergens: ['M'] },
      { key: 'cafeLatte', price: { takeaway: 50, eatIn: 55 }, allergens: ['M'] },
      { key: 'chaiLatte', price: { takeaway: 55, eatIn: 60 }, allergens: ['M'] },
      { key: 'mocha', price: { takeaway: 55, eatIn: 60 }, allergens: ['M'] },
      { key: 'iceCafe', price: { takeaway: 60, eatIn: 55 }, allergens: ['M'] },
      { key: 'flatWhite', price: { takeaway: 45, eatIn: 50 }, allergens: ['M'] },
      { key: 'tea', price: { takeaway: 50, eatIn: 50 } },
    ],
  },
  {
    key: 'smoothies',
    image: smoothieImage,
    price: { takeaway: 89, eatIn: 99 },
    items: [
      { key: 'orangeStrawberryBanana' },
      { key: 'orangeBlueberryRaspberry' },
      { key: 'orangeTzatzikiPesto', allergens: ['M', 'N'] },
    ],
  },
]

/**
 * Full menu page for Wraps & Coffee, grouped into categories (salads, wraps,
 * baguettes, pizza, nachos, coffee & drinks, smoothies), followed by an
 * allergens note. Scrolls to the category in the URL hash (e.g. `/menu#pizza`)
 * when navigated to from the homepage.
 */
export function Menu() {
  const { t } = useLanguage()
  const { hash } = useLocation()

  useEffect(() => {
    if (!hash) return
    const target = document.getElementById(hash.slice(1))
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [hash])

  /** Formats a `Price` as a single "X kr" or dual "X / Y kr" string. */
  const formatPrice = (price: Price) =>
    typeof price === 'number' ? t('menu.price', { price }) : t('menu.priceDual', { takeaway: price.takeaway, eatIn: price.eatIn })

  return (
    <div className="menu">
      <TranslatedText as="h1" id="menu.title" />
      <TranslatedText as="p" id="menu.intro" />
      <TranslatedText as="p" className="menu__price-legend" id="menu.priceLegend" />
      {categories.map((category) => (
        <section key={category.key} id={category.key} className="menu__category">
          <div className="menu__category-header">
            <img className="menu__category-image" src={category.image} alt="" />
            <h2>{t(`menu.categories.${category.key}.title`)}</h2>
            <p>{t(`menu.categories.${category.key}.description`)}</p>
            {category.price !== undefined && <span className="menu__category-price">{formatPrice(category.price)}</span>}
          </div>
          <ul className="menu__items">
            {category.items.map((item) => (
              <li key={item.key} className="menu__item">
                <div className="menu__item-line">
                  <h3>{t(`menu.items.${category.key}.${item.key}.title`)}</h3>
                  {item.price !== undefined && (
                    <>
                      <span className="menu__item-leader" />
                      <span className="menu__item-price">{formatPrice(item.price)}</span>
                    </>
                  )}
                </div>
                <p>{t(`menu.items.${category.key}.${item.key}.description`)}</p>
                {item.allergens !== undefined && item.allergens.length > 0 && (
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
      ))}
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
