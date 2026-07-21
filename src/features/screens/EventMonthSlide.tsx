import { useEvents } from '../../hooks/useEvents'
import { useLanguage } from '../../i18n'
import { formatEventDate, formatEventPrice, getEventsInMonth, isEventFree, isEventPast } from '../../utils/events'
import { EventStatusBadge } from './EventStatusBadge'
import './EventMonthSlide.scss'

interface EventMonthSlideProps {
  /** Whether each listed event also shows its own price. Falls back to `false`. */
  showPrice?: boolean
  /** Whether each listed event also shows its own description. Falls back to `false`. */
  showDescription?: boolean
}

/** Fullscreen agenda of every event in the current calendar month, for an `'event'` slot's own `'month'` display mode — headed by the month's own name, each row's date in front of its title. A cancelled entry stays in its own position (see `getEventsInMonth`), marked with `EventStatusBadge` and no price row, rather than being dropped. A postponed entry's date is already its own rescheduled one (`occursAt`), with the same badge next to its title and its price row still shown (it's still happening). An entry whose own day has already passed (`isEventPast`) is greyed out and struck through, same idea as `--cancelled` but for "this already happened" rather than "this was called off" — a full month view otherwise still lists earlier-in-the-month events once today's date has moved past them, so this is what keeps them visually distinct from what's still upcoming, without hiding the month's own history. */
export function EventMonthSlide({ showPrice, showDescription }: EventMonthSlideProps) {
  const { t, language } = useLanguage()
  const [events] = useEvents()
  const now = new Date()
  const monthEvents = getEventsInMonth(events, now)

  return (
    <div className="event-month-slide">
      <h1>{formatEventDate(now, language, { month: 'long', year: 'numeric' })}</h1>
      {monthEvents.length === 0 ? (
        <p className="event-month-slide__empty">{t('admin.screens.eventMonthNoEventsLabel')}</p>
      ) : (
        <ul className="event-month-slide__list">
          {monthEvents.map(({ event, occursAt, status }, index) => {
            const past = isEventPast(occursAt, now)
            return (
              <li
                key={`${event.eventID}-${index}`}
                className={`event-month-slide__item${status === 'cancelled' ? ' event-month-slide__item--cancelled' : ''}${past ? ' event-month-slide__item--past' : ''}`}
              >
                <span className="event-month-slide__date">{formatEventDate(occursAt, language, { weekday: 'short', day: 'numeric' })}</span>
                <div className="event-month-slide__body">
                  <h2>
                    {event.title[language]}
                    {status !== 'scheduled' && <EventStatusBadge status={status} />}
                  </h2>
                  {showPrice && status !== 'cancelled' && (
                    <p className="event-month-slide__price">
                      {isEventFree(event.price) ? t('admin.screens.eventFreeLabel') : formatEventPrice(event.price, event.currency, language)}
                    </p>
                  )}
                  {showDescription && event.description[language] && <p className="event-month-slide__description">{event.description[language]}</p>}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
