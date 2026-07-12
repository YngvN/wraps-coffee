import { useEvents } from '../../hooks/useEvents'
import { useLanguage } from '../../i18n'
import { formatEventDate, getNthUpcomingEvent } from '../../utils/events'
import { EventStatusBadge } from './EventStatusBadge'
import './EventDetailsSlide.scss'

interface EventDetailsSlideProps {
  /** 1-based position in the upcoming event timeline (see `getUpcomingEvents`). */
  eventOrdinal: number
}

/** Fullscreen title/date/description of a single upcoming event, for an `'event'` slot's own `'details'` display mode — renders nothing if fewer than `eventOrdinal` events exist in the timeline. A cancelled entry shows `EventStatusBadge` instead of a date/time line, since it's no longer happening. A postponed entry keeps its date/time line (already its own rescheduled date via `occursAt`), with the same badge next to the title for extra context. */
export function EventDetailsSlide({ eventOrdinal }: EventDetailsSlideProps) {
  const { language } = useLanguage()
  const [events] = useEvents()
  const entry = getNthUpcomingEvent(events, eventOrdinal)
  if (!entry) return null

  const { event, occursAt, status } = entry

  return (
    <div className="event-details-slide">
      <h1>
        {event.title[language]}
        {status === 'postponed' && <EventStatusBadge status="postponed" />}
      </h1>
      {status === 'cancelled' ? (
        <EventStatusBadge status="cancelled" />
      ) : (
        <p className="event-details-slide__date">
          {formatEventDate(occursAt, language, { weekday: 'long', day: 'numeric', month: 'long' })} ·{' '}
          {formatEventDate(occursAt, language, { hour: '2-digit', minute: '2-digit' })}
        </p>
      )}
      {event.description[language] && <p className="event-details-slide__description">{event.description[language]}</p>}
    </div>
  )
}
