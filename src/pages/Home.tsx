import { useState } from 'react'
import { Link } from 'react-router-dom'
import logoTemp from '../assets/images/logo/logo-temp.png'
import { DeliveryLinks, EventDetailsModal, EventGallery, InstagramCarousel, LocationMap, RatingBadges, ReviewCarousel, TranslatedText } from '../components'
import { useEvents } from '../hooks/useEvents'
import { useRatings } from '../hooks/useRatings'
import { useReviews } from '../hooks/useReviews'
import { useLanguage } from '../i18n'
import { getUpcomingEvents, type EventRecord } from '../utils/events'
import { MAPS_URL } from '../utils/location'
import './Home.scss'

/**
 * Homepage for Wraps & Coffee: a hero introduction with a preview of the next
 * upcoming events, and the menu offerings.
 */
export function Home() {
  const { t, language } = useLanguage()
  const [events] = useEvents()
  const [reviewsData] = useReviews()
  const [ratingsData] = useRatings()
  const upcomingEvents = getUpcomingEvents(events, 5)
  const [selectedEvent, setSelectedEvent] = useState<EventRecord | null>(null)

  return (
    <div className="home">
      <section className="home__hero">
        <img src={logoTemp} alt={t('home.hero.title')} className="home__hero-logo" />
        <div className="home__hero-inner">
          <div className="home__hero-content">
            <TranslatedText as="p" className="home__slogan" id="home.hero.slogan" />
            <TranslatedText as="p" id="home.hero.description" />
            <div className="home__hero-cta-group">
              <Link className="home__cta" to="/menu">
                <span className="home__cta-label">{t('home.hero.cta')}</span>
              </Link>
              <Link className="home__cta" to="/menu">
                <span className="home__cta-label">{t('home.menu.cta')}</span>
              </Link>
            </div>
          </div>
          <div className="home__hero-delivery">
            <DeliveryLinks />
          </div>
        </div>
      </section>

      <div className="home__container">
        <section className="home__events">
          <div className="home__events-gallery">
            <EventGallery events={upcomingEvents} onSelectEvent={setSelectedEvent} />
          </div>
        </section>

        <div className="home__instagram">
          <InstagramCarousel />
        </div>

        <section className="home__menu">
          <div className="home__menu-reviews">
            <ReviewCarousel reviews={reviewsData[language] ?? reviewsData.en} />
            <RatingBadges className="home__menu-ratings" ratings={ratingsData} />
          </div>
        </section>

        <section className="home__location">
          <div>
            <a className="home__location-link" href={MAPS_URL} target="_blank" rel="noopener noreferrer">
              <TranslatedText as="p" id="home.location.intro" />
            </a>
          </div>
          <div>
            <LocationMap popupText={`${t('footer.company')} – ${t('footer.address')}`} />
          </div>
        </section>
      </div>

      <EventDetailsModal event={selectedEvent} onClose={() => setSelectedEvent(null)} />
    </div>
  )
}
