import { Link } from 'react-router-dom'
import heroBackground from '../assets/images/hero/hero-background.jpg'
import coffeeTastingImage from '../assets/images/events/coffee-tasting.svg'
import liveMusicImage from '../assets/images/events/live-music.svg'
import movieNightImage from '../assets/images/events/movie-night.svg'
import poetryNightImage from '../assets/images/events/poetry-night.svg'
import drinksImage from '../assets/images/menu/drinks.svg'
import nachosImage from '../assets/images/menu/nachos.svg'
import pizzaImage from '../assets/images/menu/pizza.svg'
import saladsImage from '../assets/images/menu/salads.svg'
import smoothieImage from '../assets/images/menu/smoothie.svg'
import wrapsBaguettesImage from '../assets/images/menu/wraps-baguettes.svg'
import { Card, DeliveryLinks, LocationMap, TranslatedText } from '../components'
import { useLanguage } from '../i18n'
import { EVENT_RECURRENCES, getNextEventDate } from '../utils/eventSchedule'
import './Home.scss'

/** Menu offerings shown in the "What's on the menu" section, each linking to its section on the full menu page. */
const menuItems = [
  { key: 'salads', image: saladsImage },
  { key: 'wraps', image: wrapsBaguettesImage },
  { key: 'baguettes', image: wrapsBaguettesImage },
  { key: 'pizza', image: pizzaImage },
  { key: 'nachos', image: nachosImage },
  { key: 'drinks', image: drinksImage },
  { key: 'smoothies', image: smoothieImage },
] as const

/** Recurring events at the cafe, used to find the next upcoming one to feature in the hero. */
const eventItems = [
  { key: 'poetryNight', image: poetryNightImage },
  { key: 'movieNight', image: movieNightImage },
  { key: 'liveMusic', image: liveMusicImage },
  { key: 'coffeeTasting', image: coffeeTastingImage },
] as const

/** Returns the event from `eventItems` whose next occurrence comes soonest. */
function getNextEvent() {
  return [...eventItems].sort(
    (a, b) => getNextEventDate(EVENT_RECURRENCES[a.key]).getTime() - getNextEventDate(EVENT_RECURRENCES[b.key]).getTime(),
  )[0]
}

/**
 * Homepage for Wraps & Coffee: a hero introduction with a preview of the next
 * upcoming event, and the menu offerings.
 */
export function Home() {
  const { t } = useLanguage()
  const nextEvent = getNextEvent()

  return (
    <div className="home">
      <section className="home__hero" style={{ backgroundImage: `url(${heroBackground})` }}>
        <DeliveryLinks />
        <div className="home__hero-content">
          <TranslatedText as="h1" id="home.hero.title" />
          <TranslatedText as="p" className="home__slogan" id="home.hero.slogan" />
          <TranslatedText as="p" id="home.hero.description" />
          <Link className="home__cta" to="/menu">
            {t('home.hero.cta')}
          </Link>
        </div>
        <Link className="home__hero-event" to="/events">
          <img className="home__hero-event-image" src={nextEvent.image} alt="" />
          <div className="home__hero-event-details">
            <span className="home__hero-event-label">{t('home.hero.upcomingEvent')}</span>
            <h3>{t(`events.items.${nextEvent.key}.title`)}</h3>
            <p className="home__hero-event-date">{t(`events.items.${nextEvent.key}.date`)}</p>
          </div>
        </Link>
      </section>

      <section className="home__menu">
        <TranslatedText as="h2" id="home.menu.title" />
        <TranslatedText as="p" id="home.menu.intro" />
        <div className="home__menu-grid">
          {menuItems.map(({ key, image }) => (
            <Link key={key} className="home__menu-card-link" to={`/menu#${key}`}>
              <Card className="home__menu-card">
                <img className="home__menu-image" src={image} alt="" />
                <h3>{t(`home.menu.items.${key}.title`)}</h3>
                <p>{t(`home.menu.items.${key}.description`)}</p>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      <section className="home__location">
        <TranslatedText as="h2" id="home.location.title" />
        <TranslatedText as="p" id="home.location.intro" />
        <LocationMap popupText={`${t('footer.company')} – ${t('footer.address')}`} />
      </section>
    </div>
  )
}
