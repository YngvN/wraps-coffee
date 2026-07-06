import { useState } from 'react'
import { Badge, EventCalendar, EventDetailsModal, TranslatedText } from '../components'
import { useEvents } from '../hooks/useEvents'
import { useLanguage } from '../i18n'
import { formatEventDate, getUpcomingEvents, type EventRecord } from '../utils/events'
import './Events.scss'

/** Number of upcoming events shown as tiles below the calendar. */
const UPCOMING_TILE_COUNT = 8

/**
 * Events page: a month/week calendar of everything happening at Wraps &
 * Coffee, plus a quick-glance list of the next upcoming events as tiles.
 * Clicking a calendar entry or a tile opens the shared event details modal.
 */
export function Events() {
  const { t, language } = useLanguage()
  const [events] = useEvents()
  const [selectedEvent, setSelectedEvent] = useState<EventRecord | null>(null)
  const upcomingEvents = getUpcomingEvents(events, UPCOMING_TILE_COUNT)

  return (
    <div className="events">
      <TranslatedText as="h1" id="events.title" />
      <TranslatedText as="p" id="events.intro" />

      <EventCalendar events={events} onSelectEvent={setSelectedEvent} className="events__calendar" />

      <h2 className="events__upcoming-heading">{t('events.upcomingHeading')}</h2>
      <ul className="events__list">
        {upcomingEvents.map(({ event, occursAt }) => (
          <li key={event.eventID}>
            <button type="button" className="events__tile" onClick={() => setSelectedEvent(event)}>
              <img className="events__tile-image" src={event.imageUrl} alt="" />
              <div className="events__tile-body">
                <div className="events__tile-badges">
                  <span className="events__tile-category">{event.category}</span>
                  {event.status === 'postponed' && <Badge variant="warning">{t('events.modal.postponed')}</Badge>}
                </div>
                <h3>{event.title[language]}</h3>
                <p className="events__tile-date">
                  {formatEventDate(occursAt, language, { weekday: 'short', day: 'numeric', month: 'short' })} · {event.time}
                </p>
                <p className="events__tile-description">{event.description[language]}</p>
                <p className="events__tile-meta">
                  {event.price === 0 ? t('events.modal.free') : t('menu.price', { price: event.price })} ·{' '}
                  {t('events.modal.spotsFilled', { count: event.attendeesCount, capacity: event.capacity })}
                </p>
              </div>
            </button>
          </li>
        ))}
      </ul>

      <EventDetailsModal event={selectedEvent} onClose={() => setSelectedEvent(null)} />
    </div>
  )
}
