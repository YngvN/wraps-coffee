import { useState } from 'react'
import { Link } from 'react-router-dom'
import heroBackground from '../assets/images/hero/hero-background.jpg'
import { DeliveryLinks, EventDetailsModal, LocationMap, ReviewCarousel, TranslatedText } from '../components'
import eventsData from '../data/events.json'
import reviewsData from '../data/reviews.json'
import { useIsScrolled } from '../hooks/useIsScrolled'
import { useLanguage } from '../i18n'
import { formatEventDate, getUpcomingEvents, type EventRecord } from '../utils/events'
import './Home.scss'

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
        <div className="home__menu-content">
          <ReviewCarousel className="home__menu-reviews" reviews={reviewsData} />
          <div className="home__menu-text">
            <TranslatedText as="p" id="home.menu.summary" />
            <div className="home__menu-actions">
              <Link className="home__cta" to="/menu">
                <span className="home__cta-label">{t('home.menu.cta')}</span>
              </Link>
              <Link className="home__cta home__cta--secondary" to="/menu">
                <span className="home__cta-label">{t('home.hero.cta')}</span>
              </Link>
            </div>
          </div>
        </div>
        <DeliveryLinks className="home__menu-delivery" />
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
