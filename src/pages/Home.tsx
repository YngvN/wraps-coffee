import { useState } from 'react'
import { Link } from 'react-router-dom'
import heroBackground from '../assets/images/hero/hero-background.jpg'
import drinksImage from '../assets/images/menu/drinks.svg'
import nachosImage from '../assets/images/menu/nachos.svg'
import pizzaImage from '../assets/images/menu/pizza.svg'
import saladsImage from '../assets/images/menu/salads.svg'
import smoothieImage from '../assets/images/menu/smoothie.svg'
import wrapsBaguettesImage from '../assets/images/menu/wraps-baguettes.svg'
import { Card, DeliveryLinks, EventDetailsModal, LocationMap, TranslatedText } from '../components'
import eventsData from '../data/events.json'
import { useIsScrolled } from '../hooks/useIsScrolled'
import { useLanguage } from '../i18n'
import { formatEventDate, getUpcomingEvents, type EventRecord } from '../utils/events'
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

/**
 * Homepage for Wraps & Coffee: a hero introduction with a preview of the next
 * upcoming events, and the menu offerings.
 */
export function Home() {
  const { t, language } = useLanguage()
  const upcomingEvents = getUpcomingEvents(eventsData, 3)
  const isScrolled = useIsScrolled()
  const [hoveredEventId, setHoveredEventId] = useState<string | null>(null)
  const [selectedEvent, setSelectedEvent] = useState<EventRecord | null>(null)
  const galleryEvent = upcomingEvents.find(({ event }) => event.eventID === hoveredEventId) ?? upcomingEvents[0]

  return (
    <div className="home">
      <div className={`home__hero-wrapper${isScrolled ? ' home__hero-wrapper--scrolled' : ''}`}>
        <section
          className={`home__hero${isScrolled ? ' home__hero--scrolled' : ''}`}
          style={{ backgroundImage: `url(${heroBackground})` }}
        >
          <div className="home__hero-content">
            <TranslatedText as="h1" id="home.hero.title" />
            <TranslatedText as="p" className="home__slogan" id="home.hero.slogan" />
            <TranslatedText as="p" id="home.hero.description" />
            <Link className="home__cta" to="/menu">
              <span className="home__cta-label">{t('home.hero.cta')}</span>
            </Link>
          </div>
          <div className="home__hero-event">
            <img className="home__hero-event-image" src={upcomingEvents[0].event.imageUrl} alt="" />
            <img className="home__hero-event-gallery-image" src={galleryEvent.event.imageUrl} alt="" />
            <div className="home__hero-event-list">
              {upcomingEvents.map(({ event, occursAt }, index) => (
                <button
                  key={event.eventID}
                  type="button"
                  className={`home__hero-event-item${index === 0 ? ' home__hero-event-item--featured' : ' home__hero-event-item--upcoming'}`}
                  onClick={() => setSelectedEvent(event)}
                  onMouseEnter={() => setHoveredEventId(event.eventID)}
                  onMouseLeave={() => setHoveredEventId(null)}
                  onFocus={() => setHoveredEventId(event.eventID)}
                  onBlur={() => setHoveredEventId(null)}
                >
                  <div className="home__hero-event-details">
                    {index === 0 && <span className="home__hero-event-label">{t('home.hero.upcomingEvent')}</span>}
                    <h3>{event.title}</h3>
                    <p className="home__hero-event-date">
                      {formatEventDate(occursAt, language, { weekday: 'short', day: 'numeric', month: 'short' })}, {event.time}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
          <div className="home__hero-secondary-actions">
            <DeliveryLinks />
            <Link className="home__cta" to="/menu">
              <span className="home__cta-label">{t('home.hero.ctaPickup')}</span>
            </Link>
          </div>
        </section>
      </div>

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

      <EventDetailsModal event={selectedEvent} onClose={() => setSelectedEvent(null)} />
    </div>
  )
}
