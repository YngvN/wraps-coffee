import { useState } from 'react'
import { useLanguage } from '../i18n'
import { formatEventDate, type EventRecord, type UpcomingEvent } from '../utils/events'
import './EventGallery.scss'

interface EventGalleryProps {
  /** Upcoming events to preview, soonest first. The first entry is featured. */
  events: UpcomingEvent[]
  /** Called when an event card is clicked, to open its details. */
  onSelectEvent: (event: EventRecord) => void
  className?: string
}

/**
 * Preview of upcoming events. By default it's a small card for the soonest
 * event only; on wide screens it becomes a gallery with a large picture on
 * one side and the next events listed on the other, the picture swapping to
 * match whichever event is hovered or focused.
 */
export function EventGallery({ events, onSelectEvent, className }: EventGalleryProps) {
  const { t, language } = useLanguage()
  const [hoveredEventId, setHoveredEventId] = useState<string | null>(null)
  const galleryEvent = events.find(({ event }) => event.eventID === hoveredEventId) ?? events[0]

  if (events.length === 0) return null

  return (
    <div className={['event-gallery', className].filter(Boolean).join(' ')}>
      <img className="event-gallery__image" src={events[0].event.imageUrl} alt="" />
      <img className="event-gallery__gallery-image" src={galleryEvent.event.imageUrl} alt="" />
      <div className="event-gallery__list">
        {events.map(({ event, occursAt }, index) => (
          <button
            key={event.eventID}
            type="button"
            className={`event-gallery__item${index === 0 ? ' event-gallery__item--featured' : ' event-gallery__item--upcoming'}`}
            onClick={() => onSelectEvent(event)}
            onMouseEnter={() => setHoveredEventId(event.eventID)}
            onMouseLeave={() => setHoveredEventId(null)}
            onFocus={() => setHoveredEventId(event.eventID)}
            onBlur={() => setHoveredEventId(null)}
          >
            <div className="event-gallery__details">
              {index === 0 && <span className="event-gallery__label">{t('home.hero.upcomingEvent')}</span>}
              <h3>{event.title}</h3>
              <p className="event-gallery__date">
                {formatEventDate(occursAt, language, { weekday: 'short', day: 'numeric', month: 'short' })}, {event.time}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
