import { useEvents } from '../../hooks/useEvents'
import { useLanguage } from '../../i18n'
import { DEFAULT_EVENT_CALENDAR_COUNT } from '../../types/screen'
import { formatEventDate, getUpcomingEvents } from '../../utils/events'
import { EventStatusBadge } from './EventStatusBadge'
import './EventCalendarSlide.scss'

interface EventCalendarSlideProps {
  /** How many upcoming timeline entries to show. Falls back to `DEFAULT_EVENT_CALENDAR_COUNT`. */
  count?: number
}

/** Fullscreen rendering of the next upcoming events, for an `'event'` slot's own `'calendar'` display mode. A cancelled entry stays in its own list position (see `getUpcomingEvents`) marked with `EventStatusBadge` instead of being dropped; a postponed entry's date line already shows its own rescheduled date/time (`occursAt`), with the same badge alongside it as extra context. */
export function EventCalendarSlide({ count }: EventCalendarSlideProps) {
  const { t, language } = useLanguage()
  const [events] = useEvents()
  const upcomingEvents = getUpcomingEvents(events, count ?? DEFAULT_EVENT_CALENDAR_COUNT)

  return (
    <div className="events-slide">
      <h1>{t('home.events.heading')}</h1>
      <ul className="events-slide__list">
        {upcomingEvents.map(({ event, occursAt, status }) => (
          <li key={event.eventID} className={`events-slide__item${status === 'cancelled' ? ' events-slide__item--cancelled' : ''}`}>
            <img className="events-slide__image" src={event.imageUrl} alt="" />
            <div className="events-slide__body">
              <h2>{event.title[language]}</h2>
              <p className="events-slide__date">
                {formatEventDate(occursAt, language, { weekday: 'long', day: 'numeric', month: 'long' })} ·{' '}
                {formatEventDate(occursAt, language, { hour: '2-digit', minute: '2-digit' })}
                {status !== 'scheduled' && (
                  <>
                    {' '}
                    <EventStatusBadge status={status} />
                  </>
                )}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
