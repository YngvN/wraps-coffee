import { useEvents } from '../../hooks/useEvents'
import { useLanguage } from '../../i18n'
import { formatEventDate, getUpcomingEvents } from '../../utils/events'
import './EventsSlide.scss'

/** Number of upcoming events shown on the slide. */
const EVENT_COUNT = 4

/** Fullscreen rendering of the next upcoming events, for a screen display's "events" slot. */
export function EventsSlide() {
  const { t, language } = useLanguage()
  const [events] = useEvents()
  const upcomingEvents = getUpcomingEvents(events, EVENT_COUNT)

  return (
    <div className="events-slide">
      <h1>{t('home.events.heading')}</h1>
      <ul className="events-slide__list">
        {upcomingEvents.map(({ event, occursAt }) => (
          <li key={event.eventID} className="events-slide__item">
            <img className="events-slide__image" src={event.imageUrl} alt="" />
            <div className="events-slide__body">
              <h2>{event.title[language]}</h2>
              <p className="events-slide__date">
                {formatEventDate(occursAt, language, { weekday: 'long', day: 'numeric', month: 'long' })} · {event.time}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
