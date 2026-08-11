import { useDisplayImageCap } from '../../hooks/useDisplayImageCap'
import { useEvents } from '../../hooks/useEvents'
import { useRenderedImageWidth } from '../../hooks/useRenderedImageWidth'
import { useLanguage } from '../../i18n'
import { formatEventDate, getNthUpcomingEvent } from '../../utils/events'
import { pickImageVariant } from '../../utils/responsiveImage'
import { EventStatusBadge } from './EventStatusBadge'
import './EventImageSlide.scss'

interface EventImageSlideProps {
  /** 1-based position in the upcoming event timeline (see `getUpcomingEvents`). */
  eventOrdinal: number
}

/** Fullscreen photo of a single upcoming event, for an `'event'` slot's own `'image'` display mode — renders nothing if fewer than `eventOrdinal` events exist in the timeline (same "unconfigured → blank" posture as transit/messageboard with nothing picked yet). A postponed entry's badge also carries its own new date as extra context, since this slide has no date line of its own to already show it. */
export function EventImageSlide({ eventOrdinal }: EventImageSlideProps) {
  const { language } = useLanguage()
  const [events] = useEvents()
  // Both above the `!entry` early return below — a hook can't be called conditionally.
  const { ref: paneRef, width: renderedWidth } = useRenderedImageWidth<HTMLDivElement>()
  const maxImagePx = useDisplayImageCap()
  const entry = getNthUpcomingEvent(events, eventOrdinal)
  if (!entry) return null

  return (
    <div ref={paneRef} className="event-image-slide">
      <img className="event-image-slide__image" src={pickImageVariant(entry.event.imageUrl, renderedWidth, maxImagePx)} alt="" />
      {entry.status === 'cancelled' && <EventStatusBadge status="cancelled" />}
      {entry.status === 'postponed' && (
        <EventStatusBadge status="postponed" detail={formatEventDate(entry.occursAt, language, { day: 'numeric', month: 'long' })} />
      )}
    </div>
  )
}
