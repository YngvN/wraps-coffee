import { useLanguage } from '../../i18n'
import './EventStatusBadge.scss'

type EventStatusBadgeStatus = 'cancelled' | 'postponed'

interface EventStatusBadgeProps {
  status: EventStatusBadgeStatus
  /** Extra context appended after the label — used to show a postponed event's own new date where nothing else on the slide already shows it (e.g. `EventImageSlide`, which has no date line of its own). Omit where the date is already visible elsewhere (it already resolves to the postponed date via `getUpcomingEvents`/`getOccurrencesInRange`). */
  detail?: string
}

const LABEL_KEY: Record<EventStatusBadgeStatus, string> = {
  cancelled: 'admin.screens.eventCancelledLabel',
  postponed: 'admin.screens.eventPostponedLabel',
}

/** A small "Cancelled"/"Postponed" indicator for an event slide entry (see `UpcomingEvent.status`) — styled with the screen's own CSS variables (not the admin `Badge` component, whose fixed theme colors aren't tuned for an arbitrary admin-chosen screen background). */
export function EventStatusBadge({ status, detail }: EventStatusBadgeProps) {
  const { t } = useLanguage()
  return (
    <span className={`event-status-badge event-status-badge--${status}`}>
      {t(LABEL_KEY[status])}
      {detail && ` · ${detail}`}
    </span>
  )
}
