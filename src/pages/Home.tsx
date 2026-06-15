import { motion } from 'framer-motion'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import heroBackground from '../assets/images/hero/hero-background.jpg'
import { DeliveryLinks, EventDetailsModal, EventGallery, LocationMap, RatingBadges, ReviewCarousel, TranslatedText } from '../components'
import eventsData from '../data/events.json'
import ratingsData from '../data/ratings.json'
import reviewsData from '../data/reviews.json'
import { useIsScrolled } from '../hooks/useIsScrolled'
import { useReveal } from '../hooks/useReveal'
import { useLanguage } from '../i18n'
import { getUpcomingEvents, type EventRecord } from '../utils/events'
import './Home.scss'

/**
 * Homepage for Wraps & Coffee: a hero introduction with a preview of the next
 * upcoming events, and the menu offerings.
 */
export function Home() {
  const { t } = useLanguage()
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
              <Link className="home__cta" to="/menu">
                <span className="home__cta-label">{t('home.hero.cta')}</span>
              </Link>
            </div>
            <EventGallery className="home__hero-event" events={upcomingEvents} onSelectEvent={setSelectedEvent} />
            <div className="home__hero-secondary-actions">
              <DeliveryLinks />
              <Link className="home__cta" to="/menu">
                <span className="home__cta-label">{t('home.hero.ctaPickup')}</span>
              </Link>
            </div>
          </div>
        </section>
      </div>

      <section className="home__menu">
        <motion.div {...reveal('up')}>
          <TranslatedText as="h2" id="home.menu.title" />
          <RatingBadges className="home__menu-ratings" ratings={ratingsData} />
        </motion.div>
        <div className="home__menu-content">
          <motion.div className="home__menu-reviews" {...reveal('left')}>
            <ReviewCarousel reviews={reviewsData} />
          </motion.div>
          <motion.div className="home__menu-text" {...reveal('right', 0.1)}>
            <TranslatedText as="p" id="home.menu.summary" />
            <div className="home__menu-actions">
              <Link className="home__cta" to="/menu">
                <span className="home__cta-label">{t('home.menu.cta')}</span>
              </Link>
              <Link className="home__cta home__cta--secondary" to="/menu">
                <span className="home__cta-label">{t('home.hero.cta')}</span>
              </Link>
            </div>
          </motion.div>
        </div>
        <DeliveryLinks className="home__menu-delivery" />
      </section>

      <section className="home__events">
        <motion.div {...reveal('up')}>
          <TranslatedText as="h2" id="home.events.title" />
        </motion.div>
        <div className="home__events-content">
          <motion.div className="home__events-text" {...reveal('left')}>
            <TranslatedText as="p" id="home.events.summary" />
            <Link className="home__cta" to="/events">
              <span className="home__cta-label">{t('home.events.cta')}</span>
            </Link>
          </motion.div>
          <motion.div className="home__events-gallery" {...reveal('right', 0.1)}>
            <EventGallery events={upcomingEvents} onSelectEvent={setSelectedEvent} />
          </motion.div>
        </div>
      </section>

      <section className="home__location">
        <motion.div {...reveal('up')}>
          <TranslatedText as="h2" id="home.location.title" />
        </motion.div>
        <motion.div {...reveal('up', 0.1)}>
          <TranslatedText as="p" id="home.location.intro" />
        </motion.div>
        <motion.div {...reveal('up', 0.2)}>
          <LocationMap popupText={`${t('footer.company')} – ${t('footer.address')}`} />
        </motion.div>
      </section>

      <EventDetailsModal event={selectedEvent} onClose={() => setSelectedEvent(null)} />
    </div>
  )
}
