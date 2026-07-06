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
 * Preview of upcoming events, titled "What's happening". On narrow screens
 * it's a plain column list of the next events; on wide screens it becomes a
 * gallery with a large picture on one side and the list on the other, the
 * picture swapping to match whichever event is hovered or focused.
 */
export function EventGallery({ events, onSelectEvent, className }: EventGalleryProps) {
  const { t, language } = useLanguage()
  // Tracks the event whose picture is shown in the wide-screen gallery: the
  // most recently hovered/focused event, defaulting to the soonest one and
  // staying put once the mouse leaves rather than resetting.
  const [activeEventId, setActiveEventId] = useState<string | null>(null)
  const galleryEvent = events.find(({ event }) => event.eventID === activeEventId) ?? events[0]

  if (events.length === 0) return null

  return (
    <div className={['event-gallery', className].filter(Boolean).join(' ')}>
      <h2 className="event-gallery__heading">{t('home.events.heading')}</h2>
      <div className="event-gallery__content">
        <img
          key={galleryEvent.event.eventID}
          className="event-gallery__gallery-image"
          src={galleryEvent.event.imageUrl}
          alt=""
        />
        <div className="event-gallery__list">
          {events.map(({ event, occursAt }, index) => (
            <button
              key={event.eventID}
              type="button"
              className={`event-gallery__item${event.eventID === galleryEvent.event.eventID ? ' event-gallery__item--active' : ''}`}
              onClick={() => onSelectEvent(event)}
              onMouseEnter={() => setActiveEventId(event.eventID)}
              onFocus={() => setActiveEventId(event.eventID)}
            >
              <div className="event-gallery__details">
                {index === 0 && <span className="event-gallery__label">{t('home.hero.upcomingEvent')}</span>}
                <h3>{event.title[language]}</h3>
                <p className="event-gallery__date">
                  {formatEventDate(occursAt, language, { weekday: 'short', day: 'numeric', month: 'short' })}, {event.time}
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
