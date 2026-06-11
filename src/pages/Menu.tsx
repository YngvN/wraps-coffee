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

/** A single menu item, identified by its translation key with an optional price override. */
interface MenuItem {
  key: string
  /** Price for this item. Falls back to the parent category's `price` when omitted. */
  price?: Price
}

/** A menu category: its translation key, illustration, default price, and items. */
interface MenuCategory {
  key: string
  image: string
  /** Default price applied to the whole category, shown once in the header. */
  price?: Price
  items: MenuItem[]
}

/** Allergen entries shown in the allergens note at the end of the menu. */
const allergenKeys = ['cashews', 'milk', 'gluten', 'fishShellfish'] as const

/** Full menu content, grouped by category, in the order shown on the page. */
const categories: MenuCategory[] = [
  {
    key: 'salads',
    image: saladsImage,
    price: 189,
    items: [{ key: 'shrimpSalad' }, { key: 'tunaSalad' }, { key: 'caesarSalad' }, { key: 'fetaSalad' }],
  },
  {
    key: 'wraps',
    image: wrapsBaguettesImage,
    price: { takeaway: 149, eatIn: 159 },
    items: [
      { key: 'chickenWrap' },
      { key: 'tunaWrap' },
      { key: 'vegetarianWrap' },
      { key: 'chickenFajitasWrap' },
      { key: 'chickenFetaWrap' },
      { key: 'chickenTzatzikiWrap' },
      { key: 'chickenTandooriWrap' },
      { key: 'chickenCurryWrap' },
      { key: 'chickenAioliWrap' },
      { key: 'pulledPorkWrap' },
      { key: 'chipotleBeefWrap' },
      { key: 'mexicanTacoWrap' },
      { key: 'hamCheeseWrap' },
    ],
  },
  {
    key: 'baguettes',
    image: wrapsBaguettesImage,
    price: 119,
    items: [
      { key: 'shrimpBaguette' },
      { key: 'tunaBaguette' },
      { key: 'hamBaguette' },
      { key: 'tandooriChickenBaguette' },
      { key: 'fetaBaguette' },
      { key: 'chickenBaguette' },
      { key: 'chimichurriBaguette' },
      { key: 'eggTomatoBaguette' },
      { key: 'mozzarellaBaguette' },
    ],
  },
  {
    key: 'pizza',
    image: pizzaImage,
    price: { takeaway: 179, eatIn: 192 },
    items: [{ key: 'margherita' }, { key: 'chickenPizza' }, { key: 'parma' }],
  },
  {
    key: 'nachos',
    image: nachosImage,
    price: { takeaway: 189, eatIn: 199 },
    items: [
      { key: 'chickenNachos' },
      { key: 'chickenFajitasNachos' },
      { key: 'chickenTandooriNachos' },
      { key: 'chickenTzatzikiNachos' },
      { key: 'chickenCurryNachos' },
      { key: 'chickenAioliNachos' },
      { key: 'chickenFetaNachos' },
      { key: 'vegetarianNachos' },
      { key: 'mexicanNachos' },
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
      { key: 'macchiato', price: { takeaway: 47, eatIn: 52 } },
      { key: 'cortado', price: { takeaway: 47, eatIn: 52 } },
      { key: 'cappuccino', price: { takeaway: 50, eatIn: 55 } },
      { key: 'cafeLatte', price: { takeaway: 50, eatIn: 55 } },
      { key: 'chaiLatte', price: { takeaway: 55, eatIn: 60 } },
      { key: 'mocha', price: { takeaway: 55, eatIn: 60 } },
      { key: 'iceCafe', price: { takeaway: 60, eatIn: 55 } },
      { key: 'flatWhite', price: { takeaway: 45, eatIn: 50 } },
      { key: 'tea', price: { takeaway: 50, eatIn: 50 } },
    ],
  },
  {
    key: 'smoothies',
    image: smoothieImage,
    price: { takeaway: 89, eatIn: 99 },
    items: [{ key: 'orangeStrawberryBanana' }, { key: 'orangeBlueberryRaspberry' }, { key: 'orangeTzatzikiPesto' }],
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
            <div className="menu__category-text">
              <h2>{t(`menu.categories.${category.key}.title`)}</h2>
              <p>{t(`menu.categories.${category.key}.description`)}</p>
            </div>
            {category.price !== undefined && <span className="menu__category-price">{formatPrice(category.price)}</span>}
          </div>
          <ul className="menu__items">
            {category.items.map((item) => (
              <li key={item.key} className="menu__item">
                <div className="menu__item-details">
                  <h3>{t(`menu.items.${category.key}.${item.key}.title`)}</h3>
                  <p>{t(`menu.items.${category.key}.${item.key}.description`)}</p>
                </div>
                {item.price !== undefined && <span className="menu__item-price">{formatPrice(item.price)}</span>}
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
              <strong>{t(`menu.allergens.items.${key}.title`)}:</strong> {t(`menu.allergens.items.${key}.description`)}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
