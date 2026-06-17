import { motion } from 'framer-motion'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import heroBackground from '../assets/images/hero/hero-background.jpg'
import { DeliveryLinks, EventDetailsModal, EventGallery, InstagramCarousel, LocationMap, RatingBadges, ReviewCarousel, TranslatedText } from '../components'
import eventsData from '../data/events.json'
import ratingsData from '../data/ratings.json'
import reviewsData from '../data/reviews.json'
import { useIsScrolled } from '../hooks/useIsScrolled'
import { useReveal } from '../hooks/useReveal'
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
  const upcomingEvents = getUpcomingEvents(eventsData, 3)
  const isScrolled = useIsScrolled()
  const reveal = useReveal()
  const [selectedEvent, setSelectedEvent] = useState<EventRecord | null>(null)

  return (
    <div className="home">
      <div className={`home__hero-wrapper${isScrolled ? ' home__hero-wrapper--scrolled' : ''}`}>
        <section
          className={`home__hero${isScrolled ? ' home__hero--scrolled' : ''}`}
          style={{ backgroundImage: `url(${heroBackground})` }}
        >
          <div className="home__hero-inner">
            <div className="home__hero-content">
              <TranslatedText as="h1" id="home.hero.title" />
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
          <button
            type="button"
            className="home__hero-scroll"
            aria-label={t('home.hero.scrollDown')}
            onClick={() => window.scrollTo({ top: 20, behavior: 'smooth' })}
          >
            <svg width="64" height="32" viewBox="0 0 64 32" fill="none" aria-hidden="true">
              <polyline
                points="4,6 32,26 60,6"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </section>
      </div>

      <div className="home__container">
        <section className="home__events">
          <motion.div className="home__events-gallery" {...reveal('up')}>
            <EventGallery events={upcomingEvents} onSelectEvent={setSelectedEvent} />
          </motion.div>
        </section>

        <section className="home__menu">
          <motion.div className="home__menu-reviews" {...reveal('up')}>
            <ReviewCarousel reviews={reviewsData[language] ?? reviewsData.en} />
            <RatingBadges className="home__menu-ratings" ratings={ratingsData} />
          </motion.div>
          <DeliveryLinks className="home__menu-delivery" />
        </section>

        <motion.div className="home__instagram" {...reveal('up')}>
          <InstagramCarousel />
        </motion.div>

        <section className="home__location">
          <motion.div {...reveal('up')}>
            <a className="home__location-link" href={MAPS_URL} target="_blank" rel="noopener noreferrer">
              <TranslatedText as="p" id="home.location.intro" />
            </a>
          </motion.div>
          <motion.div {...reveal('up', 0.1)}>
            <LocationMap popupText={`${t('footer.company')} – ${t('footer.address')}`} />
          </motion.div>
        </section>
      </div>

      <EventDetailsModal event={selectedEvent} onClose={() => setSelectedEvent(null)} />
    </div>
  )
}
